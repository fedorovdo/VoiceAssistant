import type { AiProvider } from "./AiProvider.js";
import { MockAiProvider } from "./MockAiProvider.js";
import { OpenAiProvider } from "./OpenAiProvider.js";

export function createAiProvider(): AiProvider {
  const providerName = process.env.AI_PROVIDER ?? "mock";

  if (providerName === "openai") {
    return new OpenAiProvider(
      process.env.OPENAI_API_KEY ?? "",
      process.env.ANSWER_MODEL ?? "gpt-4.1-mini"
    );
  }

  return new MockAiProvider();
}
