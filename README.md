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
  "text": "Из чего состоит Kubernetes?",
  "mode": "interview"
}
```

## Run Desktop

Start the backend first, then run:

```bash
npm run dev:desktop
```

For the first MVP, speech recognition is simulated: type recognized text in the top panel and click **Ask**. The mock assistant answer appears in the bottom panel.

## MVP Roadmap

1. Add microphone capture in the desktop app.
2. Add replaceable speech-to-text provider.
3. Connect the OpenAI provider behind the existing `AiProvider` interface.
4. Add answer streaming for lower perceived latency.
5. Persist settings locally and pass selected model/language to the backend.
6. Improve technical question detection with scoring and language-aware rules.
7. Package the Windows desktop app for local installation.
