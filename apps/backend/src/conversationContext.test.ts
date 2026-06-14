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

  const question = context.add("Из чего состоит кластер", 2_000);
  assert.equal(question.shouldAnswer, true);
  assert.equal(question.currentTopic, "Kubernetes");
  assert.match(question.aggregatedText, /Поговорим про Kubernetes\./);
  assert.match(question.aggregatedText, /Из чего состоит кластер\?/);
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
  assert.equal(result.currentTopic, null);
});
