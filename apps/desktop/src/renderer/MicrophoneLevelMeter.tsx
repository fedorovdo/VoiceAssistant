import { useEffect, useState } from "react";

interface MicrophoneLevelMeterProps {
  active: boolean;
  stream: MediaStream | null;
  activeLabel: string;
  stoppedLabel: string;
}

const barCount = 6;

export function MicrophoneLevelMeter({
  active,
  stream,
  activeLabel,
  stoppedLabel
}: MicrophoneLevelMeterProps) {
  const [level, setLevel] = useState<number | null>(null);
  const normalizedLevel = Math.max(0, Math.min(level ?? 0, 1));
  const label = active ? activeLabel : stoppedLabel;

  useEffect(() => {
    if (!active || !stream) {
      setLevel(null);
      return;
    }

    let animationFrame: number | undefined;
    let audioContext: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let analysisStream: MediaStream | undefined;

    try {
      analysisStream = stream.clone();
      audioContext = new AudioContext();
      source = audioContext.createMediaStreamSource(analysisStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      const samples = new Uint8Array(analyser.fftSize);
      let lastUpdate = 0;

      source.connect(analyser);
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }
      setLevel(0);

      const updateLevel = (timestamp: number) => {
        analyser.getByteTimeDomainData(samples);
        if (timestamp - lastUpdate >= 80) {
          let sumSquares = 0;
          for (const sample of samples) {
            const centeredSample = (sample - 128) / 128;
            sumSquares += centeredSample * centeredSample;
          }
          setLevel(Math.min(1, Math.sqrt(sumSquares / samples.length) * 4.5));
          lastUpdate = timestamp;
        }
        animationFrame = window.requestAnimationFrame(updateLevel);
      };

      animationFrame = window.requestAnimationFrame(updateLevel);
    } catch {
      setLevel(null);
    }

    return () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
      source?.disconnect();
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close();
      }
      analysisStream?.getTracks().forEach((track) => track.stop());
    };
  }, [active, stream]);

  return (
    <div className={`microphone-meter${active ? " microphone-meter-active" : ""}`} role="status" aria-label={label}>
      <span className="microphone-meter-bars" aria-hidden="true">
        {Array.from({ length: barCount }, (_, index) => {
          const emphasis = 1 - Math.abs(index - (barCount - 1) / 2) / barCount;
          const height = active && level !== null
            ? 4 + normalizedLevel * 13 * emphasis
            : 4;

          return (
            <span
              className={`microphone-meter-bar${active && level === null ? " microphone-meter-bar-fallback" : ""}`}
              key={index}
              style={{ height: `${height}px`, animationDelay: `${index * 90}ms` }}
            />
          );
        })}
      </span>
      <span>{label}</span>
    </div>
  );
}
