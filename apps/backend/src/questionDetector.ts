const technicalQuestionPatterns = [
  /что\s+такое/u,
  /из\s+чего\s+состоит/u,
  /как\s+работает/u,
  /для\s+чего\s+нужен/u,
  /чем\s+.+\s+отличается\s+от/u,
  /какие\s+основные/u,
  /какие\s+команды/u,
  /как\s+настроить/u,
  /как\s+проверить/u
];

const technicalDialoguePatterns = [
  /расскажи\s+про/u,
  /объясни/u
];

const fillerPatterns = [
  "продолжение следует",
  "спасибо за просмотр",
  "подписывайтесь на канал",
  "thanks for watching"
];

const technicalTerms = [
  "api",
  "dns",
  "linux",
  "nat",
  "pod",
  "port",
  "statefulset",
  "deployment",
  "docker",
  "kubernetes",
  "команд",
  "компонент",
  "диагностик",
  "папк",
  "порт",
  "права",
  "сети"
];

export interface QuestionDetectionResult {
  isUseful: boolean;
  normalizedText: string;
  matchedPattern?: string;
  reason?: "technical-pattern" | "question-mark" | "filler" | "empty" | "no-match";
}

export function detectTechnicalQuestion(text: string): QuestionDetectionResult {
  const normalizedText = normalizeText(text);

  if (normalizedText.length === 0) {
    return { isUseful: false, normalizedText, reason: "empty" };
  }

  const matchedFiller = fillerPatterns.find((pattern) => normalizedText.includes(pattern));
  if (matchedFiller) {
    return {
      isUseful: false,
      normalizedText,
      matchedPattern: matchedFiller,
      reason: "filler"
    };
  }

  if (isShortNoise(normalizedText)) {
    return { isUseful: false, normalizedText, reason: "no-match" };
  }

  const matchedPattern = technicalQuestionPatterns.find((pattern) => pattern.test(normalizedText));
  if (matchedPattern) {
    return {
      isUseful: true,
      normalizedText,
      matchedPattern: matchedPattern.source,
      reason: "technical-pattern"
    };
  }

  const matchedDialoguePattern = technicalDialoguePatterns.find((pattern) => pattern.test(normalizedText));
  if (matchedDialoguePattern && hasTechnicalTerm(normalizedText)) {
    return {
      isUseful: true,
      normalizedText,
      matchedPattern: matchedDialoguePattern.source,
      reason: "technical-pattern"
    };
  }

  if (hasQuestionMark(normalizedText) && hasTechnicalTerm(normalizedText)) {
    return {
      isUseful: true,
      normalizedText,
      reason: "question-mark"
    };
  }

  return { isUseful: false, normalizedText, reason: "no-match" };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasQuestionMark(text: string): boolean {
  return text.endsWith("?") || text.endsWith("\uff1f");
}

function hasTechnicalTerm(text: string): boolean {
  return technicalTerms.some((term) => text.includes(term));
}

function isShortNoise(text: string): boolean {
  return text.replace(/[^\p{L}\p{N}]+/gu, "").length < 4;
}
