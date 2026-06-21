import type { AnswerSourceContext, AnswerSourceResolution, AnswerSourceMode } from "./answerSource.js";
import { resolveAnswerSource } from "./answerSource.js";
import type { LiveContextDecision } from "./conversationContext.js";
import type { KnowledgeCard, KnowledgeCandidateDebug, KnowledgeCardLookupResult } from "./knowledgeCards.js";
import { lookupKnowledgeCards } from "./knowledgeCards.js";

export type LiveAssistAction =
  | "answer"
  | "topic_intro"
  | "ignore"
  | "wait"
  | "cooldown"
  | "duplicate"
  | "no_local_match"
  | "missing_api_key";

export interface LiveAssistDecisionInput {
  contextDecision: Pick<LiveContextDecision, "intent" | "sensitivity" | "shouldAnswer" | "shouldWait" | "reason">;
  answerSourceMode: AnswerSourceMode;
  hasLocalMatch: boolean;
  hasApiKey: boolean;
  answerMode: AnswerSourceContext["answerMode"];
}

export interface LiveAssistPolicyDecision {
  action: LiveAssistAction;
  reason: string;
  sourceResolution?: AnswerSourceResolution;
}

export function resolveLiveAssistDecision(input: LiveAssistDecisionInput): LiveAssistPolicyDecision {
  const { contextDecision } = input;

  if (contextDecision.intent === "topic_intro") {
    return { action: "topic_intro", reason: decisionReason(contextDecision, contextDecision.reason) };
  }

  if (contextDecision.shouldWait) {
    return { action: "wait", reason: decisionReason(contextDecision, contextDecision.reason) };
  }

  if (!contextDecision.shouldAnswer) {
    if (contextDecision.reason === "duplicate") {
      return { action: "duplicate", reason: decisionReason(contextDecision, contextDecision.reason) };
    }
    if (contextDecision.reason === "topic_cooldown") {
      return { action: "cooldown", reason: decisionReason(contextDecision, contextDecision.reason) };
    }
    return { action: "ignore", reason: decisionReason(contextDecision, contextDecision.reason) };
  }

  const sourceResolution = resolveAnswerSource({
    mode: input.answerSourceMode,
    hasLocalMatch: input.hasLocalMatch,
    hasApiKey: input.hasApiKey,
    answerMode: input.answerMode
  });

  if (sourceResolution === "local-not-found") {
    return { action: "no_local_match", reason: decisionReason(contextDecision, sourceResolution), sourceResolution };
  }
  if (sourceResolution === "gpt-key-required" || sourceResolution === "hybrid-key-required") {
    return { action: "missing_api_key", reason: decisionReason(contextDecision, sourceResolution), sourceResolution };
  }

  return { action: "answer", reason: decisionReason(contextDecision, sourceResolution), sourceResolution };
}

function decisionReason(
  contextDecision: Pick<LiveContextDecision, "reason" | "sensitivity">,
  outcome: string
): string {
  return `context=${contextDecision.reason}; outcome=${outcome}; sensitivity=${contextDecision.sensitivity}`;
}

export function findLiveKnowledgeCards(
  fragment: string,
  aggregatedText: string,
  currentTopic?: LiveContextDecision["currentTopic"]
): KnowledgeCard[] {
  return lookupLocalKnowledge(fragment, { aggregatedText, currentTopic }).matches;
}

export interface LocalKnowledgeLookupContext {
  aggregatedText?: string;
  currentTopic?: LiveContextDecision["currentTopic"];
}

export function shouldUseLocalOnlyFastPath(
  answerSourceMode: AnswerSourceMode,
  contextDecision: Pick<LiveContextDecision, "intent" | "reason" | "shouldWait">,
  hasLocalMatch: boolean
): boolean {
  return answerSourceMode === "local-only"
    && hasLocalMatch
    && contextDecision.intent === "answer_request"
    && !contextDecision.shouldWait
    && contextDecision.reason !== "duplicate";
}

export type LocalKnowledgeQuerySource = "newest_fragment" | "topic_context" | "aggregated_context";

export interface LocalKnowledgeLookupResult extends KnowledgeCardLookupResult {
  querySource: LocalKnowledgeQuerySource;
  topicContextAdded: boolean;
}

export function lookupLocalKnowledge(
  fragment: string,
  context: LocalKnowledgeLookupContext = {}
): LocalKnowledgeLookupResult {
  const direct = lookupKnowledgeCards(fragment);
  if (direct.bestMatch) {
    return withLookupContext(direct, "newest_fragment", false);
  }

  const attempts: KnowledgeCardLookupResult[] = [direct];
  if (context.currentTopic) {
    const contextual = lookupKnowledgeCards(`${fragment} ${topicSearchContext(context.currentTopic)}`);
    attempts.push(contextual);
    if (contextual.bestMatch) {
      return withLookupContext(contextual, "topic_context", true);
    }
  }

  if (context.aggregatedText && normalizeLookupText(context.aggregatedText) !== normalizeLookupText(fragment)) {
    const aggregated = lookupKnowledgeCards(context.aggregatedText);
    attempts.push(aggregated);
    if (aggregated.bestMatch) {
      return withLookupContext(aggregated, "aggregated_context", Boolean(context.currentTopic));
    }
  }

  return {
    ...direct,
    debugCandidates: mergeDebugCandidates(attempts),
    querySource: "newest_fragment",
    topicContextAdded: attempts.length > 1 && Boolean(context.currentTopic)
  };
}

export function findLocalKnowledgeCards(
  fragment: string,
  context: LocalKnowledgeLookupContext = {}
): KnowledgeCard[] {
  return lookupLocalKnowledge(fragment, context).matches;
}

function withLookupContext(
  result: KnowledgeCardLookupResult,
  querySource: LocalKnowledgeQuerySource,
  topicContextAdded: boolean
): LocalKnowledgeLookupResult {
  return { ...result, querySource, topicContextAdded };
}

function mergeDebugCandidates(attempts: KnowledgeCardLookupResult[]): KnowledgeCandidateDebug[] {
  const byCard = new Map<string, KnowledgeCandidateDebug>();
  for (const candidate of attempts.flatMap((attempt) => attempt.debugCandidates)) {
    const current = byCard.get(candidate.cardId);
    if (!current || candidate.score > current.score) {
      byCard.set(candidate.cardId, candidate);
    }
  }
  return [...byCard.values()].sort((left, right) => right.score - left.score).slice(0, 5);
}

function normalizeLookupText(text: string): string {
  return text.toLowerCase().replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
}

function topicSearchContext(topic: NonNullable<LiveContextDecision["currentTopic"]>): string {
  if (topic === "Kubernetes") return "Kubernetes kubectl";
  if (topic === "Docker Compose") return "Docker Compose";
  if (topic === "Active Directory") return "Active Directory";
  if (topic === "DNS/DHCP") return "DNS DHCP";
  return topic;
}
