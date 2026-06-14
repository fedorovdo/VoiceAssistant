import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLanguage } from "@voiceassistant/shared";

export type TranscriptionStatus =
  | "idle"
  | "waiting_for_audio"
  | "transcribing"
  | "received"
  | "missing_api_key"
  | "error";

interface UseChunkTranscriptionOptions {
  backendUrl: string;
  apiKey: string;
  language: AppLanguage;
  onTranscript: (text: string) => void;
}

export function useChunkTranscription(options: UseChunkTranscriptionOptions) {
  const { backendUrl, apiKey, language, onTranscript } = options;
  const activeRef = useRef(false);
  const inFlightRef = useRef(false);
  const sessionRef = useRef(0);
  const abortControllerRef = useRef<AbortController>();
  const onTranscriptRef = useRef(onTranscript);
  const [status, setStatus] = useState<TranscriptionStatus>("idle");

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

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
      setStatus("missing_api_key");
      return;
    }

    const session = sessionRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;
    setStatus("transcribing");

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

      if (!response.ok) {
        throw new TranscriptionRequestError(
          response.status,
          data.error || `Speech transcription failed with status ${response.status}.`
        );
      }

      if (session !== sessionRef.current || !activeRef.current) {
        return;
      }

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
        logTranscriptionError(error, trimmedApiKey, chunk);
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

  return { status, startSession, stopSession, transcribeChunk };
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

function logTranscriptionError(error: unknown, apiKey: string, chunk: Blob) {
  if (!import.meta.env.DEV) {
    return;
  }

  const rawMessage = error instanceof Error ? error.message : "Unknown transcription error";
  const message = rawMessage
    .replaceAll(apiKey, "[redacted]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .slice(0, 240);

  console.warn("Microphone transcription failed", {
    responseStatus: error instanceof TranscriptionRequestError ? error.responseStatus : "unavailable",
    backendError: message,
    chunkSize: chunk.size,
    chunkType: chunk.type || "unknown"
  });
}
