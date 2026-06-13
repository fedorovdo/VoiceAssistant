export interface SpeechTranscriptionRequest {
  audio: Buffer;
  filename: string;
  mimeType: string;
  language?: string;
}

export interface SpeechToTextProvider {
  transcribe(request: SpeechTranscriptionRequest): Promise<string>;
}
