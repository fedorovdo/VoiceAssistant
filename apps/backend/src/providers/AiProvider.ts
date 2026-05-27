import type { AssistantAnswerRequest } from "@voiceassistant/shared";

export interface AiProvider {
  answer(request: AssistantAnswerRequest): Promise<string>;
}
