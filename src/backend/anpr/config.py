"""
Central run configuration for the ANPR pipeline.
"""

from __future__ import annotations
import os
from pathlib import Path
import torch

VIDEO_PATH = os.environ.get(
    "ANPR_VIDEO_PATH",
    "/kaggle/input/datasets/kushubhai/sihhhhhh/VID20260909183150.mp4",
)
PLATE_WEIGHTS = os.environ.get(
    "ANPR_PLATE_WEIGHTS",
    "/kaggle/input/datasets/kushubhai/sihhhhhh/ccpd_yolov8n_best.pt",
)
VEHICLE_WEIGHTS = os.environ.get(
    "ANPR_VEHICLE_WEIGHTS",
    "yolov8n.pt",
)
TRACKER_CONFIG = os.environ.get(
    "ANPR_TRACKER_CONFIG",
    "/kaggle/input/datasets/kushubhai/sihhhhhh/tracker.yaml",
)
OUT_DIR = os.environ.get("ANPR_OUT_DIR", "/kaggle/working/video_run")

MAX_CROPS_PER_TRACK = int(os.environ.get("ANPR_MAX_CROPS_PER_TRACK", 25))
GAN_SCALE = int(os.environ.get("ANPR_GAN_SCALE", 4))
CONFIDENCE_THRESHOLD = float(os.environ.get("ANPR_CONFIDENCE_THRESHOLD", 0.85))
NODE_NUMBER = int(os.environ.get("ANPR_NODE_NUMBER", 2))

PLATE_READINGS_OUTPUT = os.environ.get(
    "ANPR_READINGS_OUTPUT", "/kaggle/working/plate_readings.json"
)

DEVICE = "0" if torch.cuda.is_available() else "cpu"

def print_device_info() -> None:
    print("CUDA available:", torch.cuda.is_available())
    if torch.cuda.is_available():
        print("GPU:", torch.cuda.get_device_name(0))
    print(f"Using device: {DEVICE}")


def out_dir_path() -> Path:
    return Path(OUT_DIR)