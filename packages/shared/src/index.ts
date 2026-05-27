export type AnswerMode = "short" | "interview" | "learning";

export type AppLanguage = "ru" | "en";

export interface AssistantAnswerRequest {
  text: string;
  mode: AnswerMode;
  model?: string;
  apiKey?: string;
}

export interface AssistantAnswerResponse {
  answer: string;
}

export interface DesktopSettings {
  apiKey: string;
  model: string;
  language: AppLanguage;
  audioInputDevice: string;
  answerMode: AnswerMode;
}
