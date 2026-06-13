# VoiceAssistant

VoiceAssistant is a local technical learning assistant for live conversations. It helps developers, DevOps engineers, managers, designers, and junior specialists understand technical questions and terms without turning the app into a general meeting recorder.

## Project Structure

```text
VoiceAssistant/
  apps/
    desktop/   Electron + React + Vite UI
    backend/   Local Fastify API
  packages/
    shared/    Shared types and Live Assist fragment detector
  docs/
```

## Install

Use Node.js 20 or newer.

```bash
npm install
```

## Run

Start the backend:

```bash
npm run dev:backend
```

Then start the Electron desktop app:

```bash
npm run dev:desktop
```

The backend is available at `http://127.0.0.1:8787` with `GET /health` and `POST /api/assistant/answer`.

## Manual Mode

Manual mode keeps the user in control. Type text or start Mock STT, review the recognized dialogue, and click **Ask** to request an answer.

## Live Assist Mode

Live Assist classifies each completed mock fragment as an explicit technical question, a technical term, or ignored conversation. Matching fragments are sent automatically to the existing answer endpoint with debounce, throttling, and duplicate prevention.

Live answers are designed for mixed audiences and stay concise. Learning mode may provide a longer explanation.

## Mock STT

Mock STT is a simulation for development. Demo fragments appear only after **Start** is clicked. **Stop** pauses the simulation and **Clear** removes accumulated demo fragments and resets Live Assist duplicate tracking.

Real speech-to-text is not implemented yet. Mock STT remains available for testing recognized fragments and Live Assist behavior.

## Microphone Recording Foundation

The `microphone` provider captures short audio chunks from the selected input device after the user explicitly clicks **Start**. Chunks are produced locally with `MediaRecorder` about every four seconds.

This foundation is for recording diagnostics only:

- audio chunks stay in memory and are not saved to disk;
- only chunk count, byte size, and MIME type are shown in the UI;
- no speech-to-text is performed;
- no audio is sent to the backend;
- no audio is sent to OpenAI.

Clicking **Stop**, changing the STT provider, unmounting the renderer, or closing the app stops the recorder and all active media tracks. If a saved input device is unavailable, the recorder falls back to the system default microphone and displays a warning.

## Languages

- **Interface language** controls desktop labels, status text, settings, and messages. Russian is the default.
- **Answer language** controls the requested language for assistant explanations.

These settings are independent, so the interface can be Russian while answers are requested in English, or the reverse.

## Microphone Selection

Settings can enumerate browser/Electron audio input devices. Device names may be hidden until microphone permission is granted. The permission helper opens a temporary audio stream, stops all tracks immediately, and refreshes the list.

The selected device ID is stored in renderer `localStorage` and is used by the local microphone recorder.

## AI Providers

Without an API key, the backend uses `MockAiProvider`. To use OpenAI, enter a key in desktop settings or set `OPENAI_API_KEY` locally. A suitable example model is `gpt-4.1-mini`.

Do not commit real API keys. Keep `.env` local and use `.env.example` only as a template.

## Verification

```bash
npm run test:backend
npm run build
```

Automated tests do not require a real OpenAI key.
