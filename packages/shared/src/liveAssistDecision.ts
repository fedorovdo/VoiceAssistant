import type { AnswerSourceContext, AnswerSourceResolution, AnswerSourceMode } from "./answerSource.js";
import { resolveAnswerSource } from "./answerSource.js";
import type { LiveContextDecision } from "./conversationContext.js";
import type { KnowledgeCard } from "./knowledgeCards.js";
import { findKnowledgeCards } from "./knowledgeCards.js";

export type LiveAssistAction =
  | "answer"
  | "ignore"
  | "wait"
  | "cooldown"
  | "duplicate"
  | "no_local_match"
  | "missing_api_key";

export interface LiveAssistDecisionInput {
  contextDecision: Pick<LiveContextDecision, "shouldAnswer" | "shouldWait" | "reason">;
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

export function findLiveKnowledgeCards(fragment: string, aggregatedText: string): KnowledgeCard[] {
  const directMatches = findKnowledgeCards(fragment);
  return directMatches.length > 0 ? directMatches : findKnowledgeCards(aggregatedText);
}
