import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  findLiveKnowledgeCards,
  resolveLiveAssistDecision,
  UtteranceBuffer
} from "@voiceassistant/shared";

test("utterance buffer combines a split Linux sudo question", () => {
  const buffer = new UtteranceBuffer();
  assert.equal(buffer.addFragment("Как дать права?", 1_000).shouldFlush, false);
  assert.equal(buffer.addFragment("В Linux.", 2_000).shouldFlush, false);
  const update = buffer.addFragment("sudo.", 3_000);

  assert.equal(update.shouldFlush, true);
  assert.equal(update.flushReason, "max_fragments");
  assert.equal(buffer.flush(3_000)?.text, "Как дать права в Linux sudo?");
});

test("utterance buffer keeps a command follow-up after a security question", () => {
  const buffer = new UtteranceBuffer();
  buffer.addFragment("Как проверить безопасность?", 1_000);
  buffer.addFragment("В Linux.", 2_000);
  buffer.addFragment("Команды.", 3_000);

  assert.equal(buffer.flush(3_000)?.text, "Как проверить безопасность в Linux? Команды.");
});

test("utterance buffer combines a Kubernetes context continuation", () => {
  const buffer = new UtteranceBuffer({ idleFlushMs: 1_500 });
  buffer.addFragment("Перезапустить pod.", 1_000);
  buffer.addFragment("В Kubernetes.", 2_000);

  assert.equal(buffer.shouldFlush(3_499), false);
  assert.equal(buffer.shouldFlush(3_500), true);
  assert.equal(buffer.flush(3_500)?.text, "Перезапустить pod в Kubernetes.");
});

test("complete explicit question flushes immediately while incomplete phrase waits", () => {
  const complete = new UtteranceBuffer().addFragment("Что такое Docker image?", 1_000);
  const incomplete = new UtteranceBuffer().addFragment("Как дать права?", 1_000);

  assert.equal(complete.shouldFlush, true);
  assert.equal(complete.flushReason, "strong_punctuation");
  assert.equal(incomplete.shouldFlush, false);
});

test("utterance buffer clears pending text", () => {
  const buffer = new UtteranceBuffer();
  buffer.addFragment("Как дать права?", 1_000);
  buffer.clear();

  assert.equal(buffer.getPendingUtterance(), "");
  assert.equal(buffer.shouldFlush(10_000), false);
  assert.equal(buffer.flush(10_000), undefined);
});

test("Live Assist and local-only use the flushed sudo utterance", () => {
  const buffer = new UtteranceBuffer();
  buffer.addFragment("Как дать права?", 1_000);
  buffer.addFragment("В Linux.", 2_000);
  buffer.addFragment("sudo.", 3_000);
  const utterance = buffer.flush(3_000)?.text ?? "";
  const contextDecision = new ConversationContextBuffer().add(utterance, 3_000, "balanced");
  const matches = findLiveKnowledgeCards(utterance, contextDecision.aggregatedText, contextDecision.currentTopic);
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(contextDecision.intent, "answer_request");
  assert.equal(matches[0]?.id, "linux-add-user-sudo");
  assert.equal(decision.action, "answer");
  assert.equal(decision.sourceResolution, "local");
});

test("buffered non-technical question remains ignored", () => {
  const buffer = new UtteranceBuffer({ idleFlushMs: 1_500 });
  buffer.addFragment("Как приготовить чай?", 1_000);
  const utterance = buffer.flush(2_500)?.text ?? "";
  const decision = new ConversationContextBuffer().add(utterance, 2_500, "active");

  assert.equal(decision.shouldAnswer, false);
  assert.equal(decision.intent, "ignore");
});
