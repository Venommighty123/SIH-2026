"""
End-to-end pipeline runner: Stage 1 (tracking + detection) -> Stage 2 (OCR +
temporal aggregation) -> optional results preview.

Usage:
    python run_pipeline.py
    python run_pipeline.py --skip-preview
"""

from __future__ import annotations

import argparse

from run_stage1 import main as run_stage1_main
from run_stage2 import build_stage2_args, write_readings
from main import run as run_stage2
from preview_results import preview


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run the full ANPR pipeline (Stage 1 + Stage 2).")
    p.add_argument(
        "--skip-preview", action="store_true", help="Skip the results preview step."
    )
    return p.parse_args(argv)


def main(argv=None) -> None:
    args = parse_args(argv)

    stage1_config = run_stage1_main()

    stage2_args = build_stage2_args(str(stage1_config.manifest_csv_path))
    readings = run_stage2(stage2_args)
    write_readings(readings, stage2_args.output)

    if not args.skip_preview:
        preview(stage1_config)


if __name__ == "__main__":
    main()