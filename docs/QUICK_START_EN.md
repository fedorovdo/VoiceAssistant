# VoiceAssistant Windows Quick Start

VoiceAssistant is a local technical discussion assistant. It helps explain technical phrases, questions, and commands during a conversation, but it is not a universal meeting transcription product.

## 1. Download

Download the portable file `VoiceAssistant-0.2.0-x64.exe` from GitHub Releases:

`https://github.com/OWNER/VoiceAssistant/releases`

No installation is required. Put the file in any convenient folder and run it.

## 2. First Launch and SmartScreen

The build is currently unsigned. Windows SmartScreen may warn that the publisher is unknown.

Run the file only if you trust the download source and have verified the release SHA-256 checksum.

## 3. API Key Setup

Open **Settings** and add an OpenAI API key when you need:

- microphone speech recognition;
- GPT answers;
- GPT enrichment after a local answer in hybrid mode.

Do not publish your API key in issues, screenshots, or logs.

## 4. Microphone

1. Open Settings.
2. Click **Request microphone permission**.
3. Select an audio input device.
4. Click **Refresh devices** if the list does not update.

Device names may be hidden by Windows/Electron until microphone permission is granted.

## 5. Manual Mode

Manual mode is best when you want to decide exactly when to ask.

1. Select **Manual** mode.
2. Type text manually or use microphone STT.
3. Review the recognized text in the top panel.
4. Click **Ask**.

Manual Ask is less strict because the user explicitly confirmed the action.

## 6. Live Assist Mode

Live Assist automatically answers completed technical questions and useful technical fragments.

1. Select **Live Assist**.
2. Select STT provider: `mock`, `disabled`, or `microphone`.
3. Click **Start**.
4. Say a technical question or short request.

Live Assist uses phrase buffering, topic context, duplicate protection, and a bounded request queue. Ignored or noisy fragments should not erase the last useful answer.

## 7. Answer Source Modes

- **Local knowledge only**: searches the bundled catalog and never calls GPT. After microphone transcription, a local answer does not require a GPT request.
- **Local knowledge + GPT**: shows a fast local answer first, then may enrich it with GPT.
- **GPT only**: skips local knowledge and requires an API key.

Important: microphone recognition currently uses OpenAI transcription, so real microphone STT still requires an API key and internet access even when answers are local-only.

## 8. Languages

- **Interface language** controls UI labels and settings.
- **Answer language** controls the requested answer language.

For example, the UI can be Russian while answers are requested in English.

## 9. Local Knowledge

Local knowledge uses the bundled in-memory catalog for Linux, Docker, Kubernetes, networking, Active Directory, Git, Proxmox, and Samba.

It does not cover every possible administration question, but it answers common commands and concepts quickly without a GPT call.

## 10. Stop and Clear

- **Stop** stops recording and active processing, while recent topic context may remain briefly in memory.
- **Clear** removes recognized text, the answer, queue, duplicates, buffers, and context.

Audio is not intentionally saved to disk.

## Common Errors

### Backend port occupied during development

If `127.0.0.1:8787` is busy during development, run:

```powershell
npm run check:ports
npm run stop:dev
```

### Missing API key

Microphone recognition and GPT-only mode require an OpenAI API key. Add it in Settings.

### Microphone access denied

Check Windows microphone permissions and request permission again from Settings.

### STT 502

This is usually a temporary provider, network, or API error. Check internet access and the API key, then try again.

### Duplicate application instance

If the app is already running, the second instance exits with `VoiceAssistant is already running.`
