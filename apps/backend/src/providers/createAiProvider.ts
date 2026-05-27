import type { AiProvider } from "./AiProvider.js";
import { MockAiProvider } from "./MockAiProvider.js";
import { OpenAiProvider } from "./OpenAiProvider.js";

export interface AiProviderOptions {
  apiKey?: string;
  model?: string;
}

export function createAiProvider(options: AiProviderOptions = {}): AiProvider {
  const apiKey = options.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  const model = options.model?.trim() || process.env.ANSWER_MODEL?.trim() || "gpt-4.1-mini";

  if (apiKey.length > 0) {
    return new OpenAiProvider(apiKey, model);
  }

  return new MockAiProvider();
}
