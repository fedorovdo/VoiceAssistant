# Changelog

## [0.2.0]

### Added

- Real microphone recording and OpenAI transcription.
- Manual and Live Assist modes.
- Local-only, hybrid, and GPT-only answer sources.
- Offline knowledge catalog.
- RU/EN interface.
- Flexible vertical/horizontal layout.
- Windows portable packaging.
- Continuous Live Assist request queue.
- Local knowledge packs for Linux, Docker, Kubernetes, networking, Active Directory, Git, Proxmox, and Samba.

### Improved

- Russian technical term normalization.
- Transcript buffering and cleanup.
- Context-aware technical questions.
- Local answer routing.
- Windows development launcher and process cleanup.

### Known limitations

- Windows is the primary tested platform.
- Real-time recognition quality depends on microphone quality and speech clarity.
- OpenAI transcription requires internet access and a valid API key.
- Local knowledge does not cover every possible administration question.
- Experimental STT may occasionally split or misrecognize technical phrases.

## [0.1.0]

### Added

- Initial Electron, React, Vite, Fastify, and shared TypeScript scaffold.
- Mock text-to-answer flow for local MVP testing.
