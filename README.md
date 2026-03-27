# KesslerX

### Modeling Orbital Risk and Preventing Kessler Syndrome

---

## Problem

The increasing number of satellites and debris in Earth’s orbit is pushing space toward a critical tipping point known as the Kessler Syndrome—a chain reaction where collisions generate more debris, leading to cascading failures.

Current systems:

* Track only known objects
* Ignore untracked debris
* Lack tools to model uncertainty and cascading risk

---

## Solution

KesslerX is an orbital risk intelligence system designed to model and visualize conditions that could lead to Kessler Syndrome.

It:

* Simulates satellite motion using real orbital data
* Models uncertainty zones for untracked debris
* Detects potential high-risk interactions
* Demonstrates how cascading risks can emerge
* Provides mitigation strategies
* Explains decisions using an AI-based analysis layer

---

## Key Idea

Instead of predicting exact collisions, KesslerX models risk under uncertainty to better understand and prevent cascade scenarios.

---

## Features

* Satellite orbit simulation
* Uncertainty zone modeling (debris risk)
* Risk detection (close approach, high-risk zones)
* Scenario injection for controlled demonstrations
* Mitigation suggestions
* Deep Analysis (AI-based explanation)

---

## Architecture

```text
Frontend (React + Three.js)
        ↓
Simulation Engine
        ↓
Risk Detection
        ↓
Uncertainty Modeling
        ↓
AI Explanation (RAG)
```

---

## Tech Stack

| Layer      | Technology                     |
| ---------- | ------------------------------ |
| Frontend   | React (Vite), Three.js         |
| Backend    | FastAPI (Python)               |
| AI Layer   | RAG (LLM-based explanation)    |
| Data       | TLE Satellite Data (CelesTrak) |
| State Mgmt | Zustand / Context API          |
| Styling    | Tailwind CSS (optional)        |

---

## Data Approach

Due to incomplete debris tracking:

* Risk is approximated using:

  * orbital altitude
  * satellite density
  * predefined high-risk regions

This reflects real-world conditions where uncertainty is unavoidable.

---

## Demo Flow

1. Satellites orbit Earth
2. A risk scenario is injected
3. The system detects potential danger
4. Risk zones and alerts are displayed
5. Deep Analysis explains how the situation could contribute to a cascade event

---

## Impact

* Helps understand and visualize Kessler Syndrome risk
* Improves space situational awareness
* Supports decision-making under uncertainty

---

## Team

* Abhinav Ranade
* Aryan Mahabale
* Avanish Darade
* Drashith Hegde

---

## Note

KesslerX focuses on understanding and preventing cascading orbital failures, not exact real-world prediction.
