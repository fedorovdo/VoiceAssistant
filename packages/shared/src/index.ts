export type AnswerMode = "short" | "interview" | "learning";

export type AppLanguage = "ru" | "en";

export type SpeechToTextProviderId = "disabled" | "mock";

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
  audioInputDeviceId: string;
  answerMode: AnswerMode;
  speechToTextProvider: SpeechToTextProviderId;
}
