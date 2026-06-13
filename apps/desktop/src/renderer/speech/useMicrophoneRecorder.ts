import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

export type MicrophoneRecorderStatus =
  | "stopped"
  | "requesting_permission"
  | "recording"
  | "permission_denied"
  | "device_unavailable"
  | "error";

export interface MicrophoneRecorderDebug {
  chunksCaptured: number;
  lastChunkSize: number;
  lastChunkMimeType: string;
}

export interface MicrophoneRecorderState {
  status: MicrophoneRecorderStatus;
  debug: MicrophoneRecorderDebug;
  usedDefaultDevice: boolean;
}

const initialDebug: MicrophoneRecorderDebug = {
  chunksCaptured: 0,
  lastChunkSize: 0,
  lastChunkMimeType: ""
};

interface UseMicrophoneRecorderOptions {
  onChunk?: (chunk: Blob) => void;
}

export function useMicrophoneRecorder(options: UseMicrophoneRecorderOptions = {}) {
  const streamRef = useRef<MediaStream>();
  const recorderRef = useRef<MediaRecorder>();
  const chunkTimerRef = useRef<number>();
  const sessionRef = useRef(0);
  const onChunkRef = useRef(options.onChunk);
  const [state, setState] = useState<MicrophoneRecorderState>({
    status: "stopped",
    debug: initialDebug,
    usedDefaultDevice: false
  });

  useEffect(() => {
    onChunkRef.current = options.onChunk;
  }, [options.onChunk]);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    const recorder = recorderRef.current;
    recorderRef.current = undefined;
    if (chunkTimerRef.current !== undefined) {
      window.clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = undefined;
    }

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    stopTracks(streamRef.current);
    streamRef.current = undefined;
    setState((current) => ({ ...current, status: "stopped" }));
  }, []);

  const start = useCallback(async (selectedDeviceId: string) => {
    stop();
    const session = sessionRef.current;
    setState({ status: "requesting_permission", debug: initialDebug, usedDefaultDevice: false });

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({ status: "error", debug: initialDebug, usedDefaultDevice: false });
      return;
    }

    let selectedDeviceAvailable = false;
    if (selectedDeviceId) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        selectedDeviceAvailable = devices.some(
          (device) => device.kind === "audioinput" && device.deviceId === selectedDeviceId
        );
      } catch {
        selectedDeviceAvailable = false;
      }
    }

    const shouldUseDefault = Boolean(selectedDeviceId) && !selectedDeviceAvailable;

    try {
      const stream = await requestStream(selectedDeviceAvailable ? selectedDeviceId : "");
      if (session !== sessionRef.current) {
        stopTracks(stream);
        return;
      }

      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0 || session !== sessionRef.current) {
          return;
        }

        setState((current) => ({
          ...current,
          status: "recording",
          debug: {
            chunksCaptured: current.debug.chunksCaptured + 1,
            lastChunkSize: event.data.size,
            lastChunkMimeType: event.data.type || recorder.mimeType || "application/octet-stream"
          }
        }));
        void onChunkRef.current?.(event.data);
      });

      recorder.addEventListener("error", () => {
        if (chunkTimerRef.current !== undefined) {
          window.clearInterval(chunkTimerRef.current);
          chunkTimerRef.current = undefined;
        }
        stopTracks(stream);
        streamRef.current = undefined;
        recorderRef.current = undefined;
        setState((current) => ({ ...current, status: "error" }));
      });

      startChunkCycle(recorder, session, sessionRef, recorderRef, chunkTimerRef);
      setState({ status: "recording", debug: initialDebug, usedDefaultDevice: shouldUseDefault });
    } catch (error) {
      if (session !== sessionRef.current) {
        return;
      }

      if (isPermissionDenied(error)) {
        setState({ status: "permission_denied", debug: initialDebug, usedDefaultDevice: false });
        return;
      }

      if (selectedDeviceId && selectedDeviceAvailable) {
        try {
          const fallbackStream = await requestStream("");
          if (session !== sessionRef.current) {
            stopTracks(fallbackStream);
            return;
          }

          const fallbackRecorder = new MediaRecorder(fallbackStream);
          streamRef.current = fallbackStream;
          recorderRef.current = fallbackRecorder;
          fallbackRecorder.addEventListener("dataavailable", (event) => {
            if (event.data.size === 0 || session !== sessionRef.current) return;
            setState((current) => ({
              ...current,
              debug: {
                chunksCaptured: current.debug.chunksCaptured + 1,
                lastChunkSize: event.data.size,
                lastChunkMimeType: event.data.type || fallbackRecorder.mimeType || "application/octet-stream"
              }
            }));
            void onChunkRef.current?.(event.data);
          });
          fallbackRecorder.addEventListener("error", () => {
            if (chunkTimerRef.current !== undefined) {
              window.clearInterval(chunkTimerRef.current);
              chunkTimerRef.current = undefined;
            }
            stopTracks(fallbackStream);
            streamRef.current = undefined;
            recorderRef.current = undefined;
            setState((current) => ({ ...current, status: "error" }));
          });
          startChunkCycle(fallbackRecorder, session, sessionRef, recorderRef, chunkTimerRef);
          setState({ status: "recording", debug: initialDebug, usedDefaultDevice: true });
          return;
        } catch (fallbackError) {
          setState({
            status: isPermissionDenied(fallbackError) ? "permission_denied" : "device_unavailable",
            debug: initialDebug,
            usedDefaultDevice: false
          });
          return;
        }
      }

      setState({ status: "device_unavailable", debug: initialDebug, usedDefaultDevice: false });
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { ...state, start, stop };
}

function requestStream(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true
  });
}

function stopTracks(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

function startChunkCycle(
  recorder: MediaRecorder,
  session: number,
  sessionRef: MutableRefObject<number>,
  recorderRef: MutableRefObject<MediaRecorder | undefined>,
  chunkTimerRef: MutableRefObject<number | undefined>
) {
  recorder.addEventListener("stop", () => {
    if (session === sessionRef.current && recorderRef.current === recorder) {
      recorder.start();
    }
  });
  recorder.start();
  chunkTimerRef.current = window.setInterval(() => {
    if (session === sessionRef.current && recorder.state === "recording") {
      recorder.stop();
    }
  }, 4000);
}

function isPermissionDenied(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
}
