# MeetWithAI Architecture Specification

## 1. High-Level Architecture & Tech Stack

- **Project Scaffolding:** `npm init`, `git init`, and `everything claude code init`
- **Database (Supabase):** PostgreSQL handling `Users`, `Meetings`, `ActionItems`, and `OAuth_Tokens` (to manage refresh lifecycles). Relational constraints and stored procedures.
- **Backend (Node.js + Express):** The secure routing layer responsible for executing OAuth token exchanges, interacting with external enterprise APIs (Microsoft/Google), and providing a fallback AI endpoint.
- **Frontend (Vite + React PWA):** The client-facing dashboard handling media capture, offline caching, and local WebGPU AI inference.

---

## 2. Frontend Progressive Web App (PWA) Layer

- **PWA Core:**
  - `vite-plugin-pwa`: Generates the service worker for offline caching and the `manifest.json`.
  - `@vite-pwa/assets-generator`: Automatically creates iOS/Android splash screens and icons from a single logo file.

- **Media & Audio Capture:**
  - **Web Audio API & `react-audio-voice-recorder`:** Provides the visual UI and low-level capture for live in-room microphone recording.
  - **`react-media-recorder`:** Enables capturing system audio, video, or a browser tab screen share.
  - **`react-speech-recognition`:** Wraps the native Web Speech API for real-time dictation before AI summarization.

- **Local AI Inference (WebLLM):**
  - Utilizes `@mlc-ai/web-llm` to download quantized models into the browser's IndexedDB cache.
  - Implements `WebWorkerMLCEngineHandler` in a dedicated Web Worker (`worker.ts`) to ensure the React UI thread does not freeze during heavy text generation.

---

## 3. Backend API & Enterprise Ingestion Layer

- **Authentication & Token Refresh Loop:**
  - The Express backend receives the OAuth callback from Supabase.
  - Securely encrypts and stores the provider's `access_token` and `refresh_token` in the Supabase database.
  - Middleware checks token expiration before any Graph/Workspace API call, using the refresh token to request a new access token if necessary.

- **Microsoft Teams Ingestion (Microsoft Graph API):**
  - Route: `GET /api/meetings/teams`
  - Uses the stored Microsoft access token to query `/me/onlineMeetings` and download the associated `callTranscripts`.

- **Google Meet Ingestion (Google Workspace API):**
  - Route: `GET /api/meetings/google`
  - Uses the stored Google access token to query the Google Meet REST API (`conferenceRecords`) or Google Drive API to locate and download the most recent meeting transcript.

---

## 4. The Hybrid Summarization Pipeline

A two-tier pipeline ensuring the application remains free while guaranteeing reliability for all users:

1. **Tier 1: Client-Side Processing (Primary):** When a user ends a live recording or fetches a cloud transcript, the frontend evaluates `navigator.gpu`. If supported, the transcript is passed to the WebLLM Web Worker, generating the summary locally at zero cost using the user's hardware.
2. **Tier 2: Server-Side Fallback (Secondary):** If the browser lacks WebGPU support or memory limits are exceeded, the frontend triggers a fallback `POST /api/summarize` request. The Express backend receives the transcript, forwards it to the **OpenRouter API** (`openrouter/free` model) for processing, and returns the JSON summary to the client.

---

## 5. Cybersecurity

- **OAuth Callback Route:** Express (`GET /auth/callback`) using `@supabase/ssr` with Supabase PKCE flow to exchange authorization codes for sessions.
- **Token Security:** `CookieOptions` configured so user sessions and Microsoft/Google provider tokens are stored strictly in `HttpOnly` and `Secure` cookies.
- **XSS Prevention:** No fallback to `localStorage` for sensitive tokens.
