import { knowledgeCards } from "./knowledge/index.js";
import type { KnowledgeCard } from "./knowledge/types.js";

export { knowledgeCards, knowledgeTopicPacks, validateKnowledgeTopicPacks } from "./knowledge/index.js";
export type { KnowledgeCard, KnowledgeTopicId, KnowledgeTopicPack } from "./knowledge/types.js";

export type KnowledgeCandidateRejectionReason =
  | "accepted"
  | "no_alias_phrase"
  | "ambiguous_without_context"
  | "below_threshold";

export interface KnowledgeCandidateDebug {
  cardId: string;
  title: string;
  score: number;
  specificityBonus: number;
  accepted: boolean;
  selected: boolean;
  matchedAlias?: string;
  selectionReason?: string;
  rejectionReason: KnowledgeCandidateRejectionReason;
}

export interface KnowledgeCardLookupResult {
  matches: KnowledgeCard[];
  bestMatch?: KnowledgeCard;
  normalizedQuery: string;
  debugCandidates: KnowledgeCandidateDebug[];
  scoreThreshold: number;
  selectionReason?: string;
}

const knowledgeScoreThreshold = 100;

const ambiguousAliases = new Set([
  "pod", "под", "log", "logs", "service", "сервис", "container", "контейнер",
  "group", "группа", "port", "порт", "ss", "free"
]);
const intentMarkers = [
  "что такое", "как работает", "для чего", "как проверить", "как настроить", "как посмотреть",
  "как добавить", "как выдать", "как дать", "как найти", "не работает", "не запускается", "не стартует", "ошибка", "команда", "command",
  "explain", "check", "show", "list", "troubleshoot"
];
const contextMarkers = [
  "linux", "systemd", "samba", "smb", "smbclient", "cifs", "docker", "compose", "kubernetes", "k8s", "kubectl", "proxmox", "pve",
  "active directory", " ad ", "windows", "powershell", "dns", "dhcp", "tcp", "udp", "firewall",
  "network", "сеть", "memory", "память"
];
const actionMarkers = [
  "добавить", "создать", "удалить", "найти", "проверить", "изменить",
  "заблокировать", "разблокировать", "сбросить пароль", "повысить", "поменять", "сменить"
];
const actionSpecificityBonus = 24;

export function findKnowledgeCards(text: string): KnowledgeCard[] {
  return lookupKnowledgeCards(text).matches;
}

export function lookupKnowledgeCards(text: string): KnowledgeCardLookupResult {
  const normalizedQuery = normalize(text);
  if (!normalizedQuery) {
    return {
      matches: [],
      normalizedQuery,
      debugCandidates: [],
      scoreThreshold: knowledgeScoreThreshold
    };
  }

  const ranked = knowledgeCards
    .map((knowledgeCard, index) => ({ knowledgeCard, index, ...scoreCard(knowledgeCard, normalizedQuery) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matches = ranked
    .filter((result) => result.accepted)
    .slice(0, 2)
    .map((result) => result.knowledgeCard);
  const selectedResult = ranked.find((result) => result.accepted);
  const selectedCardId = selectedResult?.knowledgeCard.id;
  const selectionReason = selectedResult
    ? describeSelection(selectedResult.matchedAlias, normalizedQuery, selectedResult.specificityBonus)
    : undefined;

  return {
    matches,
    bestMatch: matches[0],
    normalizedQuery,
    debugCandidates: ranked.slice(0, 5).map(({ knowledgeCard, score, specificityBonus, accepted, matchedAlias, rejectionReason }) => ({
      cardId: knowledgeCard.id,
      title: knowledgeCard.title,
      score,
      specificityBonus,
      accepted,
      selected: knowledgeCard.id === selectedCardId,
      matchedAlias,
      selectionReason: knowledgeCard.id === selectedCardId ? selectionReason : undefined,
      rejectionReason
    })),
    scoreThreshold: knowledgeScoreThreshold,
    selectionReason
  };
}

function scoreCard(knowledgeCard: KnowledgeCard, text: string): Omit<KnowledgeCandidateDebug, "cardId" | "title"> {
  if (knowledgeCard.id.includes("samba") && /(?:танец|музык|фестивал|samba\s+de\s+amigo)/i.test(text)) {
    return {
      score: 0,
      specificityBonus: 0,
      accepted: false,
      selected: false,
      rejectionReason: "no_alias_phrase"
    };
  }
  const candidates = [knowledgeCard.title, ...knowledgeCard.aliases].map(normalize);
  let acceptedScore = 0;
  let acceptedSpecificityBonus = 0;
  let matchedAlias: string | undefined;
  let rejectedAmbiguous = false;

  for (const candidate of candidates) {
    if (!candidate || !containsPhrase(text, candidate)) continue;
    if (ambiguousAliases.has(candidate) && !hasTechnicalContext(text, candidate)) {
      rejectedAmbiguous = true;
      continue;
    }

    const exactBonus = text === candidate ? 40 : 0;
    const titleBonus = candidate === normalize(knowledgeCard.title) && candidate.length >= 6 ? 12 : 0;
    const specificityBonus = getActionSpecificityBonus(text, candidate);
    const score = knowledgeScoreThreshold + candidate.length + exactBonus + titleBonus + specificityBonus;
    if (score > acceptedScore) {
      acceptedScore = score;
      acceptedSpecificityBonus = specificityBonus;
      matchedAlias = candidate;
    }
  }

  if (acceptedScore >= knowledgeScoreThreshold) {
    return {
      score: acceptedScore,
      specificityBonus: acceptedSpecificityBonus,
      accepted: true,
      matchedAlias,
      selected: false,
      rejectionReason: "accepted"
    };
  }

  const similarityScore = Math.min(knowledgeScoreThreshold - 1, Math.round(bestTokenCoverage(text, candidates) * 99));
  return {
    score: similarityScore,
    specificityBonus: 0,
    accepted: false,
    selected: false,
    rejectionReason: rejectedAmbiguous
      ? "ambiguous_without_context"
      : similarityScore > 0
        ? "below_threshold"
        : "no_alias_phrase"
  };
}

function getActionSpecificityBonus(text: string, candidate: string): number {
  return actionMarkers.some((marker) => text.includes(marker) && candidate.includes(marker))
    ? actionSpecificityBonus
    : 0;
}

function describeSelection(
  matchedAlias: string | undefined,
  normalizedQuery: string,
  specificityBonus: number
): string {
  if (specificityBonus > 0) return "specific_action_alias";
  if (matchedAlias === normalizedQuery) return "exact_alias";
  return "alias_phrase";
}

function bestTokenCoverage(text: string, candidates: string[]): number {
  const queryTokens = new Set(text.split(" ").filter((token) => token.length >= 3));
  if (queryTokens.size === 0) return 0;

  return candidates.reduce((best, candidate) => {
    const candidateTokens = new Set(candidate.split(" ").filter((token) => token.length >= 3));
    if (candidateTokens.size === 0) return best;
    const overlap = [...candidateTokens].filter((token) => queryTokens.has(token)).length;
    return Math.max(best, overlap / candidateTokens.size);
  }, 0);
}

function hasTechnicalContext(text: string, alias: string): boolean {
  if (intentMarkers.some((marker) => text.includes(marker))) return true;
  if (contextMarkers.some((marker) => marker !== alias && text.includes(marker))) return true;
  return text.split(" ").length >= 3;
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[?!,;:]+/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/[^a-zа-я0-9+./-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
