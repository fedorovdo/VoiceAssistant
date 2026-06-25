import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

declare global {
  interface Window {
    voiceAssistant?: {
      platform: NodeJS.Platform;
      notifyRendererReady?: () => void;
    };
  }
}

interface ErrorBoundaryState {
  errorMessage?: string;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : "unknown renderer startup error"
    };
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <main className="startup-error">
          <h1>VoiceAssistant could not start the interface.</h1>
          <p>{sanitizeStartupError(this.state.errorMessage)}</p>
        </main>
      );
    }

    return this.props.children;
  }
}

function RendererReadySignal() {
  React.useEffect(() => {
    window.voiceAssistant?.notifyRendererReady?.();
  }, []);

  return null;
}

function sanitizeStartupError(message: string): string {
  return message
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]")
    .slice(0, 240);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  document.body.innerHTML = "<main class=\"startup-error\"><h1>VoiceAssistant could not start the interface.</h1><p>root element was not found</p></main>";
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <RendererReadySignal />
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
