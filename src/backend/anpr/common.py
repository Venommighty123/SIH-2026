"""
Shared utilities for the unified ANPR pipeline.
"""

from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import cv2
import numpy as np

ALPHABETS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R',
             'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'O']
ADS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R',
       'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5',
       '6', '7', '8', '9', 'O']


def decode_ccpd_filename(filename: str) -> str:
    stem = Path(filename).stem
    parts = stem.split('-')
    plate_indices = list(map(int, parts[4].split('_')))
    number = ALPHABETS[plate_indices[1]]
    for idx in plate_indices[2:]:
        number += ADS[idx]
    return number


def char_accuracy(pred: str, gt: str) -> float:
    """Character-level accuracy via normalized Levenshtein distance."""
    if len(gt) == 0:
        return 0.0
    import Levenshtein
    dist = Levenshtein.distance(pred, gt)
    return max(0.0, 1 - dist / len(gt))


def clean_ocr_text(text: str) -> str:
    """Plates are alphanumeric only - strip anything else an OCR head might emit."""
    return "".join(ch for ch in text.upper() if ch.isalnum())


@dataclass
class QualityGateConfig:
    min_width: int = 45
    min_height: int = 14
    min_blur_variance: float = 25.0
    good_blur_variance: float = 120.0
    target_width: float = 130.0
    reject_boundary_cutoff: bool = True
    enhance_threshold: float = 0.60

@dataclass
class QualityScore:
    passed: bool
    tier: str
    score: float
    blur_variance: float
    width: int
    height: int
    boundary_cut: bool
    reason: str = ""


def laplacian_blur_variance(crop_bgr: np.ndarray) -> float:
    if crop_bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def is_boundary_cut_off(corners: np.ndarray, frame_w: int, frame_h: int, margin: int = 2) -> bool:
    xs, ys = corners[:, 0], corners[:, 1]
    return bool(xs.min() <= margin or ys.min() <= margin or
                xs.max() >= frame_w - margin or ys.max() >= frame_h - margin)


def score_plate_crop(crop_bgr: np.ndarray, corners: np.ndarray, frame_w: int, frame_h: int,
                      cfg: QualityGateConfig) -> QualityScore:
    """Runs the composite quality check on one plate detection.

    `corners` are the 4 OBB corner points (frame-global pixel coords, shape (4, 2)).
    """
    h, w = crop_bgr.shape[:2]
    blur_var = laplacian_blur_variance(crop_bgr)
    boundary_cut = is_boundary_cut_off(corners, frame_w, frame_h)

    if cfg.reject_boundary_cutoff and boundary_cut:
        return QualityScore(False, "drop", 0.0, blur_var, w, h, boundary_cut,
                             reason="plate clipped by frame edge")
    if w < cfg.min_width or h < cfg.min_height:
        return QualityScore(False, "drop", 0.0, blur_var, w, h, boundary_cut,
                             reason=f"crop too small ({w}x{h})")
    if blur_var < cfg.min_blur_variance:
        return QualityScore(False, "drop", 0.0, blur_var, w, h, boundary_cut,
                             reason=f"too blurry (Laplacian var={blur_var:.1f})")

    size_score = min(1.0, w / cfg.target_width)
    blur_score = min(1.0, blur_var / cfg.good_blur_variance)
    composite = 0.5 * size_score + 0.5 * blur_score

    tier = "medium" if composite < cfg.enhance_threshold else "high"
    return QualityScore(True, tier, composite, blur_var, w, h, boundary_cut)

def order_obb_corners(corners: np.ndarray) -> np.ndarray:
    """Sorts 4 arbitrary corner points into [top-left, top-right, bottom-right, bottom-left]."""
    pts = np.asarray(corners, dtype=np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def warp_plate(image_bgr: np.ndarray, corners: np.ndarray,
                out_size: tuple[int, int] = (224, 64)) -> np.ndarray:
    """Perspective-warps the quadrilateral defined by `corners` (in `image_bgr`'s
    coordinate frame) onto a flat `out_size` (w, h) rectangle."""
    ordered = order_obb_corners(corners)
    w, h = out_size
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(ordered, dst)
    return cv2.warpPerspective(image_bgr, M, (w, h))


def _reference_length(strings: list[str]) -> int:
    """Most common string length, used as the target width for alignment."""
    from collections import Counter
    lengths = [len(s) for s in strings if s]
    return Counter(lengths).most_common(1)[0][0]


def _align_to_length(s: str, target_len: int) -> str:
    """Aligns `s` onto a string of length `target_len` using Levenshtein editops
    against a same-length blank reference, so insertions/deletions don't just
    shift every later character out of position (naive position-voting would).
    Returns a string of exactly `target_len` characters, using '_' for gaps."""
    if len(s) == target_len:
        return s

    import Levenshtein

    reference = "_" * target_len
    ops = Levenshtein.editops(s, reference)
    aligned = list(s)
    for op, src_pos, dst_pos in reversed(ops):
        if op == "delete":
            aligned[src_pos] = ""
        elif op == "insert":
            aligned.insert(src_pos, "_")
    aligned_str = "".join(aligned)
    if len(aligned_str) < target_len:
        aligned_str += "_" * (target_len - len(aligned_str))
    return aligned_str[:target_len]


def align_by_edit_distance(candidates: list[str]) -> list[str]:
    """Aligns a list of OCR strings of possibly-unequal length onto a common
    length so they can be voted on character-by-character."""
    candidates = [c for c in candidates if c]
    if not candidates:
        return []
    target_len = _reference_length(candidates)
    return [_align_to_length(c, target_len) for c in candidates]


def majority_vote_chars(aligned_candidates: list[str]) -> str:
    """Character-level majority vote across pre-aligned, equal-length strings.
    '_' (gap) votes are ignored unless a position is all gaps."""
    from collections import Counter

    if not aligned_candidates:
        return ""
    length = len(aligned_candidates[0])
    out_chars = []
    for pos in range(length):
        votes = Counter(c[pos] for c in aligned_candidates)
        votes.pop("_", None)
        if not votes:
            continue
        out_chars.append(votes.most_common(1)[0][0])
    return "".join(out_chars)


def vote_final_plate(predictions: list[str]) -> str:
    """Full temporal-aggregation step: align then majority-vote."""
    aligned = align_by_edit_distance(predictions)
    return majority_vote_chars(aligned)