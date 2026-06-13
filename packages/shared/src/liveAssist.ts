export type FragmentClassification = "explicit_question" | "technical_term" | "ignore";

export interface FragmentDetectionResult {
  classification: FragmentClassification;
  normalizedText: string;
  matchedValue?: string;
}

const explicitQuestionPatterns = [
  "что такое",
  "как работает",
  "для чего нужен",
  "чем отличается",
  "как проверить",
  "как настроить"
];

const technicalTerms = [
  "active directory",
  "docker image",
  "kubernetes",
  "deployment",
  "container",
  "registry",
  "service",
  "ingress",
  "docker",
  "linux",
  "dhcp",
  "dns",
  "nat",
  "pod",
  "port"
];

const ignoredPhrases = [
  "продолжение следует",
  "спасибо за просмотр",
  "thanks for watching"
];

export function classifyTechnicalFragment(text: string): FragmentDetectionResult {
  const normalizedText = normalizeFragment(text);

  if (normalizedText.length === 0 || ignoredPhrases.some((phrase) => normalizedText.includes(phrase))) {
    return { classification: "ignore", normalizedText };
  }

  const questionPattern = explicitQuestionPatterns.find((pattern) => normalizedText.includes(pattern));
  if (questionPattern) {
    return {
      classification: "explicit_question",
      normalizedText,
      matchedValue: questionPattern
    };
  }

  const technicalTerm = technicalTerms.find((term) => containsTerm(normalizedText, term));
  if (technicalTerm) {
    return {
      classification: "technical_term",
      normalizedText,
      matchedValue: technicalTerm
    };
  }

  return { classification: "ignore", normalizedText };
}

function normalizeFragment(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsTerm(text: string, term: string): boolean {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapedTerm}($|[^a-z0-9])`, "i").test(text);
}
