# KesslerX

KesslerX is a space surveillance and orbital risk intelligence system that models satellite motion, estimates collision risk (including from untracked debris), and provides explainable, actionable insights to help prevent cascading events like the Kessler syndrome.

---

## 🌍 Impact

- **Space sustainability:** Prevents runaway debris growth and loss of orbital access.
- **Operator safety:** Provides actionable, explainable risk insights for satellite operators and mission planners.
- **Research & education:** Demonstrates uncertainty-aware risk modeling and scenario simulation for the space community.

---

## 🛰️ Key Features

- **Live 3D Globe Visualization:** Real-time, highly performant Three.js + React-Globe rendering of thousands of satellites, debris objects, and their orbital tracks simultaneously.
- **Physics-Accurate SGP4 Engine:** Leverages standard Two-Line Element (TLE) satellite data and the SGP4 propagation model to continuously forecast spatial locations.
- **Dynamic Risk Detection:** Continuously screens the satellite catalog to identify high-risk conjunctions, predicting exact Time of Closest Approach (TCA) and minimum separation distances.
- **ML Uncertainty Modeling:** Analyzes dense orbital shells using an Isolation Forest anomaly detection model to generate hidden/untracked "uncertainty" scores that modify baseline kinetic risks.
- **Generative AI Risk Analyst:** Integrates the Google Gemini API (via RAG) to dynamically convert complex spatial anomalies into actionable English mitigation advice.
- **Interactive Kessler Cascades:** 
  - **Inject Risk:** Empowers the user to artificially introduce a synthetic collision interceptor onto a tracked satellite.
  - **Start Collision:** Triggers a visually immersive cascading explosion, instantly fracturing satellites into a physical debris cloud of 150 tracked fragments that mathematically split from the impact vector and degrade local orbital safety over time.
- **Timeline Scrubbing:** Native controls to advance real-world simulation time backward and forward to review incoming threat forecasts and past behavior.

---

## ⚙️ Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React (Vite), Three.js, Tailwind  |
| Orbital    | satellite.js, python-sgp4         |
| Backend    | FastAPI (Python)                  |
| ML         | scikit-learn (Isolation Forest)   |
| Cache      | Redis                             |
| GenAI      | Google Gemini API (`gemini-2.5`)  |

---

## 🚀 How to Run the Webapp

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (v3.11+)
- **Redis Server** (Must be running locally or remotely to manage synthetic satellite state caches).

### 2. Configure Environment Variables
You will need to set up local environment keys for the system to boot up, specifically the Google Gemini API key:

**Backend (`server/.env`):**
```ini
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Spin up Database Containers
Start up the required background services (Redis for caching synthetic states, and Postgres) using Docker Compose from the repository root:

```bash
docker-compose up -d
```

### 4. Start the Backend Server

```bash
cd server
python -m venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Run the FastAPI server (Runs on port 8000 by default)
fastapi dev main.py
# Or run via the provided runner:
python run.py
```

### 4. Start the Frontend Client

Ensure the backend and your Redis instance are both running. Then start the frontend:

```bash
cd client
npm install
npm run dev
```

The webapp should now be accessible at `http://localhost:5173`.

---

## 🧠 Example Operations

1. **Find an Alert:** Look at the Top Bar dashboard for active threat anomalies in saturated orbits.
2. **Review Risk:** Click on a target. The Deep Analysis Overlay will query the Gemini API to formulate mitigation logic.
3. **Trigger Kessler Benchmark:** Click the `Inject Risk` button located on the Bottom Bar. This will calculate a mathematically flawless interception course.
4. **Initiate Blast:** Click `Start Collision` to witness the SGP4 kinetic disintegration, flooding the region with a tracked debris cloud that immediately threatens surrounding units.

---

## 📚 References

- [Kessler Syndrome - Wikipedia](https://en.wikipedia.org/wiki/Kessler_syndrome)
- [Space-Track.org](https://www.space-track.org/) - Public TLE distribution source.
