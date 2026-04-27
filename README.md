# AdaptIQ — Adaptive Learning Intelligence

> 🏆 **1st Place — Claude NJIT Hackathon 2026**

**[🚀 Live Demo](https://adapt-iq-dun.vercel.app/)**

AdaptIQ is a real-time, multimodal AI assistant that analyzes your body language, facial expressions, and voice during mock interview sessions to provide adaptive, empathetic support. It detects when you're confused, disengaged, or overwhelmed — and responds with intelligent interventions tailored to your cognitive profile.

Built for the **Economic Empowerment and Education** track, AdaptIQ is designed to level the playing field for neurodivergent job seekers. 1 in 5 Americans are neurodivergent, yet standard virtual interview formats rarely account for how differently people process and communicate information.

---

## Demo

> **No install needed** — runs entirely in the browser.  
> Visit **[adapt-iq-dun.vercel.app](https://adapt-iq-dun.vercel.app/)**, allow camera/mic access, select a cognitive profile, and start a mock session.

---

## What It Does

AdaptIQ runs a continuous **Perceive → Process → Act** loop:

1. **Perceives** — captures webcam and microphone input, extracting facial landmarks, eye gaze, head pose, and audio features locally on your device
2. **Processes** — sends semantic metadata (not raw video) to Claude via API for reasoning about your current state
3. **Acts** — delivers real-time interventions, adjusts support style, and surfaces live feedback on a dashboard

---

## Features

- 🎭 **Multimodal perception** — face mesh tracking, eye gaze estimation, head pose analysis, blink rate, and audio processing
- 🧠 **Claude-powered reasoning** — interprets your biometric state and decides on empathetic, context-aware interventions
- 👤 **Three cognitive profiles** — tailored modes for ADHD, Anxiety, and ASD with different intervention styles and sensitivity thresholds
- 📊 **Live biometric dashboard** — real-time metrics including Gaze Deviation Score, Head Pose Drift, Vocal Energy Spread, Speech Rate, and more
- 🎯 **Session scoring** — end-of-session breakdown across Eye Contact, Head Stability, Vocal Confidence, and Speech Clarity with an overall grade
- 🔔 **Smart interventions** — non-intrusive overlay cards triggered when anomalies are detected (e.g. frantic eye movement, long silences)
- 🔒 **Privacy-first** — only semantic metadata is sent to the cloud; raw video never leaves your device

---

## Cognitive Profiles

| Profile | Focus | Intervention Style |
|---|---|---|
| **ADHD** | Attention & engagement | High-energy, frequent micro-breaks, gamification cues |
| **Anxiety** | Calm & regulation | Breathing prompts, reduced visual noise, reassuring check-ins |
| **ASD** | Structure & predictability | Consistent pacing, explicit transitions, clear progress markers |

---

## Metrics Tracked

**Biometric Signals**
- Gaze Deviation Score (GDS)
- Head Pose Drift (HPD)
- Blink Rate Analysis (BRA)
- Vocal Energy Spread (VES)
- Speech Rate (SR)

**Derived Scores**
- Off-Screen Ratio (OSR)
- Engagement Time (ET)
- Cognitive Engine Score (CES)
- Silence/Latency Ratio (SILR)
- Pitch Variance Score (PVS)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Face & Gaze Tracking | MediaPipe Face Mesh, face-api.js |
| Audio Analysis | Meyda.js (real-time audio features) |
| AI Reasoning | Claude Sonnet (Anthropic API) |
| Frontend | Vanilla HTML/CSS/JS, Chart.js |
| Hosting | Vercel |

---

## Project Structure

```
├── frontend/         # UI components and dashboard
├── perception/       # Face mesh, gaze, and audio processing
├── integration/      # API orchestration and Claude integration
├── demo/             # Demo assets
├── PRD-details/      # Product requirements and design docs
├── index.html        # Main AdaptIQ dashboard
└── projectplan.md    # Architecture and implementation roadmap
```

---

## Getting Started

### Prerequisites
- A modern browser (Chrome recommended)
- Webcam and microphone
- Anthropic API key

### Run Locally

```bash
git clone https://github.com/YOUR_USERNAME/adaptiq.git
cd adaptiq

# Serve with any static server
npx serve .
```

Then open `http://localhost:3000`.

---

## How It Works

All sensor data is abstracted into a lightweight JSON state before being sent to Claude:

```json
{
  "gazeDeviation": 2.3,
  "headPoseDrift": 12.5,
  "blinkRate": 4,
  "speechRate": 85,
  "offScreenRatio": 0.3,
  "profile": "adhd"
}
```

Claude interprets this state and returns either a natural language intervention or triggers a UI action — like pausing the session or surfacing a breathing prompt.

**Target latency: < 500ms end-to-end.**

---

## Built By

Built at the **Claude NJIT Hackathon 2026** — themed around social impact inspired by Anthropic CEO Dario Amodei's essay *Machines of Loving Grace*.

- [Sneh Bhatt](https://www.linkedin.com/in/sneh-bhatt-/)
- [Aagam Ambavi](https://www.linkedin.com/in/aagam-ambavi/)
- [Mayukha Ajeesh Ramsha Nath](https://www.linkedin.com/in/mayukha-ar/)
- [Rishab Mohandoss](https://www.linkedin.com/in/rishab-mohandoss/)

---

## License

MIT
