# Architecture

The MVP is intentionally small:

- `apps/desktop` owns the Windows desktop shell and React UI.
- `apps/backend` owns local HTTP endpoints, technical question detection, and AI provider selection.
- `packages/shared` owns shared request/response and settings types.

Speech-to-text and AI generation are replaceable modules. The first working path uses simulated recognized text and `MockAiProvider`, so the app can be tested without an API key.
