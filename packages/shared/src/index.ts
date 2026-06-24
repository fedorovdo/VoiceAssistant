import type { AnswerSourceMode } from "./answerSource.js";
import type { LiveAssistSensitivity } from "./conversationContext.js";

export type AnswerMode = "short" | "interview" | "learning";

export type AppLanguage = "ru" | "en";

export type WorkMode = "manual" | "live";

export type LayoutMode = "vertical" | "horizontal";

export type SpeechToTextProviderId = "disabled" | "mock" | "microphone";

export type { AnswerSourceMode } from "./answerSource.js";
export type { LiveAssistSensitivity } from "./conversationContext.js";

export interface AssistantAnswerRequest {
  text: string;
  mode: AnswerMode;
  model?: string;
  apiKey?: string;
  workMode?: WorkMode;
  answerLanguage?: AppLanguage;
}

export interface AssistantAnswerResponse {
  answer: string;
}

export interface DesktopSettings {
  apiKey: string;
  model: string;
  interfaceLanguage: AppLanguage;
  answerLanguage: AppLanguage;
  audioInputDeviceId: string;
  answerMode: AnswerMode;
  answerSourceMode: AnswerSourceMode;
  liveAssistSensitivity: LiveAssistSensitivity;
  workMode: WorkMode;
  layoutMode: LayoutMode;
  speechToTextProvider: SpeechToTextProviderId;
}

export * from "./liveAssist.js";
export * from "./knowledgeCards.js";
export * from "./transcriptSanitizer.js";
export * from "./transcriptDuplicate.js";
export * from "./answerSource.js";
export * from "./desktopSettings.js";
export * from "./conversationContext.js";
export * from "./technicalTermNormalizer.js";
export * from "./liveAssistDecision.js";
export * from "./utteranceBuffer.js";
export * from "./localKnowledgeRegressionCases.js";
export * from "./liveProcessing.js";
export * from "./liveRequestQueue.js";
export * from "./networkingContext.js";
