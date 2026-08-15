import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLanguage } from "@voiceassistant/shared";

export type MentorRealtimeStatus =
  | "idle"
  | "requesting_device"
  | "connecting"
  | "listening"
  | "speech_detected"
  | "transcribing"
  | "missing_api_key"
  | "error";

export interface MentorRealtimeDiagnostics {
  completedTurns: number;
  speechStarts: number;
  speechStops: number;
  lastTranscriptMs?: number;
  connectionState: RTCPeerConnectionState | "idle";
  lastEventType?: string;
}

interface UseMentorRealtimeTranscriptionOptions {
  backendUrl: string;
  apiKey: string;
  language: AppLanguage;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

interface RealtimeServerEvent {
  type?: string;
  transcript?: string;
  error?: {
    message?: string;
  };
}

const initialDiagnostics: MentorRealtimeDiagnostics = {
  completedTurns: 0,
  speechStarts: 0,
  speechStops: 0,
  connectionState: "idle"
};

export function useMentorRealtimeTranscription(options: UseMentorRealtimeTranscriptionOptions) {
  const { backendUrl, apiKey, language } = options;
  const peerRef = useRef<RTCPeerConnection>();
  const channelRef = useRef<RTCDataChannel>();
  const streamRef = useRef<MediaStream>();
  const sessionRef = useRef(0);
  const speechStoppedAtRef = useRef<number>();
  const onTranscriptRef = useRef(options.onTranscript);
  const onErrorRef = useRef(options.onError);
  const [status, setStatus] = useState<MentorRealtimeStatus>("idle");
  const [diagnostics, setDiagnostics] = useState<MentorRealtimeDiagnostics>(initialDiagnostics);

  useEffect(() => {
    onTranscriptRef.current = options.onTranscript;
    onErrorRef.current = options.onError;
  }, [options.onError, options.onTranscript]);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    speechStoppedAtRef.current = undefined;

    const channel = channelRef.current;
    channelRef.current = undefined;
    if (channel && channel.readyState !== "closed") {
      channel.close();
    }

    const peer = peerRef.current;
    peerRef.current = undefined;
    peer?.close();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;

    setStatus("idle");
    setDiagnostics(initialDiagnostics);
  }, []);

  const start = useCallback(async (selectedDeviceId: string) => {
    stop();
    const session = sessionRef.current;
    const trimmedApiKey = apiKey.trim();

    if (!trimmedApiKey) {
      setStatus("missing_api_key");
      return false;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      const message = language === "ru"
        ? "WebRTC или доступ к аудиоустройствам недоступен в этой среде."
        : "WebRTC or audio device access is unavailable in this environment.";
      setStatus("error");
      onErrorRef.current?.(message);
      return false;
    }

    setStatus("requesting_device");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
      });

      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      bindDataChannel(channel, session);

      peer.addEventListener("connectionstatechange", () => {
        if (session !== sessionRef.current) return;
        const connectionState = peer.connectionState;
        setDiagnostics((current) => ({ ...current, connectionState }));

        if (connectionState === "connected") {
          setStatus((current) => current === "speech_detected" || current === "transcribing" ? current : "listening");
        } else if (connectionState === "failed") {
          setStatus("error");
          onErrorRef.current?.(language === "ru" ? "Realtime-соединение WebRTC завершилось с ошибкой." : "The Realtime WebRTC connection failed.");
        } else if (connectionState === "disconnected") {
          setStatus("connecting");
        }
      });

      setStatus("connecting");
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer, session, sessionRef);

      if (session !== sessionRef.current || !peer.localDescription?.sdp) {
        return false;
      }

      const response = await fetch(`${backendUrl}/api/realtime/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: peer.localDescription.sdp,
          apiKey: trimmedApiKey,
          language
        })
      });

      const responseText = await response.text();
      const data = parseConnectResponse(responseText);
      if (!response.ok || !data.sdp) {
        throw new Error(data.error || `Realtime connection failed with status ${response.status}.`);
      }

      if (session !== sessionRef.current) {
        return false;
      }

      await peer.setRemoteDescription({ type: "answer", sdp: data.sdp });
      return true;
    } catch (error) {
      if (session !== sessionRef.current) return false;
      const message = error instanceof Error
        ? error.message
        : language === "ru" ? "Не удалось запустить Realtime-распознавание." : "Could not start Realtime transcription.";
      setStatus("error");
      onErrorRef.current?.(sanitizeError(message));
      return false;
    }
  }, [apiKey, backendUrl, language, stop]);

  function bindDataChannel(channel: RTCDataChannel, session: number) {
    channel.addEventListener("open", () => {
      if (session !== sessionRef.current) return;
      setStatus("listening");
    });

    channel.addEventListener("message", (messageEvent) => {
      if (session !== sessionRef.current || typeof messageEvent.data !== "string") return;
      const event = parseRealtimeEvent(messageEvent.data);
      if (!event?.type) return;

      setDiagnostics((current) => ({ ...current, lastEventType: event.type }));

      if (event.type === "input_audio_buffer.speech_started") {
        setStatus("speech_detected");
        setDiagnostics((current) => ({ ...current, speechStarts: current.speechStarts + 1 }));
        return;
      }

      if (event.type === "input_audio_buffer.speech_stopped") {
        speechStoppedAtRef.current = Date.now();
        setStatus("transcribing");
        setDiagnostics((current) => ({ ...current, speechStops: current.speechStops + 1 }));
        return;
      }

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = event.transcript?.trim();
        const now = Date.now();
        const lastTranscriptMs = speechStoppedAtRef.current === undefined
          ? undefined
          : now - speechStoppedAtRef.current;
        speechStoppedAtRef.current = undefined;

        setDiagnostics((current) => ({
          ...current,
          completedTurns: current.completedTurns + 1,
          lastTranscriptMs
        }));
        if (transcript) onTranscriptRef.current(transcript);
        setStatus("listening");
        return;
      }

      if (event.type === "error") {
        const message = sanitizeError(event.error?.message || "OpenAI Realtime returned an error.");
        setStatus("error");
        onErrorRef.current?.(message);
      }
    });

    channel.addEventListener("close", () => {
      if (session !== sessionRef.current) return;
      setStatus("idle");
    });

    channel.addEventListener("error", () => {
      if (session !== sessionRef.current) return;
      setStatus("error");
      onErrorRef.current?.(language === "ru" ? "Ошибка канала событий OpenAI Realtime." : "OpenAI Realtime event channel error.");
    });
  }

  useEffect(() => stop, [stop]);

  return { status, diagnostics, start, stop };
}

function waitForIceGathering(
  peer: RTCPeerConnection,
  session: number,
  sessionRef: React.MutableRefObject<number>
): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    }, 2_000);

    function onStateChange() {
      if (session !== sessionRef.current || peer.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }
    }

    peer.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function parseConnectResponse(value: string): { sdp?: string; error?: string } {
  try {
    return JSON.parse(value) as { sdp?: string; error?: string };
  } catch {
    return {};
  }
}

function parseRealtimeEvent(value: string): RealtimeServerEvent | undefined {
  try {
    return JSON.parse(value) as RealtimeServerEvent;
  } catch {
    return undefined;
  }
}

function sanitizeError(message: string): string {
  return message.replace(/sk-(?:proj-)?[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]").slice(0, 300);
}
