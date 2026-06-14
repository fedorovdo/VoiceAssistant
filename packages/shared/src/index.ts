import type { AnswerSourceMode } from "./answerSource.js";

export type AnswerMode = "short" | "interview" | "learning";

export type AppLanguage = "ru" | "en";

export type WorkMode = "manual" | "live";

export type LayoutMode = "vertical" | "horizontal";

export type SpeechToTextProviderId = "disabled" | "mock" | "microphone";

export type { AnswerSourceMode } from "./answerSource.js";

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
  workMode: WorkMode;
  layoutMode: LayoutMode;
  speechToTextProvider: SpeechToTextProviderId;
}

export * from "./liveAssist.js";
export * from "./knowledgeCards.js";
export * from "./transcriptSanitizer.js";
export * from "./answerSource.js";
export * from "./desktopSettings.js";
export * from "./conversationContext.js";
export * from "./technicalTermNormalizer.js";
