const technicalPatterns = [
  "что такое",
  "из чего состоит",
  "как работает",
  "для чего нужен",
  "чем отличается",
  "какие основные",
  "как настроить",
  "как проверить"
];

const fillerPatterns = [
  "продолжение следует",
  "спасибо за просмотр",
  "thanks for watching"
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

  const matchedPattern = technicalPatterns.find((pattern) => normalizedText.includes(pattern));
  if (matchedPattern) {
    return {
      isUseful: true,
      normalizedText,
      matchedPattern,
      reason: "technical-pattern"
    };
  }

  if (normalizedText.endsWith("?") || normalizedText.endsWith("？")) {
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
