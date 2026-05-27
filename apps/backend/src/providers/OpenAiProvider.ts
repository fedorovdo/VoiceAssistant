import type { AssistantAnswerRequest } from "@voiceassistant/shared";
import type { AiProvider } from "./AiProvider.js";

export class OpenAiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async answer(_request: AssistantAnswerRequest): Promise<string> {
    return [
      "OpenAI provider placeholder is configured, but real API calls are intentionally disabled in the MVP.",
      `Selected model: ${this.model}. API key present: ${this.apiKey.length > 0 ? "yes" : "no"}.`
    ].join("\n");
  }
}
