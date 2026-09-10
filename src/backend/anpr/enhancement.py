"""
Stage 4 - TIERED ENHANCEMENT.

    medium tier: Real-ESRGAN (GAN) upscale -> perspective warp to 224x64
    high tier:   NO enhancement -> perspective warp only

We measured this on our own data (see HR ablation notes in the project
README): running GAN sharpening on an already-sharp, already-large crop
makes OCR worse, not better, so the quality-gate score decides per-crop
whether enhancement is even attempted.
"""

from __future__ import annotations
import numpy as np
import realesrgan_downloader
from common import warp_plate

DEFAULT_WARP_SIZE = (224, 64)


def enhance_and_warp(frame_bgr: np.ndarray, corners: np.ndarray, tier: str,
                      gan_scale: int = 4, out_size: tuple[int, int] = DEFAULT_WARP_SIZE,
                      pad: int = 4) -> np.ndarray:
    """Applies the tier-appropriate enhancement then perspective-warps the
    plate to a flat `out_size` rectangle.

    `corners` are the 4 OBB corner points in `frame_bgr`'s global coordinates.
    """
    if tier != "medium":
        return warp_plate(frame_bgr, corners, out_size)

    corners = np.asarray(corners, dtype=np.float32)
    x1, y1 = corners[:, 0].min(), corners[:, 1].min()
    x2, y2 = corners[:, 0].max(), corners[:, 1].max()
    h_img, w_img = frame_bgr.shape[:2]
    x1p, y1p = max(0, int(x1) - pad), max(0, int(y1) - pad)
    x2p, y2p = min(w_img, int(x2) + pad), min(h_img, int(y2) + pad)
    crop = frame_bgr[y1p:y2p, x1p:x2p]

    if crop.size == 0:
        return warp_plate(frame_bgr, corners, out_size)

    try:
        upscaled = realesrgan_downloader.upscale(crop, scale=gan_scale)
    except Exception:
        return warp_plate(frame_bgr, corners, out_size)

    scale_x = upscaled.shape[1] / crop.shape[1]
    scale_y = upscaled.shape[0] / crop.shape[0]
    local_corners = np.array(
        [[(cx - x1p) * scale_x, (cy - y1p) * scale_y] for cx, cy in corners],
        dtype=np.float32,
    )
    return warp_plate(upscaled, local_corners, out_size)