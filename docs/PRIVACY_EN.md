# Privacy and Data Flow

This document describes VoiceAssistant behavior in practical terms. It is not a legal guarantee.

## Microphone and Audio

- The microphone starts only after the user clicks **Start**.
- Audio is split into short in-memory chunks.
- The application is not designed to save audio chunks to disk.
- When OpenAI STT is selected, chunks are sent through the local backend to the configured transcription provider.

## Local Knowledge

- After text is recognized, local answers are generated from the bundled knowledge catalog.
- Local knowledge does not require a GPT request.
- Live Assist context, phrase buffers, and request queues exist in renderer memory and are cleared by **Clear** or app exit.

## GPT and Hybrid Mode

- In GPT-only and Local knowledge + GPT modes, recognized text may be sent to OpenAI to generate an answer.
- In Local-only mode, GPT is not called for answers, but microphone recognition through OpenAI STT still sends audio chunks for transcription.

## API Key

- Users provide and control their own OpenAI API key.
- The project does not include a central server that collects user API keys.
- The key is stored locally in app settings.
- Do not publish the key in issues, logs, screenshots, or messages.

## Costs

OpenAI transcription and GPT usage may incur provider charges according to your account plan.
