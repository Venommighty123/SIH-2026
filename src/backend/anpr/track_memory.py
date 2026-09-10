"""
Fail-safe track memory (Stage 2 of the architecture).

ByteTrack/BoT-SORT gives each vehicle a persistent Track_ID, but if the
'vehicle' class is missed for a frame or two (e.g. a close-up bumper shot
where the box briefly falls out of view), the raw tracker can drop the ID.
A small constant-velocity Kalman filter per track "coasts" the last known
box forward for a capped number of frames so plate detections in those
frames can still be associated with the right vehicle, without letting a
track live forever on pure guesswork.
"""

from __future__ import annotations
from typing import Optional
import cv2
import numpy as np

BBox = tuple[float, float, float, float]


def _bbox_to_cxcywh(bbox: BBox) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0, x2 - x1, y2 - y1


def _cxcywh_to_bbox(cx: float, cy: float, w: float, h: float) -> BBox:
    return cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0


class VehicleKalmanMemory:
    """One instance per vehicle Track_ID. State = [cx, cy, w, h, vcx, vcy, vw, vh]."""

    def __init__(self, max_coast_frames: int = 8):
        self.max_coast_frames = max_coast_frames
        self.coast_count = 0
        self.initialized = False
        self.low_confidence = False

        self.kf = cv2.KalmanFilter(8, 4)
        self.kf.transitionMatrix = np.eye(8, dtype=np.float32)
        for i in range(4):
            self.kf.transitionMatrix[i, i + 4] = 1.0
        self.kf.measurementMatrix = np.eye(4, 8, dtype=np.float32)
        self.kf.processNoiseCov = np.eye(8, dtype=np.float32) * 1e-2
        self.kf.measurementNoiseCov = np.eye(4, dtype=np.float32) * 1e-1

    def update(self, bbox: BBox) -> None:
        """Call whenever the vehicle class was actually detected this frame."""
        cx, cy, w, h = _bbox_to_cxcywh(bbox)
        measurement = np.array([[cx], [cy], [w], [h]], dtype=np.float32)
        if not self.initialized:
            self.kf.statePost = np.array([cx, cy, w, h, 0, 0, 0, 0], dtype=np.float32).reshape(8, 1)
            self.initialized = True
        else:
            self.kf.predict()
            self.kf.correct(measurement)
        self.coast_count = 0
        self.low_confidence = False

    def predict_if_missed(self) -> Optional[BBox]:
        """Call when the vehicle class was NOT detected this frame. Returns a
        coasted bbox to keep the Track_ID alive, or None once the track has
        coasted past `max_coast_frames` (caller should then flag/drop it)."""
        if not self.initialized:
            return None
        self.coast_count += 1
        if self.coast_count > self.max_coast_frames:
            self.low_confidence = True
            return None
        state = self.kf.predict()
        cx, cy, w, h = float(state[0]), float(state[1]), float(state[2]), float(state[3])
        return _cxcywh_to_bbox(cx, cy, max(w, 1.0), max(h, 1.0))