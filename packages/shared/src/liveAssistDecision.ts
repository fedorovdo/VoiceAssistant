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
  contextDecision: Pick<LiveContextDecision, "intent" | "shouldAnswer" | "shouldWait" | "reason">;
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
    return { action: "topic_intro", reason: contextDecision.reason };
  }

  if (contextDecision.shouldWait) {
    return { action: "wait", reason: contextDecision.reason };
  }

  if (!contextDecision.shouldAnswer) {
    if (contextDecision.reason === "duplicate") {
      return { action: "duplicate", reason: contextDecision.reason };
    }
    if (contextDecision.reason === "topic_cooldown") {
      return { action: "cooldown", reason: contextDecision.reason };
    }
    return { action: "ignore", reason: contextDecision.reason };
  }

  const sourceResolution = resolveAnswerSource({
    mode: input.answerSourceMode,
    hasLocalMatch: input.hasLocalMatch,
    hasApiKey: input.hasApiKey,
    answerMode: input.answerMode
  });

  if (sourceResolution === "local-not-found") {
    return { action: "no_local_match", reason: sourceResolution, sourceResolution };
  }
  if (sourceResolution === "gpt-key-required" || sourceResolution === "hybrid-key-required") {
    return { action: "missing_api_key", reason: sourceResolution, sourceResolution };
  }

  return { action: "answer", reason: sourceResolution, sourceResolution };
}

export function findLiveKnowledgeCards(
  fragment: string,
  aggregatedText: string,
  currentTopic?: LiveContextDecision["currentTopic"]
): KnowledgeCard[] {
  const directMatches = findKnowledgeCards(fragment);
  if (directMatches.length > 0) return directMatches;

  if (currentTopic) {
    const contextualMatches = findKnowledgeCards(`${fragment} ${topicSearchContext(currentTopic)}`);
    if (contextualMatches.length > 0) return contextualMatches;
  }

  return findKnowledgeCards(aggregatedText);
}

function topicSearchContext(topic: NonNullable<LiveContextDecision["currentTopic"]>): string {
  if (topic === "Kubernetes") return "Kubernetes kubectl";
  if (topic === "Docker Compose") return "Docker Compose";
  if (topic === "Active Directory") return "Active Directory";
  if (topic === "DNS/DHCP") return "DNS DHCP";
  return topic;
}
