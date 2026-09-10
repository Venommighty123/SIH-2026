# anpr-pipeline

License-Plate ANPR Pipeline — two-model detection (vehicle tracking +
fine-tuned plate detector) followed by PARSeq OCR and temporal majority-vote
aggregation per vehicle track.

Originally a Kaggle GPU inference notebook; restructured into an installable
package + thin CLI scripts for local / VS Code development.

## File layout

```
anpr-pipeline/
├── README.md
├── requirements.txt
├── .env.example              # ANPR_VIDEO_PATH, ANPR_PLATE_WEIGHTS, etc.
├── anpr/
│   ├── __init__.py
│   ├── config.py              # reads env vars / CLI — no hardcoded Kaggle paths
│   ├── common.py               # quality-gate scoring, plate warping, OCR text cleanup, temporal vote
│   ├── track_memory.py         # VehicleKalmanMemory — per-track Kalman filtering
│   ├── enhancement.py          # crop enhancement + perspective warp
│   ├── realesrgan_downloader.py# downloads/builds the Real-ESRGAN binary
│   ├── ocr_ensemble.py         # PARSeq OCR backend + predict_frame()
│   ├── detection.py            # Stage 1: TrackingConfig + VehiclePlateTracker (was testing_yolo.py)
│   └── ocr.py                  # Stage 2: manifest loading, OCR loop, aggregate_track() (was main.py)
├── scripts/
│   ├── run_stage1.py           # entry point: Stage 1 only
│   ├── run_stage2.py           # entry point: Stage 2 only (--manifest required)
│   ├── run_pipeline.py         # entry point: Stage 1 -> Stage 2 -> preview
│   └── preview_results.py      # optional: prints track summary / manifest head, points to annotated video
└── tests/                      # unit tests (e.g. common.py's vote_final_plate, clean_ocr_text)
```

| Path | Role |
|---|---|
| `anpr/config.py` | All editable run parameters (paths, thresholds, device), sourced from environment variables — no hardcoded Kaggle defaults. |
| `anpr/common.py` | Shared helpers: quality-gate scoring, plate warping, OCR text cleanup, temporal voting. |
| `anpr/track_memory.py` | `VehicleKalmanMemory` — per-track Kalman filtering used by Stage 1. |
| `anpr/enhancement.py` | Crop enhancement + perspective warp (calls Real-ESRGAN for medium-tier crops). |
| `anpr/realesrgan_downloader.py` | Downloads/builds the Real-ESRGAN binary used by `enhancement.py`. |
| `anpr/ocr_ensemble.py` | PARSeq OCR backend + `predict_frame()` glue used by Stage 2. |
| `anpr/detection.py` | Stage 1: `TrackingConfig` + `VehiclePlateTracker` — vehicle tracking, plate detection, crop manifest. |
| `anpr/ocr.py` | Stage 2: manifest loading, OCR loop, `aggregate_track()` temporal vote, CLI entry point. |
| `scripts/run_stage1.py` | Script entry point for Stage 1 only. |
| `scripts/run_stage2.py` | Script entry point for Stage 2 only. |
| `scripts/run_pipeline.py` | Runs Stage 1 -> Stage 2 -> preview end to end. |
| `scripts/preview_results.py` | Optional: prints track summary / manifest head and points to the annotated video. |
| `requirements.txt` | Python dependencies. |
| `.env.example` | Documents the required `ANPR_*` environment variables. |

## Setup

1. Install the package (editable) and its dependencies:
   ```
   pip install -e .
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and fill in your paths:
   ```
   cp .env.example .env
   ```
   Required variables:
   - `ANPR_VIDEO_PATH` — source video
   - `ANPR_PLATE_WEIGHTS` — your fine-tuned plate detector
   - `ANPR_VEHICLE_WEIGHTS` — vehicle detector weights (defaults to stock `yolov8n.pt`)
   - `ANPR_TRACKER_CONFIG` — Ultralytics tracker config (e.g. `tracker.yaml` / `botsort.yaml`)
   - `ANPR_OUT_DIR` — output directory for Stage 1 artifacts
   - `ANPR_MAX_CROPS_PER_TRACK`, `ANPR_GAN_SCALE`, `ANPR_CONFIDENCE_THRESHOLD`, `ANPR_NODE_NUMBER` — tunable thresholds
   - `ANPR_READINGS_OUTPUT` — final JSON output path

## Usage

Run everything:
```
python scripts/run_pipeline.py
```

Or run stages individually:
```
python scripts/run_stage1.py
python scripts/run_stage2.py --manifest /path/to/video_run/plate_crops_manifest.csv
python scripts/preview_results.py
```

## Notes

- OCR is PARSeq-only (see `anpr/ocr_ensemble.py`); PaddleOCR was removed from
  the pipeline due to a Paddle/PaddleX version-mismatch crash on the original
  build environment, unrelated to this codebase.
- `anpr/detection.py` (Stage 1) writes `plate_crops_manifest.csv`,
  `track_summary.csv`, and an annotated video under `ANPR_OUT_DIR`.
- `anpr/ocr.py` (Stage 2) reads that manifest and writes final per-vehicle
  readings to `ANPR_READINGS_OUTPUT`.
- Tests live under `tests/` — good first candidates are the pure functions in
  `anpr/common.py` (`vote_final_plate`, `clean_ocr_text`).