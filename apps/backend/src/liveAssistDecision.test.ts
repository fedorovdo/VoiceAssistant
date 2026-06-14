import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  findLiveKnowledgeCards,
  resolveLiveAssistDecision
} from "@voiceassistant/shared";

test("local-only answers a matching fragment without an API key", () => {
  const contextDecision = new ConversationContextBuffer().add("Как посмотреть место на диске в Linux?", 1_000);
  const matches = findLiveKnowledgeCards("Как посмотреть место на диске в Linux?", contextDecision.aggregatedText);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.ok(matches.length > 0);
  assert.equal(decision.action, "answer");
  assert.equal(decision.sourceResolution, "local");
});

test("local-only reports no local match for an unknown technical request", () => {
  const contextDecision = new ConversationContextBuffer().add("Как работает Kubernetes quantum operator?", 1_000);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: false,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(contextDecision.shouldAnswer, true);
  assert.equal(decision.action, "no_local_match");
});

test("gpt-only reports a missing API key for an answerable fragment", () => {
  const contextDecision = new ConversationContextBuffer().add("Что такое Docker image?", 1_000);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "gpt-only",
    hasLocalMatch: false,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(decision.action, "missing_api_key");
  assert.equal(decision.sourceResolution, "gpt-key-required");
});

test("local-plus-gpt preserves the local-first enrichment decision", () => {
  const contextDecision = new ConversationContextBuffer().add("Что такое Docker image?", 1_000);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-plus-gpt",
    hasLocalMatch: true,
    hasApiKey: true,
    answerMode: "learning"
  });

  assert.equal(decision.action, "answer");
  assert.equal(decision.sourceResolution, "local-and-gpt");
});

test("live knowledge lookup tries the newest fragment before aggregate fallback", () => {
  const direct = findLiveKnowledgeCards("docker logs", "unrelated aggregate");
  const fallback = findLiveKnowledgeCards("неизвестная короткая фраза", "Как посмотреть docker logs?");

  assert.equal(direct[0]?.id, "docker-logs");
  assert.equal(fallback[0]?.id, "docker-logs");
});
