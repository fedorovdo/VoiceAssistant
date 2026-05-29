export type RecognitionStatus = "stopped" | "listening";

export interface SpeechRecognitionResult {
  text: string;
  isFinal: boolean;
}

export interface SpeechToTextProviderStartOptions {
  onResult: (result: SpeechRecognitionResult) => void;
  onStatusChange: (status: RecognitionStatus) => void;
}

export interface SpeechToTextProvider {
  start(options: SpeechToTextProviderStartOptions): void;
  stop(): void;
  getStatus(): RecognitionStatus;
}
