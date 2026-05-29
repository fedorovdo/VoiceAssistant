import type {
  RecognitionStatus,
  SpeechToTextProvider,
  SpeechToTextProviderStartOptions
} from "./SpeechToTextProvider.js";

const mockPhrases = [
  "\u0427\u0442\u043e \u0442\u0430\u043a\u043e\u0435 Kubernetes?",
  "\u041a\u0430\u043a \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043f\u043e\u0440\u0442 \u0432 Linux?",
  "\u041e\u0431\u044a\u044f\u0441\u043d\u0438 NAT \u043f\u0440\u043e\u0441\u0442\u044b\u043c\u0438 \u0441\u043b\u043e\u0432\u0430\u043c\u0438"
];

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  private status: RecognitionStatus = "stopped";
  private phraseIndex = 0;
  private timerId: number | undefined;
  private options: SpeechToTextProviderStartOptions | undefined;

  start(options: SpeechToTextProviderStartOptions): void {
    if (this.status === "listening") {
      return;
    }

    this.options = options;
    this.status = "listening";
    this.options.onStatusChange(this.status);
    this.scheduleNextPhrase(350);
  }

  stop(): void {
    if (this.timerId !== undefined) {
      window.clearTimeout(this.timerId);
      this.timerId = undefined;
    }

    if (this.status === "stopped") {
      return;
    }

    this.status = "stopped";
    this.options?.onStatusChange(this.status);
  }

  getStatus(): RecognitionStatus {
    return this.status;
  }

  private scheduleNextPhrase(delayMs: number): void {
    this.timerId = window.setTimeout(() => {
      if (this.status !== "listening" || !this.options) {
        return;
      }

      this.options.onResult({
        text: mockPhrases[this.phraseIndex],
        isFinal: true
      });
      this.phraseIndex = (this.phraseIndex + 1) % mockPhrases.length;
      this.scheduleNextPhrase(2400);
    }, delayMs);
  }
}
