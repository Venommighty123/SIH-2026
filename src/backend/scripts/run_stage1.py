"""
Stage 1: vehicle tracking + plate detection.

Runs `testing_yolo.VehiclePlateTracker` over the configured video and writes
the crops manifest / summary CSVs / annotated video to `config.OUT_DIR`.

Usage:
    python run_stage1.py
"""

from __future__ import annotations

import config
from testing_yolo import TrackingConfig, VehiclePlateTracker


def build_stage1_config() -> TrackingConfig:
    return TrackingConfig(
        video_path=config.VIDEO_PATH,
        plate_weights=config.PLATE_WEIGHTS,
        vehicle_weights=config.VEHICLE_WEIGHTS,
        out_dir=config.OUT_DIR,
        tracker_config=config.TRACKER_CONFIG,
        device=config.DEVICE,
        max_crops_per_track=config.MAX_CROPS_PER_TRACK,
        gan_scale=config.GAN_SCALE,
    )


def main() -> TrackingConfig:
    config.print_device_info()

    stage1_config = build_stage1_config()
    tracker = VehiclePlateTracker(stage1_config)
    report = tracker.run()

    print(
        f"Tracked {len(report.tracks)} vehicle(s) across {report.total_frames} frames; "
        f"{len(report.manifest_df)} plate crop(s) survived the quality gate."
    )
    print(report.summary_df.head())

    return stage1_config


if __name__ == "__main__":
    main()