# VoiceAssistant

VoiceAssistant is a local technical learning assistant for live conversations. It helps developers, DevOps engineers, managers, designers, and junior specialists understand technical questions and terms without turning the app into a general meeting recorder.

## Download for Windows

Download the latest portable build from GitHub Releases: `https://github.com/OWNER/VoiceAssistant/releases`.

Current release artifact: `VoiceAssistant-0.2.0-x64.exe`.

No installation is required. Download the EXE, place it in a convenient folder, and run it. The application is currently unsigned, so Windows SmartScreen may warn that the publisher is unknown. Choose **More info** only if you trust the downloaded file and its checksum.

Quick start:

1. Download the portable EXE.
2. Start VoiceAssistant.
3. Open Settings.
4. Add an OpenAI API key when microphone transcription or GPT answers are needed.
5. Select a microphone.
6. Select Manual or Live Assist.
7. Select Local-only, Hybrid, or GPT-only.
8. Press Start.

Local-only answers do not require a GPT API call after transcription. Experimental microphone STT currently uses OpenAI transcription, so microphone recognition still requires an API key and internet access. Disabled and mock STT modes can be used without real audio transmission.

VoiceAssistant is a local technical discussion assistant. It is also described in Russian as: Помощник для технических обсуждений.

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

The development supervisor owns the backend, Vite, and Electron process trees. Closing the Electron window normally stops Vite and the backend and returns a successful exit code; cleanup termination codes are not reported as false lifecycle failures. A real non-zero Electron or dev-server exit remains a failure with its original code. Starting a second Electron instance prints `VoiceAssistant is already running.` and shuts down the newly started development services cleanly. `Ctrl+C` follows the same cleanup path.

## Development Troubleshooting

If a previous Node.js, Vite, Fastify, or Electron development session did not shut down cleanly, check the two VoiceAssistant ports:

```powershell
npm run check:ports
```

Stop only the processes listening on the backend and Vite development ports, plus Electron processes whose command line clearly belongs to this repository:

```powershell
npm run stop:dev
```

Run the backend tests and the complete production build with either command:

```powershell
npm run verify
npm run verify:win
```

Run the canonical local knowledge smoke suite independently with:

```powershell
npm run test:knowledge
```

Launcher exit classification can be checked independently with `npm run test:launcher`.

The regression cases exercise the production local lookup and protect core offline Linux, Docker, Kubernetes, Git, Active Directory, and networking questions from silent matching regressions.

`EADDRINUSE` for `127.0.0.1:8787` means another process is already listening on the Fastify backend port. Run `npm run check:ports` to inspect its PID, then `npm run stop:dev` before starting a fresh development session.

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

## Release Verification

Before publishing a Windows build, run:

```powershell
npm run release:check
npm run release:checksum
```

`release:check` stops stale development processes, runs the knowledge, backend, launcher, build, Windows verification, and packaged renderer smoke-test suites, builds the portable EXE, checks the versioned filename and size, scans generated text/config assets for real-looking OpenAI API keys, verifies packaged renderer/preload readiness, and runs `git diff --check`.

`release:checksum` writes `VoiceAssistant-0.2.0-x64.exe.sha256` next to the portable EXE. The checksum file contains the SHA-256 hash and release filename.

For a focused packaged app check after building `dist:desktop`, run:

```powershell
npm run test:packaged
```

## Manual Mode

Manual mode keeps the user in control. Type text, start Mock STT, or transcribe microphone audio, then review the recognized dialogue and click **Ask** in the panel controls. Manual Ask is an explicit user-confirmed action, so it accepts cleaned non-empty text even when it is a command phrase rather than a formal question. It checks local knowledge first, then uses GPT fallback or enrichment when an API key is configured. The button remains available for disabled, mock, and microphone STT providers.

The desktop workspace supports **Vertical** and **Horizontal** panel layouts. Choose the layout in Settings, then drag the splitter between recognized dialogue and the assistant answer to resize the panels. Double-click the splitter to restore an even 50/50 split; the selected layout and splitter ratio are saved locally.

## Live Assist Mode

Live Assist remains conservative: it classifies each completed Mock STT or microphone transcript as an explicit technical question, a technical term, or ignored conversation. A focused intent-rescue check prevents practical admin questions from being falsely ignored when a question/help phrase is paired with a clear technical term such as Linux, sudo, firewall, systemctl, Docker, or Kubernetes. Ordinary conversation, lyrics-like fragments, and questions without technical context remain ignored. Suitable complete requests enter a bounded FIFO queue with one active answer transaction and up to five pending requests. Exact normalized duplicates are filtered before enqueueing; distinct questions are never discarded merely because they use the same topic or local card.

Topic introductions such as `Давайте поговорим о Kubernetes` set the in-memory conversation topic without requesting an immediate answer. Live Assist then waits for a question or command request and can qualify short follow-ups such as `Какие основные команды?` or `Как посмотреть логи?` with that topic. Explicit requests trigger answers normally, while non-technical conversation remains ignored.

Live answers are designed for mixed audiences and stay concise. Learning mode may provide a longer explanation.

The **Live Assist sensitivity** setting controls how readily automatic answers are produced:

- **Conservative** answers only clear technical questions and strong command/help requests. Topic introductions only set context, and near-duplicate cooldown is stricter. This suits quieter meetings.
- **Balanced** is the default and preserves the normal Live Assist behavior for everyday use.
- **Active** also treats short technical or troubleshooting fragments as requests when a topic is known, for example `основные команды`, `логи контейнера`, or `контейнер не стартует`. It still rejects obvious noise and exact duplicates, while allowing more distinct same-topic follow-ups for learning sessions.

The selected sensitivity is stored with the other desktop settings, shown in the Live Assist badge, and included in development decision diagnostics.

Live Assist also keeps a lightweight in-memory context of up to ten recent accepted fragments for roughly 90 seconds. It detects the current broad technical topic, may combine a topic-setting phrase with the next question, and can wait briefly when a phrase appears incomplete. A useful unanswered request remains pending for about 25 seconds, so a later ignored or noisy STT fragment does not erase it before the answer flow runs. Local knowledge checks the newest or pending request first and then the compact aggregate, while GPT receives the aggregate. Cooldown blocks exact and near-duplicate questions without suppressing a clearly different follow-up on the same topic.

Before making an automatic decision, Live Assist briefly buffers nearby accepted speech fragments into one utterance. Short pieces such as `Как дать права?`, `В Linux.`, and `sudo.` are combined before classification and local knowledge lookup. A clearly complete technical question can flush immediately; otherwise the buffer waits for punctuation, up to three fragments, or a short idle pause. This reduces premature answers caused by experimental STT chunk boundaries.

The Live Assist badge includes a compact processing state: listening, transcribing, collecting a phrase, deciding, searching local knowledge, requesting GPT, answered, no local match, or processing error. A nearby **Queued: N** badge shows complete requests waiting behind the active transaction. The indicators are intentionally small and do not replace the recognized text, answer, or collapsed diagnostics.

Complete punctuated technical questions flush immediately. Semantically complete text without punctuation uses a roughly 900 ms idle flush, while incomplete starts such as `Как проверить...`, `В Linux...`, `Например...`, and `Команда для...` continue waiting for another fragment. In **Local knowledge only** mode, a strong local match is rendered synchronously after flush and does not wait for GPT debounce or topic cooldown; exact duplicates remain blocked.

Development builds include collapsed Live Assist and STT diagnostics. Use **Show diagnostics** below the recognized text to inspect the newest fragment, its transcript event and request IDs, queue decision, pending count, sanitizer and utterance decisions, lookup result, answer revision, pending context, topic, classification, answer-source mode, final decision, reason, and remaining cooldown. Timing fields cover audio chunk creation, transcription start/completion, utterance flush, local lookup, GPT request, answer rendering, and total time from the latest audio chunk to the answer. The compact audio status stays visible while detailed diagnostics are hidden. Diagnostics contain no API keys, raw audio, or persisted conversation data and are intended for tuning automatic-answer behavior.

The STT cleanup stage protects complete action-oriented technical questions, including common Linux password and port requests, before applying short-fragment noise rules. Exact repeated transcripts are reported separately from noise and suppressed for a short window; after that window, or after **Clear**, the same question can be processed again. Development diagnostics show the sanitizer decision, reason, technical-question protection, and duplicate result.

While recording continues, Live Assist briefly shows terminal states such as **Answer ready**, duplicate, no match, or error and then returns to **Listening**. Duplicate protection compares exact normalized utterances: a differently worded request may reuse the same topic or local card immediately. Local-only answers bypass topic and GPT throttling when the newest complete request has a strong local match, so switching Linux → Docker → Linux does not leave stale topic state behind.

Conversation context, the pending utterance buffer, and the Live request queue exist only in renderer memory. **Stop** cancels the active and queued answer work while preserving recent topic context for a quick resume until its TTL expires. **Clear** additionally removes the recognized dialogue, current answer, queue, duplicate cache, contexts, timers, processing state, and development traces. None of this state is written to disk or added to the microphone upload.

For Russian speech, accepted STT fragments also pass through a conservative technical-term normalizer. Common spoken or distorted forms such as `Кубернетес`, `кубси тейл`, `докер образ`, and `журнал контрол` are converted to canonical terms before topic detection, local knowledge matching, and GPT prompting. Only the normalized text and an in-memory replacement summary are retained; this context is not saved to disk.

## Local Knowledge Cards

VoiceAssistant includes an expanded in-memory practical command reference for Linux troubleshooting, Docker and Docker Compose, Kubernetes, networking, Windows and Active Directory, Proxmox, and Git. It covers service and log diagnostics, filesystems and permissions, Linux sudo/sudoers, user groups, firewall and SSH security checks, containers and images, kubectl troubleshooting, port and DNS checks, Group Policy and AD replication, virtualization storage, backups, and everyday version-control commands. Cards contain concise Russian explanations, practical bullets, commands, Russian and English aliases, and related terms.

The catalog is organized into modular topic packs under `packages/shared/src/knowledge/`: Linux, Docker, Kubernetes, networking, Active Directory, Git, and Proxmox. The central registry validates pack metadata and unique card IDs, then preserves the established global card order used by local matching.

To add a local knowledge card safely:

1. Choose the matching topic module in `packages/shared/src/knowledge/`.
2. Add the card without reusing an existing ID.
3. Add a canonical query to `localKnowledgeRegressionCases.ts`.
4. Run `npm run test:knowledge`.
5. Run `npm run verify:win`.

Broad practical questions such as `Как дать права в Linux?` are answered locally with a short guide to `chmod`, `chown`, `sudo`, and user groups, without requiring an API key.

Dockerfile questions such as `Что такое Dockerfile?` and common Russian STT variants are normalized and answered from the same local reference.

Local matching also recognizes common Russian question forms such as `Что такое ...?`, `Из чего состоит ...?`, `Расскажи про ...` and `Для чего нужен ...?`, including practical singular/plural variants such as `порт` and `порты`.

Manual Ask and Live Assist check these cards before waiting for GPT. A matching card is shown immediately with the source label **local knowledge**, and it works without an API key. In interview and learning modes, a configured GPT provider may enrich that result while the local card stays visible; the source changes clearly when the GPT response arrives. Without a local match, an API key is required for a GPT answer.

Linux security coverage includes focused SELinux and firewall troubleshooting. These cards prefer audit logs, permissive mode, and narrowly opening required ports over permanently disabling protection. A broad request such as `Отключить безопасность` needs Linux context and returns clarification-oriented guidance rather than blanket disable commands.

Linux knowledge also separates Samba file-server setup, SMB client access, share configuration, and the Samba Active Directory Domain Controller role. Installation guidance covers both RHEL-like and Debian-like systems, share guidance keeps filesystem and Samba permissions distinct, and client examples avoid plaintext passwords in command history. Short follow-ups can reuse the latest in-memory Samba role, while dance and music references remain outside technical matching.

The Networking Core cards cover opening versus checking ports, the TCP/IP and OSI models, protocol-to-layer mapping, and common network topologies. Live Assist keeps a 90-second in-memory networking context with a broad topic, subtopic, and focused protocol/entity. Short follow-ups such as `Сколько уровней?`, `На каком уровне работает?`, or `А IP?` use only the latest accepted networking context; rejected noise does not replace or refresh it, and Clear resets it immediately. Stop preserves the context for a quick resume until its TTL expires. Russian STT variants `ОСИ`/`ОЗИ` and likely `OCI` are normalized to `OSI` only near networking-model terms, while Oracle Cloud Infrastructure wording is preserved.

In **Local knowledge only** mode, Manual Ask and Live Assist use the same local lookup. Live Assist automatically renders a matched card as soon as the buffered utterance is complete; unmatched or ignored fragments update only the compact status and do not clear the last useful answer.

Local-only mode includes a concise Kubernetes/kubectl command overview, so common requests such as `основные команды Kubernetes`, `команды kubectl`, and Pod log checks can be answered without GPT.

Matching is conservative and normalizes Russian and English aliases. Short generic words such as `pod` or `free` require question or technical context to avoid noisy answers.

The matcher returns only the top one or two practical cards so command answers remain compact during a conversation. The reference works without an API key; GPT enrichment remains optional when configured.

Common practical commands and troubleshooting questions work fully offline without an API key. This remains a curated TypeScript catalog rather than full book, document, or semantic search, and it is not yet a database or user-editable knowledge base.

## Answer Source Modes

The **Answer source** setting controls how Manual Ask and Live Assist produce explanations:

- **Local knowledge only** searches the bundled cards and never calls GPT. It works fully offline without an API key; Live Assist quietly skips suitable fragments that have no local match.
- **Local knowledge + GPT** is the default. It shows a fast local answer when available, then may enrich interview or learning answers with GPT. With no local match, GPT is used when an API key is configured.
- **GPT only** skips local knowledge and sends suitable requests directly to GPT. This mode requires an API key.

The selected mode is stored locally with the other desktop settings. Existing installations default to **Local knowledge + GPT** to preserve the previous behavior.

## Mock STT

Mock STT is a simulation for development. Demo fragments appear only after **Start** is clicked. **Stop** pauses the simulation and **Clear** removes accumulated demo fragments and resets Live Assist duplicate tracking.

Mock STT remains available for testing recognized fragments and Live Assist behavior without using a microphone.

## Experimental Microphone STT

The `microphone` provider captures short audio chunks from the selected input device after the user explicitly clicks **Start**. Chunks are produced with `MediaRecorder` about every four seconds and sent one at a time to the local backend for OpenAI transcription.

Microphone STT is experimental:

- an OpenAI API key must be present in desktop settings before audio is uploaded;
- recognized text passes through local noise filtering before it is appended or considered by Live Assist;
- common Russian STT distortions of technical terms are normalized before topic detection and local matching;
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
