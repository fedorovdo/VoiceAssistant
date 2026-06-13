# VoiceAssistant

VoiceAssistant is a fast local desktop helper for technical questions. It is intentionally not a universal meeting assistant: the MVP focuses on short technical question fragments, quick detection, and concise answers during technical conversations or interview practice.

## Project Structure

```text
VoiceAssistant/
  apps/
    desktop/   Electron + React + Vite UI
    backend/   Local Fastify API
  packages/
    shared/    Shared TypeScript types
  docs/
```

## Install

Use Node.js 20 or newer.

```bash
npm install
```

## Run Backend

```bash
npm run dev:backend
```

The backend starts on `http://127.0.0.1:8787`.

Useful endpoints:

- `GET /health`
- `POST /api/assistant/answer`

Example request:

```json
{
  "text": "Что такое Kubernetes?",
  "mode": "interview",
  "model": "gpt-4.1-mini",
  "apiKey": "optional user key"
}
```

## Mock Mode

Mock mode is the default when no API key is provided. Leave the API key field empty in desktop settings, or call the backend without `apiKey` and without `OPENAI_API_KEY`.

```json
{
  "text": "Как работает Kubernetes?",
  "mode": "short"
}
```

This returns a deterministic local mock answer and does not contact OpenAI.

## Real OpenAI Mode

To use real answer generation, provide an OpenAI API key in the desktop settings or set `OPENAI_API_KEY` in your local environment before starting the backend.

Recommended first model value:

```text
gpt-4.1-mini
```

The backend uses the official OpenAI npm package and the Responses API. Do not commit real API keys. Keep `.env` local and use `.env.example` only as a template.

## Run Desktop

Start the backend first, then run:

```bash
npm run dev:desktop
```

For this MVP, speech recognition uses a desktop STT provider setting. Choose `mock` to simulate recognized technical phrases with **Start**, or `disabled` to keep recognition off and type text manually. Click **Ask** to send the recognized text to the backend. The answer appears in the bottom panel.

Settings are saved in browser `localStorage` for the desktop renderer.

### Microphone Device Selection

Open **Settings** to choose an audio input device. Use **Refresh devices** to scan again after connecting or removing a microphone. The selected device ID is stored in `localStorage`, but VoiceAssistant does not record or send audio yet.

Browsers and Electron may hide microphone names until permission is granted. Use **Request microphone permission** to grant access; VoiceAssistant immediately stops the temporary media stream and refreshes the device list.

## Tests

Backend tests do not require a real OpenAI key.

```bash
npm run test:backend
```

## MVP Roadmap

1. Add microphone capture in the desktop app.
2. Add replaceable speech-to-text provider.
3. Add answer streaming for lower perceived latency.
4. Persist richer settings with an Electron-safe storage layer.
5. Improve technical question detection with scoring and language-aware rules.
6. Package the Windows desktop app for local installation.
