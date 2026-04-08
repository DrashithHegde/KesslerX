# KesslerX

### Orbital Risk and Space Debris Cascade Simulation Platform

---

## Overview

KesslerX is a real-time orbital intelligence and risk analysis system designed to monitor satellite motion, detect potential collision risks, model uncertain debris environments, and simulate cascading orbital events.

It transforms raw orbital data into actionable insights using a combination of physics-based modeling, machine learning, and AI-driven explanations.

Unlike traditional tracking tools, KesslerX goes beyond known objects to model **uncertainty and hidden risk in Earth’s orbital environment**.

---

##  Problem Statement

Earth’s orbit is increasingly congested with active satellites and debris, leading to a growing risk of collisions.

A major threat is the **Kessler Syndrome**, where collisions generate debris that trigger further collisions, potentially making orbital regions unusable.

Existing systems:

* Focus on tracking known objects
* Provide raw positional data

But they lack:

* intuitive visualization
* uncertainty-aware modeling
* explainable risk insights

---

## 🎯 Solution

KesslerX is a **decision-support and simulation system** that:

* Tracks satellites in real time
* Detects close approaches and risk events
* Models uncertain and potentially dangerous regions
* Generates explainable insights using AI

---

## 🛰️ Key Features

### 🌍 Live 3D Visualization

* Interactive Earth with satellites and debris
* Smooth orbital motion using real-time propagation
* Cinematic and minimal UI

---

###  Physics-Based Orbital Engine

* Uses TLE (Two-Line Element) data
* Propagates motion using SGP4
* Predicts satellite positions over time

---

### ⚠️ Dynamic Risk Detection

* Identifies close approaches (conjunctions)
* Computes:

  * Time of Closest Approach (TCA)
  * Minimum separation distance
* Assigns a risk score

---

### 🌫️ Uncertainty Zone Modeling

* Divides space into spatial regions (lat/lon grid)

* Evaluates:

  * object density
  * debris ratio
  * velocity variance
  * orbital instability
  * anomaly score (ML)

* Outputs probabilistic risk zones (not exact threats)

---

### 🤖 Machine Learning (Anomaly Detection)

* Model: Isolation Forest (scikit-learn)
* Detects:

  * unusual clustering
  * abnormal orbital behavior
* Contributes to uncertainty scoring

---

### 💥 Scenario Simulation Engine

* Inject synthetic satellites
* Trigger collision events
* Generate debris clouds
* Simulate cascade effects

---

### 🎬 Cinematic Simulation Mode

* Focus on selected object and relevant threats
* Reduces clutter for clearer analysis

---

### ⏱️ Timeline & Event System

* Precomputed event timestamps (6-hour window)

* Displays:

  * close approaches
  * high-risk events
  * collision points

* Color-coded markers

* Events remain fixed during playback (no recomputation)

---

### 📊 Deep Analysis Dashboard

* Risk score
* Closest objects
* Debris environment metrics
* Orbital regime
* Structured insights

---

### 🧠 AI Operational Brief (RAG)

* Model: Gemini 2.5 Flash
* Uses structured system outputs as context
* Generates:

  * explanation
  * reasoning
  * mitigation suggestions

> AI is used for explainability, not core decision-making.

---

## ⚙️ Tech Stack

### Frontend

* React (Vite)
* Three.js + React Three Fiber
* Tailwind CSS

---

### Backend

* FastAPI (Python)
* httpx
* pydantic + dotenv

---

### Orbital Computation

* satellite.js (frontend)
* python-sgp4 (backend)

---

### Data

* Space-Track TLE API
* Local cache

---

### Machine Learning

* scikit-learn (Isolation Forest)
* NumPy

---

### AI / RAG

* Gemini 2.5 Flash
* LangChain (wrapper only)

---

### Optional Infrastructure

* Redis (caching & simulation state)
* Docker (deployment)

---

## 🔄 System Workflow

1. Fetch satellite data (TLE)
2. Propagate orbits using SGP4
3. Detect close approaches
4. Compute risk scores
5. Generate uncertainty zones
6. Apply anomaly detection
7. Simulate scenarios
8. Generate AI insights

---

## 👥 Who Benefits

### 🛰️ Satellite Operators (small–mid scale)

* Improved risk awareness
* Better understanding of close approaches

---

### 🧠 Researchers & Students

* Learn orbital mechanics visually
* Experiment with simulations

---

### 📊 Space Analytics & Consulting

* Decision-support and demonstration tool

---

### 🌍 Space Sustainability & Policy Groups

* Visualize debris growth
* Understand cascade risks

---

### 🎓 Educational Use

* Makes complex space concepts intuitive
* Strong visualization-driven learning

---

## ⚠️ Scope & Limitations

* Not a real-time control system
* Does not execute collision avoidance maneuvers
* Depends on public TLE data
* Uncertainty zones are probabilistic
* Limited simulation window (6 hours)

---

## 🚀 Future Scope

* Temporal smoothing of uncertainty zones
* Advanced ML models
* Long-term debris prediction
* Real maneuver simulation
* Integration with real-world systems

---

## 💡 Positioning

KesslerX is not just a tracker—it is an **orbital intelligence system** that combines physics, machine learning, and AI to provide deeper insights into collision risk, uncertainty, and space sustainability.

---

## 🏁 Getting Started

### Prerequisites

* Node.js (v18+)
* Python (v3.10+)

---

### Backend Setup

```bash
cd server
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate (Windows)
pip install -r requirements.txt

# Run server
python run.py
```

---

### Frontend Setup

```bash
cd client
npm install
npm run dev
```

---

## 🎯 Final Tagline

From orbital data to actionable intelligence — understanding risk, uncertainty, and the future of space.
