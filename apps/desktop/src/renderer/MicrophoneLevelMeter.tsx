interface MicrophoneLevelMeterProps {
  active: boolean;
  audioLevel: number;
  activeLabel: string;
  stoppedLabel: string;
}

const barCount = 6;

export function MicrophoneLevelMeter({
  active,
  audioLevel,
  activeLabel,
  stoppedLabel
}: MicrophoneLevelMeterProps) {
  const normalizedLevel = Math.max(0, Math.min(audioLevel, 1));
  const label = active ? activeLabel : stoppedLabel;

  return (
    <div className={`microphone-meter${active ? " microphone-meter-active" : ""}`} role="status" aria-label={label}>
      <span className="microphone-meter-bars" aria-hidden="true">
        {Array.from({ length: barCount }, (_, index) => {
          const emphasis = 1 - Math.abs(index - (barCount - 1) / 2) / barCount;
          const height = active
            ? 4 + normalizedLevel * 13 * emphasis
            : 4;

          return (
            <span
              className="microphone-meter-bar"
              key={index}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </span>
      <span>{label}</span>
    </div>
  );
}
