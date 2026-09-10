"""
Stage 2 of the ANPR pipeline:

    5) OCR (PARSeq)          - PARSeq reads every surviving, warped plate crop.
                                PaddleOCR has been removed entirely (it crashed
                                on this Paddle build regardless of version or
                                config - see ocr_ensemble.py's module
                                docstring), so there's no second model to check
                                agreement against; every frame's PARSeq reading
                                goes straight into the pot for Stage 6.
    6) TEMPORAL AGGREGATION  - per Track_ID: collect every frame prediction,
                                drop below-confidence-threshold ones, align by
                                edit distance, then character-level majority
                                vote to settle on one final plate string. This
                                is unaffected by dropping PaddleOCR - the same
                                plate is still read across many frames, which
                                is what the vote actually relies on.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable, Optional
import cv2

from common import clean_ocr_text, vote_final_plate
from ocr_ensemble import FramePrediction, load_parseq, predict_frame

CROP_PATH_KEYS = ("crop_path", "best_crop_path")
TIMESTAMP_KEYS = ("timestamp", "best_timestamp", "first_timestamp")
TRACK_ID_KEYS = ("track_id", "vehicle_track_id")


def _first_present(row: dict, keys: tuple) -> Optional[str]:
    for k in keys:
        if row.get(k) not in (None, ""):
            return row[k]
    return None


def load_manifest(manifest_path: Path) -> list[dict]:
    """Returns a list of {"crop_path", "timestamp", "track_id"} dicts - one
    row per surviving (post-quality-gate) crop, possibly many per track_id."""
    if manifest_path.suffix.lower() == ".jsonl":
        raw_rows = []
        with open(manifest_path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    raw_rows.append(json.loads(line))
    elif manifest_path.suffix.lower() == ".csv":
        with open(manifest_path, "r", newline="") as f:
            raw_rows = list(csv.DictReader(f))
    else:
        raise ValueError(
            f"Unsupported manifest type '{manifest_path.suffix}' — expected .jsonl or .csv"
        )

    rows = []
    skipped = 0
    for raw in raw_rows:
        crop_path = _first_present(raw, CROP_PATH_KEYS)
        track_id = _first_present(raw, TRACK_ID_KEYS)
        if not crop_path or track_id is None:
            skipped += 1
            continue
        rows.append({
            "crop_path": crop_path,
            "timestamp": _first_present(raw, TIMESTAMP_KEYS),
            "track_id": track_id,
        })

    if skipped:
        print(f"Skipped {skipped} manifest row(s) missing a crop path or track id "
              f"(looked for columns: {CROP_PATH_KEYS} / {TRACK_ID_KEYS}).")
    return rows


def aggregate_track(frame_records: list[dict], confidence_threshold: float) -> dict:
    """`frame_records`: list of {"text", "confidence", "timestamp"} gathered
    across every surviving frame for one track (including BOTH candidates
    from disagreeing frames). Drops low-confidence readings, aligns the rest
    by edit distance, and takes a character-level majority vote."""
    kept = [r for r in frame_records if r["text"] and r["confidence"] >= confidence_threshold]
    if not kept:
        kept = sorted(frame_records, key=lambda r: r["confidence"], reverse=True)[:1]
        kept = [r for r in kept if r["text"]]

    texts = [r["text"] for r in kept]
    final_plate = vote_final_plate(texts) if texts else ""
    mean_conf = sum(r["confidence"] for r in kept) / len(kept) if kept else 0.0

    timestamps = sorted(r["timestamp"] for r in frame_records if r["timestamp"])
    return {
        "license_plate": final_plate,
        "confidence": round(mean_conf, 4),
        "num_frames_used": len(kept),
        "num_frames_seen": len(frame_records),
        "first_timestamp": timestamps[0] if timestamps else None,
        "last_timestamp": timestamps[-1] if timestamps else None,
    }


def run(args) -> list[dict]:
    manifest_rows = load_manifest(Path(args.manifest))
    print(f"Loaded {len(manifest_rows)} crop(s) from manifest across "
          f"{len({r['track_id'] for r in manifest_rows})} track(s).")

    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    parseq_model = load_parseq(device)
    per_track_records: dict[str, list[dict]] = defaultdict(list)
    failures = 0
    n_ok = 0
    for row in manifest_rows:
        crop_path = Path(row["crop_path"])
        img = cv2.imread(str(crop_path))
        if img is None:
            failures += 1
            print(f"  Skipping unreadable crop: {crop_path}")
            continue

        try:
            frame_pred: FramePrediction = predict_frame(parseq_model, img, device)
        except Exception as e:
            failures += 1
            print(f"  OCR failed on {crop_path.name}: {e}")
            continue

        n_ok += 1
        for cand in frame_pred.candidates:
            per_track_records[row["track_id"]].append({
                "text": cand.text, "confidence": cand.confidence,
                "timestamp": row["timestamp"],
            })

    print(f"\nOCR: {n_ok} crop(s) read successfully, {failures} failure(s)/unreadable crop(s).")

    readings = []
    for track_id, frame_records in per_track_records.items():
        agg = aggregate_track(frame_records, args.confidence_threshold)
        if not agg["license_plate"]:
            continue
        readings.append({
            "track_id": track_id,
            "license_plate": agg["license_plate"],
            "confidence": agg["confidence"],
            "first_timestamp": agg["first_timestamp"],
            "last_timestamp": agg["last_timestamp"],
            "num_frames_used": agg["num_frames_used"],
            "num_frames_seen": agg["num_frames_seen"],
            "node_number": args.node_number,
        })

    print(f"Produced {len(readings)} final high-confidence plate reading(s) "
          f"out of {len(per_track_records)} track(s).")
    return readings


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="OCR (PARSeq) + temporal majority-vote aggregation of tracked-vehicle "
                    "plate crops.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--manifest", required=True,
                   help="Path to the Stage-1 plate crops manifest (.jsonl or .csv) — "
                        "several rows per track_id, one per surviving frame crop.")
    p.add_argument("--output", default="plate_readings.json",
                   help="Path to write the final per-vehicle JSON readings to.")
    p.add_argument("--node-number", type=int, default=1,
                   help="Node number to stamp on every reading (default: 1).")
    p.add_argument("--confidence-threshold", type=float, default=0.85,
                   help="Per-frame OCR confidence floor before a reading is allowed "
                        "into the temporal vote (default: 0.85).")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    readings = run(args)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(readings, f, indent=2)
    print(f"Wrote {len(readings)} reading(s) to {out_path}")


if __name__ == "__main__":
    main()