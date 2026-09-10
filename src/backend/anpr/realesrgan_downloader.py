"""
Wrapper around the portable Real-ESRGAN NCNN-Vulkan executable.
"""

import os
import platform
import stat
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import cv2
import numpy as np

_RELEASE_BASE = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0"
_ASSETS = {
    "Windows": ("realesrgan-ncnn-vulkan-20220424-windows.zip", "realesrgan-ncnn-vulkan.exe"),
    "Linux":   ("realesrgan-ncnn-vulkan-20220424-ubuntu.zip",  "realesrgan-ncnn-vulkan"),
    "Darwin":  ("realesrgan-ncnn-vulkan-20220424-macos.zip",   "realesrgan-ncnn-vulkan"),
}


def _bin_dir() -> Path:
    """Pick a writable directory for the downloaded binary. Falls back through several
    candidates because this module may be imported from a read-only location (e.g. a
    Kaggle *input* dataset, which is mounted read-only - only /kaggle/working is writable)."""
    candidates = [
        Path("/kaggle/working/realesrgan_bin"),
        Path(__file__).resolve().parent / "realesrgan_bin",
        Path(tempfile.gettempdir()) / "realesrgan_bin",
    ]
    for d in candidates:
        try:
            d.mkdir(parents=True, exist_ok=True)
            test_file = d / ".write_test"
            test_file.touch()
            test_file.unlink()
            return d
        except OSError:
            continue
    raise RuntimeError("Could not find any writable directory for the Real-ESRGAN binary.")


def ensure_binary() -> Path:
    """Download + extract the portable executable if it isn't already present. Returns exe path."""
    system = platform.system()
    if system not in _ASSETS:
        raise RuntimeError(f"No portable Real-ESRGAN build available for platform: {system}")

    zip_name, exe_name = _ASSETS[system]
    bin_dir = _bin_dir()
    exe_path = bin_dir / exe_name

    if exe_path.exists():
        return exe_path

    zip_path = bin_dir / zip_name
    if not zip_path.exists():
        print(f"Downloading {zip_name} ...")
        urllib.request.urlretrieve(f"{_RELEASE_BASE}/{zip_name}", zip_path)

    print(f"Extracting {zip_name} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(bin_dir)

    if not exe_path.exists():
        found = list(bin_dir.rglob(exe_name))
        if not found:
            raise RuntimeError(f"Could not locate {exe_name} after extracting {zip_name}")
        exe_path = found[0]

    if system != "Windows":
        exe_path.chmod(exe_path.stat().st_mode | stat.S_IEXEC)

    return exe_path


def upscale(crop_bgr: np.ndarray, scale: int = 4, model_name: str = "realesrgan-x4plus") -> np.ndarray:
    """Upscale a single BGR image (numpy array) using the portable Real-ESRGAN binary.

    model_name options bundled with the release: realesrgan-x4plus, realesrgan-x4plus-anime,
    realesr-animevideov3 (only x4 scale supported per model; use scale=4 for the default model).
    """
    exe_path = ensure_binary()

    with tempfile.TemporaryDirectory() as tmp:
        in_path = Path(tmp) / "in.png"
        out_path = Path(tmp) / "out.png"
        cv2.imwrite(str(in_path), crop_bgr)

        cmd = [
            str(exe_path),
            "-i", str(in_path),
            "-o", str(out_path),
            "-n", model_name,
            "-s", str(scale),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=exe_path.parent)

        if result.returncode != 0 or not out_path.exists():
            raise RuntimeError(f"Real-ESRGAN binary failed: {result.stderr}")

        upscaled = cv2.imread(str(out_path))
        return upscaled