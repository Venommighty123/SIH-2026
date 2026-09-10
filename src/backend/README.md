# License-Plate ANPR Pipeline

Two-model detection (vehicle tracking + fine-tuned plate detector) followed
by PARSeq OCR and temporal majority-vote aggregation per vehicle track.

Converted from the original Kaggle notebook into standalone modules for use
in VS Code / any local or CI environment.

## File layout

| File | Role |
|---|---|
| `config.py` | All editable run parameters (paths, thresholds, device). Edit this first. |
| `common.py` | Shared helpers: quality-gate scoring, plate warping, OCR text cleanup, temporal voting. |
| `track_memory.py` | `VehicleKalmanMemory` — per-track Kalman filtering used by Stage 1. |
| `enhancement.py` | Crop enhancement + perspective warp (calls Real-ESRGAN for medium-tier crops). |
| `realesrgan_downloader.py` | Downloads/builds the Real-ESRGAN binary used by `enhancement.py`. |
| `ocr_ensemble.py` | PARSeq OCR backend + `predict_frame()` glue used by Stage 2. |
| `testing_yolo.py` | Stage 1: `TrackingConfig` + `VehiclePlateTracker` — vehicle tracking, plate detection, crop manifest. |
| `main.py` | Stage 2: manifest loading, OCR loop, `aggregate_track()` temporal vote, CLI entry point. |
| `run_stage1.py` | Script entry point for Stage 1 only. |
| `run_stage2.py` | Script entry point for Stage 2 only (`--manifest` required). |
| `run_pipeline.py` | Runs Stage 1 -> Stage 2 -> preview end to end. |
| `preview_results.py` | Optional: prints track summary / manifest head and points to the annotated video. |
| `requirements.txt` | Python dependencies. |

## Usage

1. Edit `config.py` (video path, weights, tracker config, thresholds), or set
   the corresponding `ANPR_*` environment variables.
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Run everything:
   ```
   python run_pipeline.py
   ```
   Or run stages individually:
   ```
   python run_stage1.py
   python run_stage2.py --manifest /path/to/video_run/plate_crops_manifest.csv
   python preview_results.py
   ```

## Notes

- OCR is PARSeq-only (see `ocr_ensemble.py`); PaddleOCR was removed from the
  pipeline due to a Paddle/PaddleX version-mismatch crash on the original
  build environment, unrelated to this codebase.
- `testing_yolo.py` (Stage 1) writes `plate_crops_manifest.csv`,
  `track_summary.csv`, and an annotated video under `config.OUT_DIR`.
- `main.py` (Stage 2) reads that manifest and writes final per-vehicle
  readings to `config.PLATE_READINGS_OUTPUT`.