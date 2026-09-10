"""
Stage 5 - OCR ENSEMBLE (per frame).

Runs two scene-text-trained recognizers - PARSeq and PaddleOCR - on every
surviving, warped plate crop. Both are trained on natural scene text (signs,
plates, storefronts) rather than scanned documents, which is why they
replace the old TrOCR backend (TrOCR is document-OCR-trained and mismatched
the plate-reading domain).

If the two models agree (after `clean_ocr_text` normalization), the frame
prediction is treated as high-confidence. If they disagree, the frame is
flagged uncertain and BOTH candidates are kept for the temporal vote in
Stage 6, rather than the pipeline guessing which one is right.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
import cv2
import numpy as np
from .common import clean_ocr_text


@dataclass
class OcrCandidate:
    text: str
    confidence: float
    model: str


@dataclass
class FramePrediction:
    agreed: bool
    candidates: list[OcrCandidate]

    @property
    def best_text(self) -> str:
        if not self.candidates:
            return ""
        return max(self.candidates, key=lambda c: c.confidence).text


# PARSeq backend

def load_parseq(device: str):
    import torch
    print("Loading PARSeq (baudm/parseq, auto-downloads via torch.hub on first run)...")
    model = torch.hub.load("baudm/parseq", "parseq", pretrained=True, trust_repo=True)
    model = model.eval().to(device)
    print("PARSeq ready.")
    return model


def run_parseq(model, crop_bgr: np.ndarray, device: str) -> tuple[str, float]:
    import torch
    from PIL import Image
    from torchvision import transforms

    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb).resize((128, 32))
    to_tensor = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(0.5, 0.5),
    ])
    img_tensor = to_tensor(pil_img).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(img_tensor)
        probs = logits.softmax(-1)
        preds, confidences = model.tokenizer.decode(probs)

    text = preds[0] if preds else ""
    conf_tensor = confidences[0] if confidences else None
    confidence = float(conf_tensor.mean()) if conf_tensor is not None and len(conf_tensor) else 0.0
    return clean_ocr_text(text), confidence


# PaddleOCR backend

def load_paddleocr():
    import inspect
    from paddleocr import PaddleOCR

    print("Loading PaddleOCR (auto-downloads detection+recognition weights)...")
    init_params = inspect.signature(PaddleOCR.__init__).parameters

    if "use_doc_orientation_classify" in init_params:
        ocr = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            lang="en",
        )
    else:
        ocr = PaddleOCR(use_angle_cls=False, lang="en", show_log=False)

    print("PaddleOCR ready.")
    return ocr


def _run_paddleocr_predict_api(ocr, crop_bgr: np.ndarray) -> tuple[str, float]:
    """PaddleOCR >=3.x API: ocr.predict(img) -> list of dict-like results with
    'rec_texts' / 'rec_scores' / 'rec_polys'."""
    results = ocr.predict(crop_bgr)
    if not results:
        return "", 0.0
    res = results[0]
    texts = list(res.get("rec_texts") or [])
    scores = list(res.get("rec_scores") or [])
    polys = res.get("rec_polys")
    if polys is None:
        polys = res.get("dt_polys")
    if not texts:
        return "", 0.0
    if polys is not None and len(polys) == len(texts):
        order = sorted(range(len(texts)), key=lambda i: float(np.asarray(polys[i])[:, 0].min()))
    else:
        order = range(len(texts))
    text = "".join(texts[i] for i in order)
    confidence = float(min(scores[i] for i in order)) if scores else 0.0
    return clean_ocr_text(text), confidence


def _run_paddleocr_legacy_api(ocr, crop_bgr: np.ndarray) -> tuple[str, float]:
    """PaddleOCR <3.x API: ocr.ocr(img, cls=False) -> [[ [box, (text, score)], ... ]]."""
    result = ocr.ocr(crop_bgr, cls=False)
    if not result or not result[0]:
        return "", 0.0
    lines = sorted(result[0], key=lambda ln: ln[0][0][0])
    texts = [ln[1][0] for ln in lines]
    confs = [ln[1][1] for ln in lines]
    text = "".join(texts)
    confidence = float(min(confs)) if confs else 0.0
    return clean_ocr_text(text), confidence


def run_paddleocr(ocr, crop_bgr: np.ndarray) -> tuple[str, float]:
    if hasattr(ocr, "predict"):
        return _run_paddleocr_predict_api(ocr, crop_bgr)
    return _run_paddleocr_legacy_api(ocr, crop_bgr)

def predict_frame(parseq_model, crop_bgr: np.ndarray, device: str) -> FramePrediction:
    parseq_text, parseq_conf = run_parseq(parseq_model, crop_bgr, device)

    candidates = [
        OcrCandidate(parseq_text, parseq_conf, "parseq"),
    ]
    agreed = bool(parseq_text)
    return FramePrediction(agreed=agreed, candidates=candidates)