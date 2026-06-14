import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  detectTechnicalTopic,
  isLikelyIncompleteConversationFragment
} from "@voiceassistant/shared";

test("detectTechnicalTopic recognizes Kubernetes phrases", () => {
  const result = detectTechnicalTopic("Как устроены Kubernetes deployment и ingress?");
  assert.equal(result.currentTopic, "Kubernetes");
  assert.ok(result.confidence >= 0.6);
  assert.ok(result.matchedTerms.includes("kubernetes"));
});

test("detectTechnicalTopic recognizes Docker and Docker Compose phrases", () => {
  assert.equal(detectTechnicalTopic("Как работает Docker image?").currentTopic, "Docker");
  assert.equal(detectTechnicalTopic("Покажи docker compose logs").currentTopic, "Docker Compose");
});

test("conversation context aggregates a topic statement with a short question", () => {
  const context = new ConversationContextBuffer();
  const topicStatement = context.add("Поговорим про Kubernetes", 1_000);
  assert.equal(topicStatement.shouldAnswer, false);
  assert.equal(topicStatement.intent, "topic_intro");

  const question = context.add("Из чего состоит кластер", 2_000);
  assert.equal(question.shouldAnswer, true);
  assert.equal(question.currentTopic, "Kubernetes");
  assert.match(question.aggregatedText, /Поговорим про Kubernetes\./);
  assert.match(question.aggregatedText, /Из чего состоит кластер\?/);
});

test("topic introduction sets Kubernetes context without requesting an answer", () => {
  const context = new ConversationContextBuffer();
  const result = context.add("Давайте поговорим о Kubernetes", 1_000);

  assert.equal(result.intent, "topic_intro");
  assert.equal(result.currentTopic, "Kubernetes");
  assert.equal(result.shouldAnswer, false);
  assert.equal(result.reason, "topic_intro");
});

test("conservative sensitivity keeps topic introduction context-only", () => {
  const result = new ConversationContextBuffer().add(
    "Давайте поговорим о Kubernetes",
    1_000,
    "conservative"
  );

  assert.equal(result.intent, "topic_intro");
  assert.equal(result.shouldAnswer, false);
  assert.equal(result.sensitivity, "conservative");
});

test("short command request uses the current Kubernetes topic", () => {
  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Kubernetes", 1_000);
  const result = context.add("Какие основные команды?", 2_000);

  assert.equal(result.intent, "answer_request");
  assert.equal(result.currentTopic, "Kubernetes");
  assert.equal(result.shouldAnswer, true);
  assert.match(result.aggregatedText, /Kubernetes/);
});

test("explicit Kubernetes command list is an answer request", () => {
  const result = new ConversationContextBuffer().add("Перечислите основные команды Kubernetes", 1_000);

  assert.equal(result.intent, "answer_request");
  assert.equal(result.shouldAnswer, true);
  assert.equal(result.currentTopic, "Kubernetes");
});

test("balanced sensitivity preserves explicit command request behavior", () => {
  const result = new ConversationContextBuffer().add(
    "Перечислите основные команды Kubernetes",
    1_000,
    "balanced"
  );

  assert.equal(result.shouldAnswer, true);
  assert.equal(result.intent, "answer_request");
  assert.equal(result.sensitivity, "balanced");
});

test("active sensitivity answers short Kubernetes commands fragment", () => {
  const context = new ConversationContextBuffer();
  context.add("Тема Kubernetes", 1_000, "active");
  const result = context.add("основные команды", 2_000, "active");

  assert.equal(result.shouldAnswer, true);
  assert.equal(result.intent, "answer_request");
  assert.equal(result.currentTopic, "Kubernetes");
});

test("active sensitivity answers short Docker logs fragment", () => {
  const context = new ConversationContextBuffer();
  context.add("Поговорим про Docker", 1_000, "active");
  const result = context.add("логи контейнера", 2_000, "active");

  assert.equal(result.shouldAnswer, true);
  assert.equal(result.intent, "answer_request");
  assert.equal(result.currentTopic, "Docker");
});

test("active sensitivity answers a short troubleshooting fragment", () => {
  const result = new ConversationContextBuffer().add("контейнер не стартует", 1_000, "active");

  assert.equal(result.shouldAnswer, true);
  assert.equal(result.reason, "active_topic_fragment");
});

test("conversation context answers an explicit Docker question", () => {
  const context = new ConversationContextBuffer();
  const result = context.add("Из чего состоит Docker image?", 1_000);

  assert.equal(result.shouldAnswer, true);
  assert.equal(result.currentTopic, "Docker");
  assert.equal(result.reason, "answer");
});

test("conversation context uses a Kubernetes topic for a short follow-up", () => {
  const context = new ConversationContextBuffer();
  context.add("Давайте обсудим Kubernetes", 1_000);
  const result = context.add("Из чего состоит?", 2_000);

  assert.equal(result.shouldAnswer, true);
  assert.equal(result.currentTopic, "Kubernetes");
  assert.match(result.aggregatedText, /Kubernetes/);
});

test("conversation context waits for incomplete phrases", () => {
  const context = new ConversationContextBuffer();
  const result = context.add("В Kubernetes есть...", 1_000);
  assert.equal(isLikelyIncompleteConversationFragment("Команда для..."), true);
  assert.equal(result.shouldWait, true);
  assert.equal(result.reason, "incomplete");
});

test("conversation context allows a clearly different question on the same topic", () => {
  const context = new ConversationContextBuffer({ topicCooldownMs: 30_000 });
  const first = context.add("Как работает Kubernetes?", 1_000);
  assert.equal(first.shouldAnswer, true);
  context.markAnswered(first, 1_000);

  const followUp = context.add("Как проверить статус Kubernetes deployment?", 10_000);
  assert.equal(followUp.shouldAnswer, true);
  assert.equal(followUp.reason, "answer");
  assert.equal(followUp.cooldownRemainingMs, 0);
});

test("conversation context blocks an identical answered fragment", () => {
  const context = new ConversationContextBuffer({ topicCooldownMs: 30_000 });
  const first = context.add("Как работает Kubernetes?", 1_000);
  context.markAnswered(first, 1_000);

  const duplicate = context.add("Как работает Kubernetes?", 2_000);
  assert.equal(duplicate.shouldAnswer, false);
  assert.equal(duplicate.reason, "duplicate");
});

test("active sensitivity still blocks an exact duplicate", () => {
  const context = new ConversationContextBuffer();
  const first = context.add("контейнер не стартует", 1_000, "active");
  context.markAnswered(first, 1_000);
  const duplicate = context.add("контейнер не стартует", 2_000, "active");

  assert.equal(duplicate.shouldAnswer, false);
  assert.equal(duplicate.reason, "duplicate");
});

test("conversation context cooldown blocks a near-duplicate question", () => {
  const context = new ConversationContextBuffer({ topicCooldownMs: 30_000 });
  const first = context.add("Как работает Kubernetes scheduler?", 1_000);
  context.markAnswered(first, 1_000);

  const nearDuplicate = context.add("Как работает scheduler Kubernetes?", 2_000);
  assert.equal(nearDuplicate.shouldAnswer, false);
  assert.equal(nearDuplicate.reason, "topic_cooldown");
  assert.equal(nearDuplicate.cooldownRemainingMs, 29_000);
});

test("conversation context ignores non-technical meeting housekeeping", () => {
  const context = new ConversationContextBuffer();
  const result = context.add("Давайте начнем встречу и перейдем к следующему слайду", 1_000);
  assert.equal(result.shouldAnswer, false);
  assert.equal(result.reason, "ignored");
  assert.equal(result.intent, "ignore");
  assert.equal(result.currentTopic, null);
});

test("non-technical phrase is ignored in every sensitivity mode", () => {
  for (const sensitivity of ["conservative", "balanced", "active"] as const) {
    const result = new ConversationContextBuffer().add("Давайте вернемся после обеда", 1_000, sensitivity);
    assert.equal(result.shouldAnswer, false);
    assert.equal(result.intent, "ignore");
  }
});

test("balanced sensitivity recovers a recent unanswered request after a noisy fragment", () => {
  const context = new ConversationContextBuffer({ pendingRequestMaxAgeMs: 25_000 });
  context.add("Коллеги, давайте поговорим о Kubernetes.", 1_000, "balanced");
  const request = context.add("Какие основные команды вы знаете?", 5_000, "balanced");
  const recovered = context.add("Первый отец.", 8_000, "balanced");

  assert.equal(request.shouldAnswer, true);
  assert.equal(recovered.shouldAnswer, true);
  assert.equal(recovered.reason, "pending_answer_request");
  assert.equal(recovered.decisionSource, "pending_context");
  assert.equal(recovered.pendingRequestText, request.aggregatedText);
  assert.doesNotMatch(recovered.aggregatedText, /Первый отец/);
});

test("conservative sensitivity does not recover a pending request from later noise", () => {
  const context = new ConversationContextBuffer();
  context.add("Тема Kubernetes", 1_000, "conservative");
  const request = context.add("Какие основные команды Kubernetes?", 2_000, "conservative");
  const noise = context.add("Первый отец.", 3_000, "conservative");

  assert.equal(request.shouldAnswer, true);
  assert.equal(noise.shouldAnswer, false);
  assert.equal(noise.intent, "ignore");
});

test("answered and cleared pending requests are not recovered", () => {
  const answeredContext = new ConversationContextBuffer();
  answeredContext.add("Тема Kubernetes", 1_000);
  const request = answeredContext.add("Какие основные команды?", 2_000);
  answeredContext.markAnswered(request, 2_500);
  const afterAnswer = answeredContext.add("Первый отец.", 3_000);

  const clearedContext = new ConversationContextBuffer();
  clearedContext.add("Тема Kubernetes", 1_000);
  clearedContext.add("Какие основные команды?", 2_000);
  clearedContext.clear();
  const afterClear = clearedContext.add("Первый отец.", 3_000);

  assert.equal(afterAnswer.shouldAnswer, false);
  assert.equal(afterClear.shouldAnswer, false);
});
