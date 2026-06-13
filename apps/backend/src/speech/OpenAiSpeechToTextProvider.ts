import OpenAI, { toFile } from "openai";
import type { SpeechToTextProvider, SpeechTranscriptionRequest } from "./SpeechToTextProvider.js";

const defaultTranscriptionModel = "gpt-4o-mini-transcribe";

export class OpenAiSpeechToTextProvider implements SpeechToTextProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model = defaultTranscriptionModel
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(request: SpeechTranscriptionRequest): Promise<string> {
    try {
      const file = await toFile(request.audio, request.filename, {
        type: normalizeMimeType(request.mimeType)
      });
      const transcription = await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        language: request.language,
        response_format: "json"
      });
      return transcription.text.trim();
    } catch (error) {
      throw new Error(toSafeOpenAiTranscriptionError(error));
    }
  }
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim() || "application/octet-stream";
}

function toSafeOpenAiTranscriptionError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return "OpenAI rejected the API key. Check the key in settings.";
    }

    if (error.status === 429) {
      return "OpenAI transcription rate limit or quota was reached. Try again later.";
    }

    if (error.status && error.status >= 500) {
      return "OpenAI transcription is temporarily unavailable. Try again later.";
    }

    return `OpenAI transcription failed with status ${error.status ?? "unknown"}.`;
  }

  return "OpenAI transcription failed. Check your network, API key, and audio format.";
}
