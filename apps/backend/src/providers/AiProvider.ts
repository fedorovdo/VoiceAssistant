import type { AssistantAnswerRequest } from "@voiceassistant/shared";

export interface AiProvider {
  answer(
    request: Pick<AssistantAnswerRequest, "text" | "mode" | "workMode" | "answerLanguage">
  ): Promise<string>;
}
