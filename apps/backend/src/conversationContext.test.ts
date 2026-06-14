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

test("conversation context waits for incomplete phrases", () => {
  const context = new ConversationContextBuffer();
  const result = context.add("В Kubernetes есть...", 1_000);
  assert.equal(isLikelyIncompleteConversationFragment("Команда для..."), true);
  assert.equal(result.shouldWait, true);
  assert.equal(result.reason, "incomplete");
});

test("conversation context applies cooldown per answered topic", () => {
  const context = new ConversationContextBuffer({ topicCooldownMs: 30_000 });
  const first = context.add("Как работает Kubernetes?", 1_000);
  assert.equal(first.shouldAnswer, true);
  context.markAnswered(first, 1_000);

  const repeatedTopic = context.add("Из чего состоит Kubernetes кластер?", 10_000);
  assert.equal(repeatedTopic.shouldAnswer, false);
  assert.equal(repeatedTopic.reason, "topic_cooldown");
});

test("conversation context ignores non-technical meeting housekeeping", () => {
  const context = new ConversationContextBuffer();
  const result = context.add("Давайте начнем встречу и перейдем к следующему слайду", 1_000);
  assert.equal(result.shouldAnswer, false);
  assert.equal(result.reason, "ignored");
  assert.equal(result.currentTopic, null);
});
