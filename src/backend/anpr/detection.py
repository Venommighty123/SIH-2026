"""
Stage 1 of the ANPR pipeline - TWO-MODEL detection (reverted from a single unified
model: a merged vehicle+plate model measurably hurt plate-detection accuracy).

    1) DETECTION (two models, one pass each)
         - vehicle_model : stock, untrained COCO yolov8n.pt (car/motorcycle/bus/truck).
                            Off-the-shelf - no fine-tuning needed or wanted.
         - plate_model    : YOUR fine-tuned single-class plate detector (from the CCPD
                            training notebook). Axis-aligned boxes, not OBB.
    2) TRACKING            - ByteTrack/BoT-SORT gives each vehicle a persistent Track_ID
                            (via the vehicle model only - the plate model is detection-only,
                            matched to a tracked vehicle by box-center containment).
                            A Kalman-filter fail-safe keeps the ID alive briefly if the
                            vehicle class is missed for a few frames.
    3) QUALITY GATE         - drops unreadable plate crops (too small, too blurry, cut
                            off) before any OCR compute is spent.
    4) TIERED ENHANCEMENT   - medium-quality crops get Real-ESRGAN + warp; high-quality
                            crops get warp only.

Output of this stage is a per-frame detections CSV (including dropped crops, logged for
QA), a track-level summary CSV, and a plate-crops manifest CSV that Stage 2 (main.py)
reads to run the OCR ensemble - main.py is unchanged by this revert.
"""

from __future__ import annotations

import argparse
import logging
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import cv2
import numpy as np
import pandas as pd
from tqdm import tqdm
from ultralytics import YOLO

from common import QualityGateConfig, score_plate_crop
from enhancement import enhance_and_warp
from track_memory import VehicleKalmanMemory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                     datefmt="%H:%M:%S")
logger = logging.getLogger("anpr_two_model_pipeline")

BBox = tuple[float, float, float, float]


@dataclass
class TrackingConfig:
    video_path: str
    plate_weights: str
    vehicle_weights: str = "yolov8n.pt"
    out_dir: str = "video_run"

    assumed_fps: float = 25.0
    start_time: str = "12:00:00"

    clip_start_seconds: float = 0.0
    clip_end_seconds: Optional[float] = None

    vehicle_coco_classes: dict[int, str] = field(default_factory=lambda: {
        2: "car", 3: "motorcycle", 5: "bus", 7: "truck",
    })

    vehicle_conf: float = 0.30
    plate_conf: float = 0.25
    tracker_config: str = "tracker.yaml"
    device: int | str = "cpu"

    min_plate_width_px: int = 45
    min_plate_height_px: int = 14
    min_blur_variance: float = 25.0
    good_blur_variance: float = 120.0
    target_plate_width_px: float = 130.0
    reject_boundary_cutoff: bool = True
    enhance_score_threshold: float = 0.60

    max_coast_frames: int = 8

    gan_scale: int = 4
    warp_width: int = 224
    warp_height: int = 64

    max_crops_per_track: int = 25

    save_annotated_video: bool = True
    reencode_for_browser: bool = True

    vehicle_box_color: tuple[int, int, int] = (0, 255, 0)
    plate_matched_color: tuple[int, int, int] = (0, 165, 255)
    plate_unmatched_color: tuple[int, int, int] = (0, 0, 255)
    plate_dropped_color: tuple[int, int, int] = (0, 0, 255)

    def __post_init__(self):
        self.out_path = Path(self.out_dir)
        self.out_path.mkdir(parents=True, exist_ok=True)
        self.annotated_video_path = self.out_path / "annotated_tracking.mp4"
        self.browser_video_path = self.out_path / "annotated_tracking_h264.mp4"
        self.detections_csv_path = self.out_path / "detections_per_frame.csv"
        self.summary_csv_path = self.out_path / "track_summary.csv"
        self.manifest_csv_path = self.out_path / "plate_crops_manifest.csv"
        self.crops_dir = self.out_path / "plate_crops"
        self.crops_dir.mkdir(exist_ok=True)

        self.warp_size = (self.warp_width, self.warp_height)
        self.quality_cfg = QualityGateConfig(
            min_width=self.min_plate_width_px,
            min_height=self.min_plate_height_px,
            min_blur_variance=self.min_blur_variance,
            good_blur_variance=self.good_blur_variance,
            target_width=self.target_plate_width_px,
            reject_boundary_cutoff=self.reject_boundary_cutoff,
            enhance_threshold=self.enhance_score_threshold,
        )


@dataclass
class PlateCandidate:
    """One quality-gate-passing plate crop for a track, waiting to be ranked."""
    frame_idx: int
    timestamp: str
    corners: np.ndarray
    quality_score: float
    tier: str


@dataclass
class VehicleTrack:
    """Running state for one tracked vehicle across the whole video."""
    vehicle_track_id: int
    first_frame: int
    first_timestamp: str
    last_frame: int
    last_timestamp: str
    candidates: list[PlateCandidate] = field(default_factory=list)

    def touch(self, frame_idx: int, timestamp: str) -> None:
        self.last_frame = frame_idx
        self.last_timestamp = timestamp

    def add_candidate(self, candidate: PlateCandidate) -> None:
        self.candidates.append(candidate)

    def dwell_time_seconds(self, fps: float) -> float:
        return round((self.last_frame - self.first_frame) / fps, 2)

    def best_candidates(self, top_n: int) -> list[PlateCandidate]:
        return sorted(self.candidates, key=lambda c: c.quality_score, reverse=True)[:top_n]


@dataclass
class TrackingReport:
    per_frame_df: pd.DataFrame
    summary_df: pd.DataFrame
    manifest_df: pd.DataFrame
    tracks: dict[int, VehicleTrack]
    total_frames: int


class PlateVehicleAssociator:
    """Decides which tracked vehicle box a given plate detection belongs to."""

    @staticmethod
    def bbox_center_inside(center: tuple[float, float], outer_box: BBox) -> bool:
        ox1, oy1, ox2, oy2 = outer_box
        cx, cy = center
        return ox1 <= cx <= ox2 and oy1 <= cy <= oy2

    @classmethod
    def match(cls, plate_center: tuple[float, float],
              vehicle_boxes: list[tuple[int, BBox]]) -> Optional[int]:
        for vehicle_id, vbox in vehicle_boxes:
            if cls.bbox_center_inside(plate_center, vbox):
                return vehicle_id
        return None


class FrameAnnotator:
    """Draws vehicle/plate boxes and labels onto a frame for the annotated output video."""

    def __init__(self, config: TrackingConfig):
        self.config = config

    def draw_vehicle_box(self, frame, vehicle_id: int, bbox: BBox, conf: float, coasted: bool):
        x1, y1, x2, y2 = map(int, bbox)
        color = self.config.vehicle_box_color
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"V-ID {vehicle_id} {conf:.2f}" + (" (coast)" if coasted else "")
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        label_y = max(0, y1 - th - 6)
        cv2.rectangle(frame, (x1, label_y), (x1 + tw + 4, y1), color, -1)
        cv2.putText(frame, label, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    def draw_plate_box(self, frame, corners: np.ndarray, conf: float,
                        matched_vehicle_id: Optional[int], dropped: bool):
        pts = corners.astype(int).reshape(-1, 1, 2)
        if dropped:
            color = self.config.plate_dropped_color
        elif matched_vehicle_id is not None:
            color = self.config.plate_matched_color
        else:
            color = self.config.plate_unmatched_color
        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
        label = f"P {conf:.2f}" + (" DROP" if dropped else f" -> V{matched_vehicle_id}"
                                    if matched_vehicle_id is not None else " (unmatched)")
        x, y = corners[:, 0].min(), corners[:, 1].min()
        cv2.putText(frame, label, (int(x), max(10, int(y) - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)


class AnnotatedVideoWriter:
    def __init__(self, config: TrackingConfig, fps: float, frame_size: tuple[int, int]):
        self.config = config
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self._writer = cv2.VideoWriter(str(config.annotated_video_path), fourcc, fps, frame_size)

    def write(self, frame) -> None:
        self._writer.write(frame)

    def close(self) -> None:
        self._writer.release()
        logger.info(f"Annotated video (raw mp4v) saved to: {self.config.annotated_video_path}")

    def reencode_for_browser(self) -> Optional[Path]:
        logger.info("Re-encoding annotated video for browser playback (requires ffmpeg)...")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(self.config.annotated_video_path),
                 "-vcodec", "libx264", str(self.config.browser_video_path)],
                stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, check=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.warning(f"ffmpeg re-encode failed or ffmpeg not found: {e}. "
                            f"Raw video is still available at {self.config.annotated_video_path}.")
            return None
        logger.info(f"Browser-playable video saved to: {self.config.browser_video_path}")
        return self.config.browser_video_path


class VehiclePlateTracker:
    """Orchestrates the two-model detection (stock vehicle model + your fine-tuned plate
    model), tracking (+ fail-safe memory), the quality gate, and tiered enhancement."""

    def __init__(self, config: TrackingConfig):
        self.config = config
        self.vehicle_model: Optional[YOLO] = None
        self.plate_model: Optional[YOLO] = None
        self.associator = PlateVehicleAssociator()
        self.annotator = FrameAnnotator(config)
        self._memories: dict[int, VehicleKalmanMemory] = {}

    def load_models(self) -> None:
        logger.info(f"Loading vehicle detector (stock, untrained) from "
                    f"{self.config.vehicle_weights} ...")
        self.vehicle_model = YOLO(self.config.vehicle_weights)
        logger.info(f"Loading fine-tuned plate detector from {self.config.plate_weights} ...")
        self.plate_model = YOLO(self.config.plate_weights)
        logger.info("Both models loaded.")

    def _probe_video(self) -> tuple[float, int, int, Optional[int], int, Optional[int]]:
        cap = cv2.VideoCapture(self.config.video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video at {self.config.video_path}")
        fps = cap.get(cv2.CAP_PROP_FPS) or self.config.assumed_fps
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or None
        cap.release()

        start_frame = max(0, int(round(self.config.clip_start_seconds * fps)))
        if self.config.clip_end_seconds is not None:
            end_frame = int(round(self.config.clip_end_seconds * fps))
            if total_frames is not None:
                end_frame = min(end_frame, total_frames)
        else:
            end_frame = total_frames

        return fps, width, height, total_frames, start_frame, end_frame


    def _detect_vehicles(self, frame) -> list[tuple[int, BBox, float]]:
        """Runs the stock vehicle model WITH tracking (persist=True) on one frame.
        Returns (track_id, bbox, conf) - only for boxes the tracker actually assigned
        an id to."""
        result = self.vehicle_model.track(
            frame, persist=True, tracker=self.config.tracker_config,
            classes=list(self.config.vehicle_coco_classes.keys()),
            conf=self.config.vehicle_conf, device=self.config.device, verbose=False,
        )[0]
        vehicle_dets = []
        boxes = result.boxes
        if boxes is None or boxes.id is None or len(boxes) == 0:
            return vehicle_dets
        for bbox, conf, tid in zip(boxes.xyxy.cpu().numpy(), boxes.conf.cpu().tolist(),
                                    boxes.id.int().cpu().tolist()):
            vehicle_dets.append((tid, tuple(map(float, bbox)), conf))
        return vehicle_dets

    def _detect_plates(self, frame) -> list[tuple[np.ndarray, float]]:
        """Runs your fine-tuned plate model (detection only, no tracking needed - plates
        are matched to an already-tracked vehicle by box-center containment)."""
        result = self.plate_model.predict(
            frame, conf=self.config.plate_conf, device=self.config.device, verbose=False,
        )[0]
        plate_dets = []
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return plate_dets
        for bbox, conf in zip(boxes.xyxy.cpu().numpy(), boxes.conf.cpu().tolist()):
            x1, y1, x2, y2 = bbox
            corners = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)
            plate_dets.append((corners, conf))
        return plate_dets

    def _process_frame(self, vehicle_dets: list[tuple[int, BBox, float]],
                        plate_dets: list[tuple[np.ndarray, float]],
                        frame_bgr, frame_idx: int, ts_str: str, frame_w: int, frame_h: int,
                        tracks: dict[int, VehicleTrack], per_frame_rows: list[dict],
                        annotated_frame) -> None:
        seen_ids = set()
        vehicle_boxes: list[tuple[int, BBox]] = []

        for tid, bbox, conf in vehicle_dets:
            seen_ids.add(tid)
            mem = self._memories.setdefault(tid, VehicleKalmanMemory(self.config.max_coast_frames))
            mem.update(bbox)
            vehicle_boxes.append((tid, bbox))
            if tid not in tracks:
                tracks[tid] = VehicleTrack(vehicle_track_id=tid, first_frame=frame_idx,
                                            first_timestamp=ts_str, last_frame=frame_idx,
                                            last_timestamp=ts_str)
            else:
                tracks[tid].touch(frame_idx, ts_str)
            if annotated_frame is not None:
                self.annotator.draw_vehicle_box(annotated_frame, tid, bbox, conf, coasted=False)

        for tid, mem in self._memories.items():
            if tid in seen_ids:
                continue
            coasted_bbox = mem.predict_if_missed()
            if coasted_bbox is None:
                continue
            vehicle_boxes.append((tid, coasted_bbox))
            if tid in tracks:
                tracks[tid].touch(frame_idx, ts_str)
            if annotated_frame is not None:
                self.annotator.draw_vehicle_box(annotated_frame, tid, coasted_bbox, 0.0, coasted=True)

        if not vehicle_boxes:
            return

        for corners, plate_conf in plate_dets:
            center = (float(corners[:, 0].mean()), float(corners[:, 1].mean()))
            matched_vehicle_id = self.associator.match(center, vehicle_boxes)

            x1, y1 = int(max(0, corners[:, 0].min())), int(max(0, corners[:, 1].min()))
            x2, y2 = int(min(frame_w, corners[:, 0].max())), int(min(frame_h, corners[:, 1].max()))
            crop = frame_bgr[y1:y2, x1:x2]

            quality = score_plate_crop(crop, corners, frame_w, frame_h, self.config.quality_cfg) \
                if crop.size else None

            dropped = quality is None or not quality.passed
            per_frame_rows.append({
                "frame_number": frame_idx, "vehicle_track_id": matched_vehicle_id,
                "timestamp": ts_str, "plate_confidence": round(plate_conf, 4),
                "quality_score": round(quality.score, 4) if quality else 0.0,
                "tier": quality.tier if quality else "drop",
                "dropped": dropped,
                "drop_reason": quality.reason if quality else "empty crop",
            })

            if annotated_frame is not None:
                self.annotator.draw_plate_box(annotated_frame, corners, plate_conf,
                                               matched_vehicle_id, dropped)

            if dropped or matched_vehicle_id is None:
                continue

            tracks[matched_vehicle_id].add_candidate(PlateCandidate(
                frame_idx=frame_idx, timestamp=ts_str, corners=corners,
                quality_score=quality.score, tier=quality.tier,
            ))

    def _run_tracking_loop(self) -> tuple[pd.DataFrame, dict[int, VehicleTrack], int]:
        fps, width, height, total_frames = self._probe_video()
        start_dt = datetime.strptime(self.config.start_time, "%H:%M:%S")

        video_writer = None
        if self.config.save_annotated_video:
            video_writer = AnnotatedVideoWriter(self.config, fps, (width, height))

        tracks: dict[int, VehicleTrack] = {}
        per_frame_rows: list[dict] = []

        cap = cv2.VideoCapture(self.config.video_path)
        frame_idx = 0
        pbar = tqdm(total=total_frames, desc="Two-model detection + tracking + quality gate")
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            timestamp = start_dt + timedelta(seconds=frame_idx / self.config.assumed_fps)
            ts_str = timestamp.strftime("%H:%M:%S.%f")[:-3]

            vehicle_dets = self._detect_vehicles(frame)
            plate_dets = self._detect_plates(frame)

            annotated_frame = frame.copy() if video_writer else None
            self._process_frame(vehicle_dets, plate_dets, frame, frame_idx, ts_str,
                                 width, height, tracks, per_frame_rows, annotated_frame)

            if video_writer:
                video_writer.write(annotated_frame)
            frame_idx += 1
            pbar.update(1)

        pbar.close()
        cap.release()
        if video_writer:
            video_writer.close()
            if self.config.reencode_for_browser:
                video_writer.reencode_for_browser()

        per_frame_df = pd.DataFrame(per_frame_rows)
        n_dropped = int(per_frame_df["dropped"].sum()) if len(per_frame_df) else 0
        logger.info(f"Processed {frame_idx} frames. Logged {len(per_frame_df)} plate detections "
                    f"({n_dropped} dropped by the quality gate, saved for QA).")
        return per_frame_df, tracks, frame_idx

    def _generate_crops(self, tracks: dict[int, VehicleTrack]) -> pd.DataFrame:
        """Stage 4: for each track's best-quality candidates, enhance (if
        medium tier) and perspective-warp, then write the crop to disk."""
        cap = cv2.VideoCapture(self.config.video_path)
        manifest_rows: list[dict] = []

        all_candidates = [
            (t.vehicle_track_id, c)
            for t in tracks.values()
            for c in t.best_candidates(self.config.max_crops_per_track)
        ]
        for track_id, cand in tqdm(all_candidates, desc="Tiered enhancement + perspective warp"):
            cap.set(cv2.CAP_PROP_POS_FRAMES, cand.frame_idx)
            ok, frame = cap.read()
            if not ok:
                continue
            warped = enhance_and_warp(frame, cand.corners, cand.tier,
                                       gan_scale=self.config.gan_scale,
                                       out_size=self.config.warp_size)
            if warped is None or warped.size == 0:
                continue
            crop_path = (self.config.crops_dir /
                         f"track_{track_id:04d}_frame_{cand.frame_idx:06d}_{cand.tier}.jpg")
            cv2.imwrite(str(crop_path), warped)
            manifest_rows.append({
                "track_id": track_id, "frame_number": cand.frame_idx,
                "timestamp": cand.timestamp, "crop_path": str(crop_path),
                "quality_score": round(cand.quality_score, 4), "tier": cand.tier,
            })
        cap.release()
        logger.info(f"Generated {len(manifest_rows)} enhanced/warped crop(s) across "
                    f"{len(tracks)} track(s).")
        return pd.DataFrame(manifest_rows)

    def _build_summary(self, tracks: dict[int, VehicleTrack]) -> pd.DataFrame:
        rows = [{
            "vehicle_track_id": t.vehicle_track_id,
            "first_frame": t.first_frame, "last_frame": t.last_frame,
            "first_timestamp": t.first_timestamp, "last_timestamp": t.last_timestamp,
            "dwell_time_seconds": t.dwell_time_seconds(self.config.assumed_fps),
            "num_quality_candidates": len(t.candidates),
            "num_crops_kept": min(len(t.candidates), self.config.max_crops_per_track),
        } for t in tracks.values()]
        return pd.DataFrame(rows).sort_values("num_quality_candidates", ascending=False)

    def run(self) -> TrackingReport:
        if self.vehicle_model is None or self.plate_model is None:
            self.load_models()

        per_frame_df, tracks, total_frames = self._run_tracking_loop()
        manifest_df = self._generate_crops(tracks)
        summary_df = self._build_summary(tracks)

        per_frame_df.to_csv(self.config.detections_csv_path, index=False)
        summary_df.to_csv(self.config.summary_csv_path, index=False)
        manifest_df.to_csv(self.config.manifest_csv_path, index=False)

        logger.info(f"Distinct vehicles tracked        : {len(tracks)}")
        if len(summary_df):
            logger.info(f"Mean dwell time (seconds)         : "
                        f"{summary_df['dwell_time_seconds'].mean():.2f}")
        logger.info(f"Per-frame detections (incl. drops): {self.config.detections_csv_path}")
        logger.info(f"Track summary                     : {self.config.summary_csv_path}")
        logger.info(f"Plate crops manifest (Stage 2 in) : {self.config.manifest_csv_path}")

        return TrackingReport(per_frame_df=per_frame_df, summary_df=summary_df,
                               manifest_df=manifest_df, tracks=tracks, total_frames=total_frames)


def parse_args() -> TrackingConfig:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=str, required=True, dest="video_path")
    parser.add_argument("--plate_weights", type=str, required=True)
    parser.add_argument("--vehicle_weights", type=str, default="yolov8n.pt")
    parser.add_argument("--out_dir", type=str, default="video_run")
    parser.add_argument("--fps", type=float, default=25.0, dest="assumed_fps")
    parser.add_argument("--start_time", type=str, default="12:00:00")
    parser.add_argument("--plate_conf", type=float, default=0.25)
    parser.add_argument("--vehicle_conf", type=float, default=0.3)
    parser.add_argument("--max_crops_per_track", type=int, default=25)
    parser.add_argument("--tracker", type=str, default="bytetrack.yaml", dest="tracker_config")
    parser.add_argument("--device", type=str, default="cpu")
    parser.add_argument("--no_annotated_video", action="store_false", dest="save_annotated_video")
    parser.add_argument("--no_browser_reencode", action="store_false", dest="reencode_for_browser")
    args = parser.parse_args()
    return TrackingConfig(**vars(args))


def main() -> None:
    config = parse_args()
    tracker = VehiclePlateTracker(config)
    report = tracker.run()
    logger.info(f"Done. {len(report.tracks)} distinct vehicles tracked across "
                f"{report.total_frames} frames.")


if __name__ == "__main__":
    main()