import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLanguage } from "@voiceassistant/shared";

export type MentorTranscriptionStatus =
  | "idle"
  | "waiting_for_audio"
  | "transcribing"
  | "missing_api_key"
  | "error";

export interface MentorTranscriptionDiagnostics {
  pendingChunks: number;
  processedChunks: number;
  droppedChunks: number;
  lastChunkSize: number;
  lastResponseMs?: number;
  lastError?: string;
}

interface UseMentorTranscriptionQueueOptions {
  backendUrl: string;
  apiKey: string;
  language: AppLanguage;
  onTranscript: (text: string) => void;
  maxPendingChunks?: number;
}

interface QueuedChunk {
  blob: Blob;
  queuedAt: number;
}

const initialDiagnostics: MentorTranscriptionDiagnostics = {
  pendingChunks: 0,
  processedChunks: 0,
  droppedChunks: 0,
  lastChunkSize: 0
};

export function useMentorTranscriptionQueue(options: UseMentorTranscriptionQueueOptions) {
  const maxPendingChunks = options.maxPendingChunks ?? 10;
  const activeRef = useRef(false);
  const sessionRef = useRef(0);
  const inFlightRef = useRef(false);
  const queueRef = useRef<QueuedChunk[]>([]);
  const abortControllerRef = useRef<AbortController>();
  const drainRef = useRef<() => void>(() => undefined);
  const onTranscriptRef = useRef(options.onTranscript);
  const [status, setStatus] = useState<MentorTranscriptionStatus>("idle");
  const [diagnostics, setDiagnostics] = useState<MentorTranscriptionDiagnostics>(initialDiagnostics);

  useEffect(() => {
    onTranscriptRef.current = options.onTranscript;
  }, [options.onTranscript]);

  const stopSession = useCallback(() => {
    activeRef.current = false;
    sessionRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
    inFlightRef.current = false;
    queueRef.current = [];
    setStatus("idle");
    setDiagnostics((current) => ({ ...current, pendingChunks: 0 }));
  }, []);

  const startSession = useCallback(() => {
    stopSession();
    activeRef.current = true;
    setDiagnostics(initialDiagnostics);
    setStatus(options.apiKey.trim() ? "waiting_for_audio" : "missing_api_key");
  }, [options.apiKey, stopSession]);

  const drainQueue = useCallback(async () => {
    if (!activeRef.current || inFlightRef.current) return;

    const queued = queueRef.current.shift();
    if (!queued) {
      setStatus(options.apiKey.trim() ? "waiting_for_audio" : "missing_api_key");
      setDiagnostics((current) => ({ ...current, pendingChunks: 0 }));
      return;
    }

    const apiKey = options.apiKey.trim();
    if (!apiKey) {
      queueRef.current = [];
      setStatus("missing_api_key");
      setDiagnostics((current) => ({ ...current, pendingChunks: 0 }));
      return;
    }

    const session = sessionRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;
    setStatus("transcribing");
    setDiagnostics((current) => ({
      ...current,
      pendingChunks: queueRef.current.length,
      lastChunkSize: queued.blob.size,
      lastError: undefined
    }));
    const startedAt = Date.now();

    try {
      const formData = new FormData();
      formData.append("audio", queued.blob, getChunkFilename(queued.blob.type));
      formData.append("apiKey", apiKey);
      formData.append("language", options.language);

      const response = await fetch(`${options.backendUrl}/api/speech/transcribe`, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
      const responseBody = await response.text();
      const data = parseTranscriptionResponse(responseBody);

      if (!response.ok) {
        if (response.status === 400 && data.error === "Field 'apiKey' is required.") {
          setStatus("missing_api_key");
          return;
        }
        throw new Error(data.error || `Speech transcription failed with status ${response.status}.`);
      }

      if (session !== sessionRef.current || !activeRef.current) return;

      const text = data.text?.trim();
      if (text) onTranscriptRef.current(text);
      setDiagnostics((current) => ({
        ...current,
        processedChunks: current.processedChunks + 1,
        pendingChunks: queueRef.current.length,
        lastResponseMs: Date.now() - startedAt
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (session === sessionRef.current && activeRef.current) {
        setStatus("error");
        setDiagnostics((current) => ({
          ...current,
          lastError: sanitizeDiagnosticMessage(error instanceof Error ? error.message : "Unknown transcription error")
        }));
      }
    } finally {
      if (session === sessionRef.current) {
        inFlightRef.current = false;
        abortControllerRef.current = undefined;
        if (activeRef.current) {
          if (queueRef.current.length > 0) {
            window.setTimeout(() => drainRef.current(), 0);
          } else if (status !== "missing_api_key") {
            setStatus("waiting_for_audio");
          }
        }
      }
    }
  }, [options.apiKey, options.backendUrl, options.language, status]);

  useEffect(() => {
    drainRef.current = () => void drainQueue();
  }, [drainQueue]);

  const enqueueChunk = useCallback((blob: Blob) => {
    if (!activeRef.current || blob.size === 0) return;

    if (queueRef.current.length >= maxPendingChunks) {
      queueRef.current.shift();
      setDiagnostics((current) => ({ ...current, droppedChunks: current.droppedChunks + 1 }));
    }

    queueRef.current.push({ blob, queuedAt: Date.now() });
    setDiagnostics((current) => ({
      ...current,
      pendingChunks: queueRef.current.length,
      lastChunkSize: blob.size
    }));
    drainRef.current();
  }, [maxPendingChunks]);

  useEffect(() => stopSession, [stopSession]);

  return {
    status,
    diagnostics,
    startSession,
    stopSession,
    enqueueChunk
  };
}

function getChunkFilename(mimeType: string): string {
  if (mimeType.includes("ogg")) return "mentor-chunk.ogg";
  if (mimeType.includes("mp4")) return "mentor-chunk.mp4";
  return "mentor-chunk.webm";
}

function parseTranscriptionResponse(responseBody: string): { text?: string; error?: string } {
  try {
    return JSON.parse(responseBody) as { text?: string; error?: string };
  } catch {
    return {};
  }
}

function sanitizeDiagnosticMessage(message: string): string {
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 240);
}
