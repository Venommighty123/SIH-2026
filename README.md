<div align="center">

# 🚗 RAASTA — City-Wide AI Engine for Multi-Camera ANPR, Trajectory Tracking & Urban Traffic Analytics

[![SIH 2026](https://img.shields.io/badge/SIH-2026-orange?style=for-the-badge)](https://www.sih.gov.in/)
[![Theme](https://img.shields.io/badge/Theme-Smart%20Automation-blue?style=for-the-badge)]()
[![Category](https://img.shields.io/badge/Category-Software-green?style=for-the-badge)]()
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://sih-final-e78f.vercel.app/)

**Team:** Jobless Coders &nbsp;|&nbsp; **PS ID:** SIH26127 &nbsp;|&nbsp; **Team ID:** *(Not yet assigned)*

</div>

---

## 1. Project Information

| Field | Details |
|---|---|
| **Project Title** | RAASTA – City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics |
| **PS ID** | SIH26127 |
| **PS Title** | City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics |
| **Category** | Software |
| **Theme** | Smart Automation |
| **Team Name** | Jobless Coders |
| **Team ID** | *(Not yet assigned)* |

---

## 2. Problem Statement

Urban traffic management systems today lack the intelligence to correlate vehicle movements across multiple CCTV cameras spread across a city. Existing ANPR systems work in isolation per camera and cannot build a complete trajectory or history of a vehicle's movement across different locations. This makes it difficult for traffic authorities and law-enforcement to:

- Track suspected or stolen vehicles city-wide in real time.
- Measure actual travel times and congestion patterns between intersections.
- Identify traffic hotspots and high-density zones proactively.
- Maintain an auditable vehicle movement history for forensic use.

---

## 3. Proposed Solution

**RAASTA** is an end-to-end AI pipeline that processes CCTV video feeds from multiple city cameras, detects and tracks vehicles, reads license plates, and stitches together a city-wide trajectory for every unique vehicle. A web-based operator console provides real-time analytics, map visualizations, and instant plate search.

```
CCTV Feeds (Multiple Cameras)
        |
        v
+------------------------------+
|  Stage 1 - Vehicle Tracker   |  YOLOv11 + Kalman Filter + Fine-tuned Plate Detector
|  (run_stage1.py)             |  -> crop manifest CSV + annotated video
+------------------------------+
        |
        v
+------------------------------+
|  Stage 2 - OCR Engine        |  Real-ESRGAN Enhancement -> PARSeq OCR
|  (run_stage2.py)             |  -> Temporal majority-vote per track
+------------------------------+
        |
        v
+------------------------------+
|  Analytics & Storage         |  Aggregated plate readings + trajectory data
+------------------------------+
        |
        v
+------------------------------+
|  Frontend Console (RAASTA)    |  React + MapLibre GL - live dashboard & search
+------------------------------+
```

---

## 4. Key Features

- 🎥 **Live Camera Feed Dashboard** – Multi-camera view with real-time vehicle counts
- 🔍 **Automatic Number Plate Recognition (ANPR/OCR)** – PARSeq-based OCR with temporal vote aggregation for high accuracy
- 🚗 **Multi-Camera Vehicle Detection & Tracking** – YOLOv11 + Kalman filtering across frames
- 🗺️ **Vehicle Trajectory Mapping** – Reconstructs a vehicle's city-wide path across camera zones
- 📊 **Real-Time Traffic Density Analytics** – Per-zone and per-timeframe vehicle counts
- 🔥 **Heatmap / Hotspot Visualization** – Identifies congestion zones on an interactive city map (MapLibre GL)
- 🔎 **License Plate Search & Lookup** – Instant query into detection history
- ⏱️ **Vehicle Speed / Travel Time Estimation** – Calculated between known camera geopoints
- 🚨 **Alert System for Stolen / Wanted Vehicles** – Flagging on plate match
- 📁 **Historical Data Export / Reports** – CSV-based export of plate readings and trajectories

---

## 5. Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite 8 | Build tool & dev server |
| TailwindCSS 4 | Styling |
| MapLibre GL | Interactive map & trajectory visualization |
| Recharts | Traffic analytics charts |
| TanStack Query (React Query) | Server state & data fetching |
| Zustand | Client-side state management |
| React Router DOM 7 | SPA routing |
| Lucide React | Icon library |

### Backend / AI Pipeline

| Technology | Purpose |
|---|---|
| Python 3.13 | Core language |
| Ultralytics YOLOv11 | Vehicle detection & plate detection |
| PARSeq | License plate OCR |
| Real-ESRGAN | Plate crop super-resolution & enhancement |
| Kalman Filter | Smooth per-vehicle tracking |
| pandas | Data aggregation & manifest handling |
| Python-Levenshtein | Plate string fuzzy matching |
| PyTorch | Model inference backend |
| HuggingFace Transformers | PARSeq model loading |

### Deployment

| Layer | Platform |
|---|---|
| Frontend | Vercel |
| Backend / Pipeline | On-premise / Local GPU server |

---

## 6. Architecture

See [`docs/architecture.md`](./docs/architecture.md) for the full architecture diagram.

```
+------------------------------------------+
|           CCTV Camera Network             |
|  (Camera 1 ... Camera N, geo-tagged)      |
+------------------+-----------------------+
                   | video streams
                   v
+------------------------------------------+
|         AI ANPR Pipeline (Python)         |
|                                           |
|  +--------------+  +-----------------+   |
|  |   Stage 1    |  |    Stage 2      |   |
|  |  YOLO Track  |->|  OCR + Voting   |   |
|  +--------------+  +--------+--------+   |
+---------------------------------+--------+
                                  | plate_readings.csv
                                  v
+------------------------------------------+
|         Analytics & Data Layer            |
|  (trajectory reconstruction, heatmaps)    |
+------------------+-----------------------+
                   | REST / JSON
                   v
+------------------------------------------+
|     RAASTA Operator Console (React)        |
|  Dashboard | Map | Search | Alerts        |
+------------------------------------------+
```

---

## 7. Repository Structure

```
SIH-2026/
├── README.md                    <- You are here
├── SUBMISSION_GUIDE.md
├── submission/
│   ├── PRESENTATION.md          <- Link to final PPT
│   └── DEMO.md                  <- Demo video link
├── src/
│   ├── frontend/                <- React + Vite operator console
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── backend/                 <- Python ANPR pipeline
│       ├── anpr/                <- Core pipeline modules
│       │   ├── config.py
│       │   ├── common.py
│       │   ├── track_memory.py
│       │   ├── enhancement.py
│       │   ├── ocr_ensemble.py
│       │   ├── testing_yolo.py  (Stage 1 tracker)
│       │   ├── main.py          (Stage 2 OCR)
│       │   ├── run_pipeline.py  (end-to-end runner)
│       │   ├── run_stage1.py
│       │   └── run_stage2.py
│       ├── models/              <- YOLO & plate detector weights
│       ├── scripts/
│       ├── pyproject.toml
│       └── tracker.yaml
├── docs/
│   └── architecture.md
├── assets/
│   └── screenshots/
└── .gitignore
```

### What goes where?

| Item | Location |
|---|---|
| AI pipeline source code | `src/backend/anpr/` |
| Frontend console source | `src/frontend/src/` |
| Architecture / technical docs | `docs/` |
| Screenshots / prototype photos | `assets/screenshots/` |
| Demo video link | `submission/DEMO.md` |
| Project overview | `README.md` |

---

## 8. Live Demo

| Resource | Link |
|---|---|
| 🌐 **Live Web Console** | [sih-final-e78f.vercel.app](https://sih-final-e78f.vercel.app/) |
| 🎬 **Demo Video** | [Google Drive](https://drive.google.com/file/d/1TkkZ-_Psv4Eg3j2BPpEcQE_6gJWsUxmL/view?usp=drivesdk) |

---

## 9. Final Presentation

The final SIH presentation is linked in [`https://drive.google.com/file/d/1xCVSm5f2r3LkisYntVF_1LcoaO-3ti60/view?usp=sharing`](./submission/PRESENTATION.md).

---

## 10. Screenshots / Prototype Photos

Important screenshots of the operator console, map view, and pipeline outputs are in:

```
assets/screenshots/
```



---

## 11. Installation & Setup

### Prerequisites

- **Node.js** >= 20 and **npm** (for frontend)
- **Python** >= 3.13 (for backend pipeline)
- **GPU** with CUDA support recommended for real-time inference
- **uv** package manager (recommended) or `pip`

---

### Frontend (Operator Console)

```bash
# Clone the repository
git clone <YOUR_REPOSITORY_URL>
cd SIH-2026/src/frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API base URL

# Start development server
npm run dev
```

The console will be available at `http://localhost:5173`.

---

### Backend (ANPR Pipeline)

```bash
cd SIH-2026/src/backend

# Using uv (recommended)
uv sync

# OR using pip
pip install -r requirements.txt
```

Configure the pipeline by editing `anpr/config.py` (or set `ANPR_*` environment variables):

```python
# Key settings in config.py
VIDEO_PATH = "path/to/your/video.mp4"
OUT_DIR    = "output/"
DEVICE     = "cuda"   # or "cpu"
```

---

## 12. Run

### Run the full ANPR pipeline (Stage 1 -> Stage 2)

```bash
cd src/backend
python anpr/run_pipeline.py
```

### Run stages individually

```bash
# Stage 1: Vehicle tracking + plate crop extraction
python anpr/run_stage1.py

# Stage 2: OCR + temporal vote aggregation
python anpr/run_stage2.py --manifest output/<video_run>/plate_crops_manifest.csv

# Preview results
python anpr/preview_results.py
```

### Run the frontend console

```bash
cd src/frontend
npm install   # first time only
npm run dev
```

---

## 13. Future Scope

- **Real-time streaming ingestion** — Replace file-based pipeline with RTSP/WebRTC live stream processing using a message queue (Kafka / Redis Streams).
- **Federated multi-city deployment** — Horizontal scaling across multiple city nodes with a central aggregation layer.
- **Stolen/wanted vehicle national DB integration** — Direct API hook into VAHAN/NCRB databases for real-time flagging.
- **Edge inference on cameras** — Deploy lightweight YOLO models directly on smart IP cameras (NVIDIA Jetson) to reduce bandwidth.
- **Predictive traffic analytics** — Time-series forecasting of congestion patterns using historical trajectory data.
- **Mobile app for field officers** — Companion app for on-ground officers to do instant plate lookups tied to the NETRA backend.
- **Improved OCR accuracy** — Fine-tune PARSeq on Indian regional plate fonts and low-light / rain conditions.

---

## Important

Before submission, make sure the repository is **publicly accessible** to reviewers.

**Do NOT upload** passwords, API keys, access tokens, `.env` files containing secrets, or any other confidential credentials to this repository. Store secrets in `.env` (already in `.gitignore`) and share only via secure channels.

---

<div align="center">
Made with ❤️ by <strong>Jobless Coders</strong> &nbsp;|&nbsp; SIH 2026
</div>
