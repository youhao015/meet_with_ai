# MeetWithAI — Zero-Cost AI Meeting Assistant

**MeetWithAI** is a privacy-first, zero-subscription AI meeting recorder and summarizer designed to eliminate costly bot fees (Otter, Fireflies) and avoid unwanted bot intrusions in your meetings.

It runs **in-browser audio capture**, **continuous live transcription**, and a **two-tier hybrid AI summarization pipeline** that leverages your device's GPU (via WebGPU) for completely private, free local inference.

---

## ✨ Features

- **🎙️ Dual-Stream Audio Capture**: Records system/tab audio (Google Meet, Zoom Web, Teams) combined with your microphone via the Web Audio API (`AudioContext`).
- **📝 Live Speech-to-Text**: Continuous browser-native speech recognition with automatic silence recovery and interim-to-final transcript stitching.
- **⚡ Two-Tier Hybrid AI Summarization**:
  - **Tier 1 (Local WebGPU)**: Runs WebLLM (`Llama-3.2-1B-Instruct` / `SmolLM2-1.7B-Instruct`) entirely inside your browser via WebGPU. 100% private, 0 API costs.
  - **Tier 2 (Cloud Fallback)**: Automatically falls back to the backend service via OpenRouter multi-model chain (`llama-3.2-3b` → `llama-3.1-8b` → `mistral-7b` → rule-based heuristic) if WebGPU is unavailable or encounters OOM.
- **💾 Meeting Vault & Audio Storage**: Synced to Supabase PostgreSQL with full-text search, action item checklists, and audio playback from Supabase Storage (`meeting-recordings`).
- **📲 Progressive Web App (PWA)**: Full offline asset precaching, installable on desktop and mobile with service worker caching via Workbox.
- **🎨 Glassmorphic Dark UI**: Deep space palette (`#090d16`), glowing gradients, micro-animations, and fluid responsive design.

---

## 🏗️ Architecture

```
User Audio (Tab + Mic)
         │
         ▼
[ Web Audio API ] ────► Audio Recording (.webm Blob)
         │                         │
         ▼                         ▼
[ SpeechRecognition ]       [ Supabase Storage ]
         │                    (meeting-recordings/)
         ▼
   Full Transcript
         │
         ├───► Tier 1: WebGPU WebLLM (In-Browser Worker)
         │          └─ Model: Llama-3.2-1B / SmolLM2
         │          └─ Streaming JSON output
         │
         └───► [Fallback] Tier 2: Express Backend (/api/summarize)
                    ├─ OpenRouter API (Multi-model chain)
                    └─ Rule-based Heuristic parser
                           │
                           ▼
               [ Supabase PostgreSQL ]
                    (meetings + action_items)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm
- A Supabase account (free tier)
- Optional: An [OpenRouter](https://openrouter.ai/) API key for Tier 2 cloud summarization

### 1. Clone & Install Dependencies

```bash
# Frontend dependencies
npm install

# Backend server dependencies
cd server
npm install
cd ..
```

### 2. Configure Environment Variables

**Frontend (`.env`):**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://localhost:3001
```

**Backend (`server/.env`):**
```env
PORT=3001
CORS_ORIGIN=http://localhost:5173
OPENROUTER_API_KEY=your-openrouter-api-key  # Optional: falls back to heuristic if unset
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Setup Supabase Database

Run the SQL script in [`supabase/schema.sql`](supabase/schema.sql) in your **Supabase Dashboard → SQL Editor**:
- Creates `meetings`, `action_items`, `oauth_tokens` tables with Row Level Security (RLS).
- Sets up the `meeting-recordings` storage bucket and access policies for audio files.

### 4. Run Locally

Start both the backend server and frontend development server:

```bash
# Terminal 1: Backend
cd server
npm run dev

# Terminal 2: Frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge (WebGPU supported browsers).

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Workbox PWA, Lucide Icons, `@mlc-ai/web-llm`
- **Backend**: Express, TypeScript, CORS, OpenRouter SDK / fetch
- **Database & Storage**: Supabase (PostgreSQL, Storage, Auth, RLS)
- **Styling**: Vanilla CSS Design System with dark-mode glassmorphic variables

---

## 🔒 Privacy & Security

- Audio is processed directly in your browser.
- When Tier 1 WebGPU is active, transcripts **never leave your device** for summarization.
- Supabase Row Level Security (RLS) ensures only authenticated users can access their own recordings and meeting notes.
