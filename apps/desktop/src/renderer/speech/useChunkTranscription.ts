import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLanguage } from "@voiceassistant/shared";

export type TranscriptionStatus =
  | "idle"
  | "waiting_for_audio"
  | "transcribing"
  | "received"
  | "missing_api_key"
  | "error";

export interface TranscriptionDiagnostics {
  chunkSize: number;
  chunkMimeType: string;
  apiKeyPresent: boolean;
  requestStartedAt: string;
  requestCompletedAt?: string;
  responseStatus?: number;
  error?: string;
}

interface UseChunkTranscriptionOptions {
  backendUrl: string;
  apiKey: string;
  language: AppLanguage;
  onTranscript: (text: string) => void;
  onTranscriptionStarted?: (timestamp: number) => void;
  onTranscriptionCompleted?: (timestamp: number) => void;
}

export function useChunkTranscription(options: UseChunkTranscriptionOptions) {
  const { backendUrl, apiKey, language, onTranscript } = options;
  const activeRef = useRef(false);
  const inFlightRef = useRef(false);
  const sessionRef = useRef(0);
  const abortControllerRef = useRef<AbortController>();
  const onTranscriptRef = useRef(onTranscript);
  const onTranscriptionStartedRef = useRef(options.onTranscriptionStarted);
  const onTranscriptionCompletedRef = useRef(options.onTranscriptionCompleted);
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [diagnostics, setDiagnostics] = useState<TranscriptionDiagnostics>();

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onTranscriptionStartedRef.current = options.onTranscriptionStarted;
    onTranscriptionCompletedRef.current = options.onTranscriptionCompleted;
  }, [onTranscript, options.onTranscriptionCompleted, options.onTranscriptionStarted]);

  const stopSession = useCallback(() => {
    activeRef.current = false;
    sessionRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
    inFlightRef.current = false;
    setStatus("idle");
  }, []);

  const startSession = useCallback(() => {
    stopSession();
    activeRef.current = true;
    setStatus(apiKey.trim() ? "waiting_for_audio" : "missing_api_key");
  }, [apiKey, stopSession]);

  const transcribeChunk = useCallback(async (chunk: Blob) => {
    if (!activeRef.current || chunk.size === 0 || inFlightRef.current) {
      return;
    }

    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      if (import.meta.env.DEV) {
        setDiagnostics({
          chunkSize: chunk.size,
          chunkMimeType: chunk.type || "unknown",
          apiKeyPresent: false,
          requestStartedAt: new Date().toISOString(),
          error: "API key is missing before upload."
        });
      }
      setStatus("missing_api_key");
      return;
    }

    const session = sessionRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;
    setStatus("transcribing");
    const requestStartedAt = Date.now();
    onTranscriptionStartedRef.current?.(requestStartedAt);
    if (import.meta.env.DEV) {
      setDiagnostics({
        chunkSize: chunk.size,
        chunkMimeType: chunk.type || "unknown",
        apiKeyPresent: true,
        requestStartedAt: new Date(requestStartedAt).toISOString()
      });
    }

    try {
      const formData = new FormData();
      formData.append("audio", chunk, getChunkFilename(chunk.type));
      formData.append("apiKey", trimmedApiKey);
      formData.append("language", language);

      const response = await fetch(`${backendUrl}/api/speech/transcribe`, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
      const responseBody = await response.text();
      const data = parseTranscriptionResponse(responseBody);
      const requestCompletedAt = Date.now();

      if (import.meta.env.DEV) {
        setDiagnostics((current) => current ? {
          ...current,
          requestCompletedAt: new Date(requestCompletedAt).toISOString(),
          responseStatus: response.status,
          error: response.ok ? undefined : sanitizeDiagnosticMessage(data.error)
        } : current);
      }

      if (!response.ok) {
        if (isMissingApiKeyResponse(response.status, data.error)) {
          logTranscriptionFailure(response.status, data.error, trimmedApiKey.length > 0, chunk);
          if (session === sessionRef.current && activeRef.current) {
            setStatus("missing_api_key");
          }
          return;
        }

        throw new TranscriptionRequestError(
          response.status,
          data.error || `Speech transcription failed with status ${response.status}.`
        );
      }

      if (session !== sessionRef.current || !activeRef.current) {
        return;
      }

      onTranscriptionCompletedRef.current?.(requestCompletedAt);

      const text = data.text?.trim();
      if (text) {
        onTranscriptRef.current(text);
      }
      setStatus("received");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (session === sessionRef.current && activeRef.current) {
        logTranscriptionError(error, trimmedApiKey.length > 0, chunk);
        if (import.meta.env.DEV) {
          setDiagnostics((current) => current ? {
            ...current,
            responseStatus: error instanceof TranscriptionRequestError ? error.responseStatus : current.responseStatus,
            error: error instanceof TranscriptionRequestError
              ? sanitizeDiagnosticMessage(error.message)
              : "Network error while contacting the transcription backend."
          } : current);
        }
        setStatus("error");
      }
    } finally {
      if (session === sessionRef.current) {
        inFlightRef.current = false;
        abortControllerRef.current = undefined;
      }
    }
  }, [apiKey, backendUrl, language]);

  useEffect(() => stopSession, [stopSession]);

  return { status, diagnostics, startSession, stopSession, transcribeChunk };
}

function getChunkFilename(mimeType: string): string {
  if (mimeType.includes("ogg")) return "chunk.ogg";
  if (mimeType.includes("mp4")) return "chunk.mp4";
  return "chunk.webm";
}

class TranscriptionRequestError extends Error {
  constructor(readonly responseStatus: number, message: string) {
    super(message);
    this.name = "TranscriptionRequestError";
  }
}

function parseTranscriptionResponse(responseBody: string): { text?: string; error?: string } {
  try {
    return JSON.parse(responseBody) as { text?: string; error?: string };
  } catch {
    return {};
  }
}

function isMissingApiKeyResponse(status: number, message: string | undefined): boolean {
  return status === 400 && message === "Field 'apiKey' is required.";
}

function sanitizeDiagnosticMessage(message: string | undefined): string | undefined {
  if (!message) {
    return undefined;
  }

  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 240);
}

function logTranscriptionError(error: unknown, apiKeyPresent: boolean, chunk: Blob) {
  if (!import.meta.env.DEV) {
    return;
  }

  const rawMessage = error instanceof Error ? error.message : "Unknown transcription error";
  logTranscriptionFailure(
    error instanceof TranscriptionRequestError ? error.responseStatus : "unavailable",
    rawMessage,
    apiKeyPresent,
    chunk
  );
}

function logTranscriptionFailure(
  responseStatus: number | "unavailable",
  backendError: string | undefined,
  apiKeyPresent: boolean,
  chunk: Blob
) {
  if (!import.meta.env.DEV) {
    return;
  }

  const sanitizedMessage = sanitizeDiagnosticMessage(backendError) || "Unknown transcription error";

  console.log("Microphone transcription failed", {
    responseStatus,
    backendError: sanitizedMessage,
    chunkSize: chunk.size,
    chunkType: chunk.type || "unknown",
    apiKeyPresent
  });
}
