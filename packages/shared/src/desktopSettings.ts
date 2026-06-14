import type {
  AnswerMode,
  AppLanguage,
  DesktopSettings,
  LayoutMode,
  LiveAssistSensitivity,
  SpeechToTextProviderId,
  WorkMode
} from "./index.js";
import type { AnswerSourceMode } from "./answerSource.js";

type LegacyDesktopSettings = Partial<DesktopSettings> & { language?: AppLanguage };

export function migrateDesktopSettings(value: unknown, defaults: DesktopSettings): DesktopSettings {
  const settings = isRecord(value) ? value as LegacyDesktopSettings : {};

  return {
    apiKey: typeof settings.apiKey === "string" ? settings.apiKey : defaults.apiKey,
    model: typeof settings.model === "string" ? settings.model : defaults.model,
    interfaceLanguage: isLanguage(settings.interfaceLanguage) ? settings.interfaceLanguage : defaults.interfaceLanguage,
    answerLanguage: isLanguage(settings.answerLanguage)
      ? settings.answerLanguage
      : isLanguage(settings.language)
        ? settings.language
        : defaults.answerLanguage,
    audioInputDeviceId: typeof settings.audioInputDeviceId === "string"
      ? settings.audioInputDeviceId
      : defaults.audioInputDeviceId,
    answerMode: isAnswerMode(settings.answerMode) ? settings.answerMode : defaults.answerMode,
    answerSourceMode: isAnswerSourceMode(settings.answerSourceMode)
      ? settings.answerSourceMode
      : "local-plus-gpt",
    liveAssistSensitivity: isLiveAssistSensitivity(settings.liveAssistSensitivity)
      ? settings.liveAssistSensitivity
      : "balanced",
    workMode: isWorkMode(settings.workMode) ? settings.workMode : defaults.workMode,
    layoutMode: isLayoutMode(settings.layoutMode) ? settings.layoutMode : defaults.layoutMode,
    speechToTextProvider: isSpeechProvider(settings.speechToTextProvider)
      ? settings.speechToTextProvider
      : defaults.speechToTextProvider
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLanguage(value: unknown): value is AppLanguage {
  return value === "ru" || value === "en";
}

function isAnswerMode(value: unknown): value is AnswerMode {
  return value === "short" || value === "interview" || value === "learning";
}

function isAnswerSourceMode(value: unknown): value is AnswerSourceMode {
  return value === "local-only" || value === "local-plus-gpt" || value === "gpt-only";
}

function isLiveAssistSensitivity(value: unknown): value is LiveAssistSensitivity {
  return value === "conservative" || value === "balanced" || value === "active";
}

function isWorkMode(value: unknown): value is WorkMode {
  return value === "manual" || value === "live";
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return value === "vertical" || value === "horizontal";
}

function isSpeechProvider(value: unknown): value is SpeechToTextProviderId {
  return value === "disabled" || value === "mock" || value === "microphone";
}
