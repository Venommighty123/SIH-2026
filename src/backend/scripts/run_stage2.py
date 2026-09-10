"""
Stage 2: OCR the extracted plate crops + temporal aggregation per vehicle.

Reads the Stage-1 manifest and writes final per-vehicle plate readings to
`config.PLATE_READINGS_OUTPUT`.

Usage:
    python run_stage2.py --manifest /path/to/plate_crops_manifest.csv
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import config
from main import run as run_stage2


def build_stage2_args(manifest_path: str) -> argparse.Namespace:
    return argparse.Namespace(
        manifest=manifest_path,
        output=config.PLATE_READINGS_OUTPUT,
        node_number=config.NODE_NUMBER,
        confidence_threshold=config.CONFIDENCE_THRESHOLD,
        device=config.DEVICE,
    )


def write_readings(readings: list[dict], output_path: str) -> None:
    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(readings, f, indent=2)
    print(f"Wrote {len(readings)} reading(s) to {out_path}")


def parse_cli_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run Stage 2 (OCR + temporal vote).")
    p.add_argument(
        "--manifest",
        required=True,
        help="Path to the Stage-1 plate_crops_manifest (.csv or .jsonl).",
    )
    return p.parse_args(argv)


def main(argv=None) -> list[dict]:
    cli_args = parse_cli_args(argv)
    stage2_args = build_stage2_args(cli_args.manifest)

    readings = run_stage2(stage2_args)
    write_readings(readings, stage2_args.output)

    return readings


if __name__ == "__main__":
    main()