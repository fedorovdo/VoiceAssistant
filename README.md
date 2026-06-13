# VoiceAssistant

VoiceAssistant is a local technical learning assistant for live conversations. It helps developers, DevOps engineers, managers, designers, and junior specialists understand technical questions and terms without turning the app into a general meeting recorder.

## Project Structure

```text
VoiceAssistant/
  apps/
    desktop/   Electron + React + Vite UI
    backend/   Local Fastify API
  packages/
    shared/    Shared types, Live Assist detector, and local knowledge cards
  docs/
```

## Install

Use Node.js 20 or newer.

```bash
npm install
```

## Development Launch

The backend and Electron desktop app can still be started in separate terminals. From the repository root, start the backend:

```bash
npm run dev:backend
```

Then start the Electron desktop app in another terminal:

```bash
npm run dev:desktop
```

The backend is available at `http://127.0.0.1:8787` with `GET /health`, `POST /api/assistant/answer`, and `POST /api/speech/transcribe`.

## One-command Launch

To start both development processes in one terminal with separate `backend` and `desktop` labels:

```bash
npm run dev:all
```

On Windows, the PowerShell helper can be launched from the repository root:

```powershell
.\scripts\start-dev.ps1
```

If the local PowerShell execution policy blocks scripts, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

Press `Ctrl+C` to stop the backend, Vite server, and Electron process together.

## Windows Packaging

Build an unpacked Windows application directory for local packaging checks:

```bash
npm run package:desktop
```

Build a portable Windows executable:

```bash
npm run dist:desktop
```

Artifacts are written to `apps/desktop/release/`. The portable target does not require an installer or administrator rights for a normal launch.

The packaged app contains a bundled copy of the local backend. Electron checks `http://127.0.0.1:8787/health` at startup, reuses an existing VoiceAssistant backend when available, or starts its own backend child process. A single-instance lock prevents duplicate packaged app processes, and a backend child started by Electron is stopped when the app exits.

### Current Packaging Limitation

Windows packaging is experimental. The portable executable is currently unsigned and may trigger a Windows SmartScreen warning. Port `8787` must be available unless another VoiceAssistant backend is already running, and the app does not yet provide a UI for changing that production port.

## Manual Mode

Manual mode keeps the user in control. Type text, start Mock STT, or transcribe microphone audio, then review the recognized dialogue and click **Ask** in the panel controls. Manual Ask is an explicit user-confirmed action, so it accepts cleaned non-empty text even when it is a command phrase rather than a formal question. It checks local knowledge first, then uses GPT fallback or enrichment when an API key is configured. The button remains available for disabled, mock, and microphone STT providers.

The desktop workspace supports **Vertical** and **Horizontal** panel layouts. Choose the layout in Settings, then drag the splitter between recognized dialogue and the assistant answer to resize the panels. Double-click the splitter to restore an even 50/50 split; the selected layout and splitter ratio are saved locally.

## Live Assist Mode

Live Assist remains conservative: it classifies each completed Mock STT or microphone transcript as an explicit technical question, a technical term, or ignored conversation. Only suitable fragments are answered automatically, with debounce, throttling, duplicate prevention, and no parallel answer requests.

Live answers are designed for mixed audiences and stay concise. Learning mode may provide a longer explanation.

## Local Knowledge Cards

VoiceAssistant includes an expanded in-memory practical command reference for Linux troubleshooting, Docker and Docker Compose, Kubernetes, networking, Windows and Active Directory, Proxmox, and Git. It covers service and log diagnostics, filesystems and permissions, containers and images, kubectl troubleshooting, port and DNS checks, Group Policy and AD replication, virtualization storage, backups, and everyday version-control commands. Cards contain concise Russian explanations, practical bullets, commands, Russian and English aliases, and related terms.

Manual Ask and Live Assist check these cards before waiting for GPT. A matching card is shown immediately with the source label **local knowledge**, and it works without an API key. In interview and learning modes, a configured GPT provider may enrich that result while the local card stays visible; the source changes clearly when the GPT response arrives. Without a local match, an API key is required for a GPT answer.

Matching is conservative and normalizes Russian and English aliases. Short generic words such as `pod` or `free` require question or technical context to avoid noisy answers.

The matcher returns only the top one or two practical cards so command answers remain compact during a conversation. The reference works without an API key; GPT enrichment remains optional when configured.

Common practical commands and troubleshooting questions work fully offline without an API key. This remains a curated TypeScript catalog rather than full book, document, or semantic search, and it is not yet a database or user-editable knowledge base.

## Mock STT

Mock STT is a simulation for development. Demo fragments appear only after **Start** is clicked. **Stop** pauses the simulation and **Clear** removes accumulated demo fragments and resets Live Assist duplicate tracking.

Mock STT remains available for testing recognized fragments and Live Assist behavior without using a microphone.

## Experimental Microphone STT

The `microphone` provider captures short audio chunks from the selected input device after the user explicitly clicks **Start**. Chunks are produced with `MediaRecorder` about every four seconds and sent one at a time to the local backend for OpenAI transcription.

Microphone STT is experimental:

- an OpenAI API key must be present in desktop settings before audio is uploaded;
- recognized text passes through local noise filtering before it is appended or considered by Live Assist;
- short filler, unsupported-script noise, duplicates, and likely incomplete questions may be skipped or briefly buffered for more context;
- audio chunks are held in memory and are never saved to disk;
- the local backend forwards each accepted chunk to OpenAI for transcription;
- only one transcription request is processed at a time, and extra chunks may be dropped while it is busy;
- chunk count, byte size, MIME type, and transcription status remain visible in the UI;
- accepted, cleaned text is appended to the top dialogue panel;
- in Live Assist mode, recognized technical fragments can automatically produce an explanation in the answer panel.

Recognition quality still depends on speech clarity, microphone quality, and the surrounding environment. Skipping noisy or incomplete fragments is intentional so Live Assist does not answer accidental transcription output.

Clicking **Stop**, changing the STT provider, unmounting the renderer, or closing the app stops the recorder and all active media tracks. If a saved input device is unavailable, the recorder falls back to the system default microphone and displays a warning.

Real microphone STT and its Live Assist integration remain experimental. In manual mode, microphone text still requires the user to click **Ask**.

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
