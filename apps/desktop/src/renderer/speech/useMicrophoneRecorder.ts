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
  audioLevel: number;
}

const initialDebug: MicrophoneRecorderDebug = {
  chunksCaptured: 0,
  lastChunkSize: 0,
  lastChunkMimeType: ""
};

interface UseMicrophoneRecorderOptions {
  onChunk?: (chunk: Blob) => void;
  enableAudioLevel?: boolean;
}

export function useMicrophoneRecorder(options: UseMicrophoneRecorderOptions = {}) {
  const enableAudioLevel = options.enableAudioLevel ?? false;
  const streamRef = useRef<MediaStream>();
  const recorderRef = useRef<MediaRecorder>();
  const chunkTimerRef = useRef<number>();
  const audioContextRef = useRef<AudioContext>();
  const audioSourceRef = useRef<MediaStreamAudioSourceNode>();
  const audioFrameRef = useRef<number>();
  const sessionRef = useRef(0);
  const onChunkRef = useRef(options.onChunk);
  const [state, setState] = useState<MicrophoneRecorderState>({
    status: "stopped",
    debug: initialDebug,
    usedDefaultDevice: false,
    audioLevel: 0
  });

  useEffect(() => {
    onChunkRef.current = options.onChunk;
  }, [options.onChunk]);

  const stopAudioLevelMonitor = useCallback(() => {
    if (audioFrameRef.current !== undefined) {
      window.cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = undefined;
    }

    audioSourceRef.current?.disconnect();
    audioSourceRef.current = undefined;

    const audioContext = audioContextRef.current;
    audioContextRef.current = undefined;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }, []);

  const startAudioLevelMonitor = useCallback((stream: MediaStream, session: number) => {
    if (enableAudioLevel) {
      stopAudioLevelMonitor();
    }

    if (!enableAudioLevel || typeof AudioContext === "undefined") {
      return;
    }

    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      const samples = new Uint8Array(analyser.fftSize);
      let lastUpdate = 0;

      source.connect(analyser);
      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      const updateLevel = (timestamp: number) => {
        if (session !== sessionRef.current) {
          return;
        }

        analyser.getByteTimeDomainData(samples);
        if (timestamp - lastUpdate >= 100) {
          let sumSquares = 0;
          for (const sample of samples) {
            const centeredSample = (sample - 128) / 128;
            sumSquares += centeredSample * centeredSample;
          }
          const level = Math.min(1, Math.sqrt(sumSquares / samples.length) * 4.5);
          setState((current) => ({ ...current, audioLevel: level }));
          lastUpdate = timestamp;
        }

        audioFrameRef.current = window.requestAnimationFrame(updateLevel);
      };

      audioFrameRef.current = window.requestAnimationFrame(updateLevel);
    } catch {
      stopAudioLevelMonitor();
      setState((current) => ({ ...current, audioLevel: 0 }));
    }
  }, [enableAudioLevel, stopAudioLevelMonitor]);

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

    if (enableAudioLevel) {
      stopAudioLevelMonitor();
    }
    stopTracks(streamRef.current);
    streamRef.current = undefined;
    setState((current) => ({ ...current, status: "stopped", audioLevel: 0 }));
  }, [enableAudioLevel, stopAudioLevelMonitor]);

  const start = useCallback(async (selectedDeviceId: string) => {
    stop();
    const session = sessionRef.current;
    setState({ status: "requesting_permission", debug: initialDebug, usedDefaultDevice: false, audioLevel: 0 });

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({ status: "error", debug: initialDebug, usedDefaultDevice: false, audioLevel: 0 });
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
        if (enableAudioLevel) {
          stopAudioLevelMonitor();
        }
        stopTracks(stream);
        streamRef.current = undefined;
        recorderRef.current = undefined;
        setState((current) => ({ ...current, status: "error", audioLevel: 0 }));
      });

      startChunkCycle(recorder, session, sessionRef, recorderRef, chunkTimerRef);
      setState({ status: "recording", debug: initialDebug, usedDefaultDevice: shouldUseDefault, audioLevel: 0 });
      if (enableAudioLevel) {
        startAudioLevelMonitor(stream, session);
      }
    } catch (error) {
      if (session !== sessionRef.current) {
        return;
      }

      if (isPermissionDenied(error)) {
        setState({ status: "permission_denied", debug: initialDebug, usedDefaultDevice: false, audioLevel: 0 });
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
            if (enableAudioLevel) {
              stopAudioLevelMonitor();
            }
            stopTracks(fallbackStream);
            streamRef.current = undefined;
            recorderRef.current = undefined;
            setState((current) => ({ ...current, status: "error", audioLevel: 0 }));
          });
          startChunkCycle(fallbackRecorder, session, sessionRef, recorderRef, chunkTimerRef);
          setState({ status: "recording", debug: initialDebug, usedDefaultDevice: true, audioLevel: 0 });
          if (enableAudioLevel) {
            startAudioLevelMonitor(fallbackStream, session);
          }
          return;
        } catch (fallbackError) {
          setState({
            status: isPermissionDenied(fallbackError) ? "permission_denied" : "device_unavailable",
            debug: initialDebug,
            usedDefaultDevice: false,
            audioLevel: 0
          });
          return;
        }
      }

      setState({ status: "device_unavailable", debug: initialDebug, usedDefaultDevice: false, audioLevel: 0 });
    }
  }, [startAudioLevelMonitor, stop, stopAudioLevelMonitor]);

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
