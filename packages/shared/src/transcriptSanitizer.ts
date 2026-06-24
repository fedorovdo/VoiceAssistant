export type TranscriptLanguage = "ru" | "en";

export type TranscriptSanitizationReason =
  | "accepted"
  | "empty"
  | "filler"
  | "too_short"
  | "wrong_script"
  | "incomplete";

export type TranscriptQuality = "clean" | "short_technical" | "incomplete" | "noise";

export interface SanitizedTranscript {
  text: string;
  shouldUse: boolean;
  reason: TranscriptSanitizationReason;
  quality: TranscriptQuality;
  technicalProtectionApplied: boolean;
}

const fillerPhrases = [
  "эээ",
  "ну",
  "как бы",
  "это самое",
  "продолжение следует",
  "спасибо за просмотр",
  "uh",
  "um",
  "you know",
  "thanks for watching"
];

const strongTechnicalTerms = [
  "active directory",
  "domain controller",
  "group policy",
  "docker image",
  "dockerfile",
  "docker",
  "kubernetes service",
  "kubernetes",
  "kubectl",
  "container",
  "deployment",
  "ingress",
  "journalctl",
  "systemctl",
  "sudoers",
  "sudo",
  "firewall",
  "sshd",
  "pod",
  "netstat",
  "traceroute",
  "tracert",
  "nslookup",
  "linux",
  "git",
  "tcp",
  "tcp/ip",
  "tsp/ip",
  "udp",
  "ip",
  "osi",
  "oci",
  "arp",
  "vlan",
  "icmp",
  "firewall",
  "protocol",
  "протокол",
  "сетевой уровень",
  "passwd",
  "password",
  "пароль",
  "порт",
  "порты",
  "user",
  "пользователь",
  "пользователю",
  "dhcp",
  "dns",
  "nat"
];

const danglingEndings = [
  "и", "или", "а", "но", "в", "во", "на", "с", "со", "для", "по", "как", "что", "чем",
  "and", "or", "but", "in", "on", "with", "for", "to", "the", "a", "an", "how", "what", "why"
];

const incompleteQuestionStarts = [
  "что такое",
  "как работает",
  "для чего нужен",
  "чем отличается",
  "как проверить",
  "как дать",
  "как добавить",
  "как выдать",
  "как настроить",
  "команда для",
  "what is",
  "how does",
  "how to",
  "what does"
];

const technicalActionPatterns = [
  /^(?:как\s+)?(?:поменять|изменить|сменить|проверить|добавить|настроить|перезапустить)(?:\s|$)/i,
  /^(?:что\s+такое|из\s+чего\s+состоит)(?:\s|$)/i,
  /(?:на\s+каком\s+уровне|сколько\s+уровней|расскажи(?:те)?|где\s+работает|какая\s+(?:модель|схема))/i,
  /^(?:протокол|схема|модель|сетевая\s+модель)(?:\s|$)/i,
  /^(?:how\s+to\s+)?(?:change|reset)\s+(?:a\s+)?password(?:\s|$)/i
];

export function sanitizeTranscript(text: string, language: TranscriptLanguage): SanitizedTranscript {
  const cleanedText = cleanupWhitespace(text);
  const normalizedText = normalize(cleanedText);

  if (!cleanedText) {
    return rejected(cleanedText, "empty");
  }

  const hasTechnicalTerm = containsTechnicalTerm(normalizedText);
  if (language === "ru" && hasUnsupportedScriptMajority(cleanedText) && !hasTechnicalTerm) {
    return rejected(cleanedText, "wrong_script");
  }

  if (!normalizedText) {
    return rejected(cleanedText, "empty");
  }

  if (isFiller(normalizedText)) {
    return rejected(cleanedText, "filler");
  }

  const wordCount = normalizedText.split(" ").filter(Boolean).length;
  const technicalProtectionApplied = hasTechnicalTerm
    && hasTechnicalActionPattern(normalizedText)
    && !/(?:\.\.\.|…)$/.test(cleanedText)
    && (/[?.!]$/.test(cleanedText) || wordCount >= 5);
  if (isLikelyIncomplete(normalizedText, cleanedText, hasTechnicalTerm) && !technicalProtectionApplied) {
    return {
      text: cleanedText,
      shouldUse: false,
      reason: "incomplete",
      quality: "incomplete",
      technicalProtectionApplied: false
    };
  }

  if ((normalizedText.length < 8 || wordCount < 2) && !hasTechnicalTerm) {
    return rejected(cleanedText, "too_short");
  }

  return {
    text: cleanedText,
    shouldUse: true,
    reason: "accepted",
    quality: hasTechnicalTerm && wordCount <= 3 ? "short_technical" : "clean",
    technicalProtectionApplied
  };
}

function cleanupWhitespace(text: string): string {
  return text
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9+./-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isFiller(text: string): boolean {
  return fillerPhrases.some((phrase) => text === phrase || text === `${phrase}.`);
}

function containsTechnicalTerm(text: string): boolean {
  return strongTechnicalTerms.some((term) => containsPhrase(text, term));
}

function hasTechnicalActionPattern(text: string): boolean {
  return technicalActionPatterns.some((pattern) => pattern.test(text));
}

function containsPhrase(text: string, phrase: string): boolean {
  const punctuationSeparatedText = text.replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  return ` ${punctuationSeparatedText} `.includes(` ${phrase} `);
}

function isLikelyIncomplete(text: string, originalText: string, hasTechnicalTerm: boolean): boolean {
  const words = text.split(" ").filter(Boolean);
  if (/^(?:как|how|what)$/.test(text)) return true;
  if (/^(?:сколько\s+у|на\s+каком(?:\s+уровне(?:\s+работает)?)?|протокол)$/.test(text) && !hasTechnicalTerm) return true;
  if (/(?:\.\.\.|…)\s*$/.test(originalText) && words.length <= 4) return true;
  const lastWord = words.at(-1) ?? "";
  if (danglingEndings.includes(lastWord)) return true;

  const startsIncompleteQuestion = incompleteQuestionStarts.some((start) => text === start || text.startsWith(`${start} `));
  const hasTerminalPunctuation = /[?.!]$/.test(originalText);
  if (startsIncompleteQuestion && !hasTerminalPunctuation && (words.length <= 4 || !hasTechnicalTerm)) return true;

  return false;
}

function hasUnsupportedScriptMajority(text: string): boolean {
  const letters = Array.from(text).filter((character) => /\p{L}/u.test(character));
  if (letters.length === 0) return false;

  const supportedLetters = letters.filter((character) => /[a-zа-яё]/i.test(character)).length;
  return supportedLetters / letters.length < 0.5;
}

function rejected(text: string, reason: Exclude<TranscriptSanitizationReason, "accepted" | "incomplete">): SanitizedTranscript {
  return { text, shouldUse: false, reason, quality: "noise", technicalProtectionApplied: false };
}
