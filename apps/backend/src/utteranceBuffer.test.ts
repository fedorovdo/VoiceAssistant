import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  findLiveKnowledgeCards,
  resolveLiveAssistDecision,
  shouldUseLocalOnlyFastPath,
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

test("complete Dockerfile questions flush immediately", () => {
  for (const phrase of [
    "Что такое Dockerfile?",
    "Из чего состоит Dockerfile?",
    "Для чего применяется Dockerfile?"
  ]) {
    const update = new UtteranceBuffer().addFragment(phrase, 1_000);
    assert.equal(update.shouldFlush, true, phrase);
    assert.equal(update.flushReason, "strong_punctuation", phrase);
  }
});

test("complete technical action questions flush immediately", () => {
  for (const phrase of [
    "Как поменять пароль в Linux?",
    "Как проверить порты в Linux?",
    "Что такое Dockerfile?",
    "Как добавить пользователя в Active Directory?"
  ]) {
    const update = new UtteranceBuffer().addFragment(phrase, 1_000);
    assert.equal(update.shouldFlush, true, phrase);
    assert.equal(update.flushReason, "strong_punctuation", phrase);
  }
});

test("incomplete fragments wait and complete unpunctuated text uses shorter idle timeout", () => {
  for (const phrase of ["Как проверить...", "Как добавить...", "В Linux...", "Например...", "Команда для..."]) {
    assert.equal(new UtteranceBuffer().addFragment(phrase, 1_000).shouldFlush, false, phrase);
  }

  const complete = new UtteranceBuffer();
  complete.addFragment("Как поменять пароль в Linux", 1_000);
  assert.equal(complete.shouldFlush(1_899), false);
  assert.equal(complete.shouldFlush(1_900), true);
});

test("local-only fast path bypasses topic cooldown but not exact duplicates", () => {
  assert.equal(shouldUseLocalOnlyFastPath("local-only", {
    intent: "answer_request",
    reason: "topic_cooldown",
    shouldWait: false
  }, true), true);
  assert.equal(shouldUseLocalOnlyFastPath("local-only", {
    intent: "answer_request",
    reason: "duplicate",
    shouldWait: false
  }, true), false);
  assert.equal(shouldUseLocalOnlyFastPath("local-plus-gpt", {
    intent: "answer_request",
    reason: "topic_cooldown",
    shouldWait: false
  }, true), false);

  const context = new ConversationContextBuffer({ topicCooldownMs: 30_000 });
  const first = context.add("Как проверить порт в Linux?", 1_000, "balanced");
  context.markAnswered(first, 1_000);
  const followUp = context.add("Как проверить порт в Linux сейчас?", 2_000, "balanced");
  const matches = findLiveKnowledgeCards(
    "Как проверить порт в Linux сейчас?",
    followUp.aggregatedText,
    followUp.currentTopic
  );

  assert.equal(followUp.reason, "topic_cooldown");
  assert.equal(matches[0]?.id, "linux-open-ports");
  assert.equal(shouldUseLocalOnlyFastPath("local-only", followUp, matches.length > 0), true);
});

test("explicit Linux question overrides stale Docker topic for local lookup", () => {
  const context = new ConversationContextBuffer();
  context.add("Что такое Docker?", 1_000, "balanced");
  const linuxDecision = context.add("Как поменять пароль в Linux?", 2_000, "balanced");
  const matches = findLiveKnowledgeCards(
    "Как поменять пароль в Linux?",
    linuxDecision.aggregatedText,
    linuxDecision.currentTopic
  );

  assert.equal(linuxDecision.currentTopic, "Linux");
  assert.equal(linuxDecision.shouldAnswer, true);
  assert.equal(matches[0]?.id, "linux-change-password");
});

test("complete Dockerfile question without punctuation flushes after idle timeout", () => {
  const buffer = new UtteranceBuffer({ idleFlushMs: 1_500 });
  const update = buffer.addFragment("Из чего состоит Dockerfile", 1_000);

  assert.equal(update.shouldFlush, false);
  assert.equal(buffer.shouldFlush(2_499), false);
  assert.equal(buffer.shouldFlush(2_500), true);
  assert.equal(buffer.flush(2_500)?.text, "Из чего состоит Dockerfile.");
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
