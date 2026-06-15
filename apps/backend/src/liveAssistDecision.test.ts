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

test("local-only finds the Kubernetes basic commands card", () => {
  const contextDecision = new ConversationContextBuffer().add("Перечислите основные команды Kubernetes", 1_000);
  const matches = findLiveKnowledgeCards(
    "Перечислите основные команды Kubernetes",
    contextDecision.aggregatedText,
    contextDecision.currentTopic
  );
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(matches[0]?.id, "kubernetes-basic-commands");
  assert.equal(decision.action, "answer");
  assert.equal(decision.sourceResolution, "local");
});

test("topic introduction followed by a short Kubernetes request finds local commands", () => {
  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Kubernetes", 1_000);
  const contextDecision = context.add("Какие основные команды?", 2_000);
  const matches = findLiveKnowledgeCards(
    "Какие основные команды?",
    contextDecision.aggregatedText,
    contextDecision.currentTopic
  );

  assert.equal(matches[0]?.id, "kubernetes-basic-commands");
});

test("Docker topic followed by a short logs request finds docker logs", () => {
  const context = new ConversationContextBuffer();
  context.add("Поговорим про Docker", 1_000);
  const contextDecision = context.add("Как посмотреть логи?", 2_000);
  const matches = findLiveKnowledgeCards(
    "Как посмотреть логи?",
    contextDecision.aggregatedText,
    contextDecision.currentTopic
  );

  assert.equal(contextDecision.intent, "answer_request");
  assert.equal(matches[0]?.id, "docker-logs");
});

test("topic introduction is skipped without being treated as generic ignore", () => {
  const contextDecision = new ConversationContextBuffer().add("Обсудим Active Directory", 1_000);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "gpt-only",
    hasLocalMatch: false,
    hasApiKey: true,
    answerMode: "short"
  });

  assert.equal(decision.action, "topic_intro");
});

test("local-only active sensitivity uses topic context for a short fragment", () => {
  const context = new ConversationContextBuffer();
  context.add("Поговорим про Docker", 1_000, "active");
  const contextDecision = context.add("логи контейнера", 2_000, "active");
  const matches = findLiveKnowledgeCards(
    "логи контейнера",
    contextDecision.aggregatedText,
    contextDecision.currentTopic
  );
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(matches[0]?.id, "docker-logs");
  assert.equal(decision.action, "answer");
  assert.match(decision.reason, /sensitivity=active/);
});

test("local-only recovers Kubernetes commands from pending context after noise", () => {
  const context = new ConversationContextBuffer();
  context.add("Коллеги, давайте поговорим о Kubernetes.", 1_000, "balanced");
  context.add("Какие основные команды вы знаете?", 2_000, "balanced");
  const contextDecision = context.add("Первый отец.", 3_000, "balanced");
  const matches = findLiveKnowledgeCards(
    contextDecision.pendingRequestText ?? "Первый отец.",
    contextDecision.aggregatedText,
    contextDecision.currentTopic
  );
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(contextDecision.decisionSource, "pending_context");
  assert.equal(matches[0]?.id, "kubernetes-basic-commands");
  assert.equal(decision.action, "answer");
  assert.equal(decision.sourceResolution, "local");
});

test("Kubernetes topic resolves a short restart follow-up locally", () => {
  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Kubernetes", 1_000);
  const contextDecision = context.add("Например, как перезапустить?", 2_000);
  const matches = findLiveKnowledgeCards(
    "Например, как перезапустить?",
    contextDecision.aggregatedText,
    contextDecision.currentTopic
  );

  assert.equal(contextDecision.shouldAnswer, true);
  assert.equal(matches[0]?.id, "kubectl-rollout-restart");
});

test("local-only answers rescued sudo and Linux security questions", () => {
  for (const [phrase, expectedCard] of [
    ["Как добавить пользователю права sudo?", "linux-add-user-sudo"],
    ["Как проверить безопасность в Linux?", "linux-security-quick-check"]
  ] as const) {
    const contextDecision = new ConversationContextBuffer().add(phrase, 1_000, "balanced");
    const matches = findLiveKnowledgeCards(phrase, contextDecision.aggregatedText, contextDecision.currentTopic);
    const decision = resolveLiveAssistDecision({
      contextDecision,
      answerSourceMode: "local-only",
      hasLocalMatch: matches.length > 0,
      hasApiKey: false,
      answerMode: "short"
    });

    assert.equal(contextDecision.intentRescue, phrase.includes("sudo"));
    assert.equal(matches[0]?.id, expectedCard);
    assert.equal(decision.action, "answer");
    assert.equal(decision.sourceResolution, "local");
  }
});

test("local-only answers a complete broad Linux permissions utterance", () => {
  const phrase = "Как дать права в Linux?";
  const contextDecision = new ConversationContextBuffer().add(phrase, 1_000, "balanced");
  const matches = findLiveKnowledgeCards(phrase, contextDecision.aggregatedText, contextDecision.currentTopic);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(contextDecision.shouldAnswer, true);
  assert.equal(matches[0]?.id, "linux-permissions-overview");
  assert.equal(decision.action, "answer");
  assert.equal(decision.sourceResolution, "local");
});
