import type { AnswerSourceContext, AnswerSourceResolution, AnswerSourceMode } from "./answerSource.js";
import { resolveAnswerSource } from "./answerSource.js";
import type { LiveContextDecision } from "./conversationContext.js";
import type { KnowledgeCard } from "./knowledgeCards.js";
import { findKnowledgeCards } from "./knowledgeCards.js";

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
  return findLocalKnowledgeCards(fragment, { aggregatedText, currentTopic });
}

export interface LocalKnowledgeLookupContext {
  aggregatedText?: string;
  currentTopic?: LiveContextDecision["currentTopic"];
}

export function findLocalKnowledgeCards(
  fragment: string,
  context: LocalKnowledgeLookupContext = {}
): KnowledgeCard[] {
  const directMatches = findKnowledgeCards(fragment);
  if (directMatches.length > 0) return directMatches;

  if (context.currentTopic) {
    const contextualMatches = findKnowledgeCards(`${fragment} ${topicSearchContext(context.currentTopic)}`);
    if (contextualMatches.length > 0) return contextualMatches;
  }

  return context.aggregatedText ? findKnowledgeCards(context.aggregatedText) : [];
}

function topicSearchContext(topic: NonNullable<LiveContextDecision["currentTopic"]>): string {
  if (topic === "Kubernetes") return "Kubernetes kubectl";
  if (topic === "Docker Compose") return "Docker Compose";
  if (topic === "Active Directory") return "Active Directory";
  if (topic === "DNS/DHCP") return "DNS DHCP";
  return topic;
}
