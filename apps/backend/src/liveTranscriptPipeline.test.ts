import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  lookupLocalKnowledge,
  normalizeTechnicalTerms,
  resolveLiveAssistDecision,
  sanitizeTranscript,
  shouldUseLocalOnlyFastPath,
  TranscriptDuplicateTracker,
  UtteranceBuffer
} from "@voiceassistant/shared";

function runProductionPipeline(
  text: string,
  context = new ConversationContextBuffer(),
  expectImmediateFlush = true
) {
  const sanitized = sanitizeTranscript(text, "ru");
  assert.equal(sanitized.shouldUse, true, `sanitizer rejected: ${text}`);
  const normalized = normalizeTechnicalTerms(sanitized.text).text;
  const utteranceBuffer = new UtteranceBuffer();
  const update = utteranceBuffer.addFragment(normalized, 1_000);
  assert.equal(update.shouldFlush, expectImmediateFlush, `unexpected immediate flush result: ${text}`);
  const flushAt = expectImmediateFlush ? 1_000 : 1_900;
  const utterance = utteranceBuffer.flush(flushAt)?.text ?? "";
  const contextDecision = context.add(utterance, 1_000, "balanced");
  const localLookup = lookupLocalKnowledge(utterance, {
    aggregatedText: contextDecision.aggregatedText,
    currentTopic: contextDecision.currentTopic
  });
  const policy = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: Boolean(localLookup.bestMatch),
    hasApiKey: false,
    answerMode: "short"
  });
  return { sanitized, normalized, utterance, contextDecision, localLookup, policy };
}

test("exact microphone password transcript reaches the Linux local answer", () => {
  const result = runProductionPipeline("Как поменять пароль Linux?");

  assert.equal(result.sanitized.technicalProtectionApplied, true);
  assert.equal(result.normalized, "Как поменять пароль в Linux?");
  assert.equal(result.contextDecision.intent, "answer_request");
  assert.equal(result.contextDecision.currentTopic, "Linux");
  assert.equal(result.localLookup.bestMatch?.id, "linux-change-password");
  assert.equal(result.policy.action, "answer");
});

test("complete password variants resolve with explicit or recent Linux context", () => {
  for (const phrase of [
    "Как поменять пароль в Linux?",
    "Как изменить пароль пользователя Linux?",
    "Поменять пароль пользователю в Linux?"
  ]) {
    assert.equal(runProductionPipeline(phrase).localLookup.bestMatch?.id, "linux-change-password", phrase);
  }

  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Linux", 500, "balanced");
  const result = runProductionPipeline("Как сменить пароль?", context, false);
  assert.equal(result.contextDecision.currentTopic, "Linux");
  assert.equal(result.localLookup.bestMatch?.id, "linux-change-password");
});

test("explicit Linux password question overrides stale Docker context", () => {
  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Docker", 500, "balanced");
  const result = runProductionPipeline("Как поменять пароль Linux?", context);

  assert.equal(result.contextDecision.currentTopic, "Linux");
  assert.equal(result.localLookup.bestMatch?.id, "linux-change-password");
});

test("transcript duplicate tracker blocks exact repeats only within its window", () => {
  const tracker = new TranscriptDuplicateTracker({ duplicateWindowMs: 1_000 });
  assert.equal(tracker.checkAndRemember("Как поменять пароль Linux?", 1_000), false);
  assert.equal(tracker.checkAndRemember("Как поменять пароль Linux!", 1_500), true);
  assert.equal(tracker.checkAndRemember("Поменять пароль Linux", 1_600), false);
  assert.equal(tracker.checkAndRemember("Как поменять пароль Linux?", 2_001), false);

  tracker.clear();
  assert.equal(tracker.checkAndRemember("Как поменять пароль Linux?", 2_100), false);
});

test("noise and incomplete fragments do not enter the answer pipeline", () => {
  assert.equal(sanitizeTranscript("Как поменять...", "ru").reason, "incomplete");
  assert.equal(sanitizeTranscript("Пароль...", "ru").reason, "incomplete");
  assert.equal(sanitizeTranscript("продолжение следует", "ru").reason, "filler");

  const ordinary = runDecisionOnly("Как приготовить чай?");
  const ordinaryDay = runDecisionOnly("Сегодня хороший день");
  const lyric = runDecisionOnly("Love me tender tonight");
  assert.equal(ordinary.intent, "ignore");
  assert.equal(ordinaryDay.intent, "ignore");
  assert.equal(lyric.intent, "ignore");
});

function runDecisionOnly(text: string) {
  const sanitized = sanitizeTranscript(text, "ru");
  assert.equal(sanitized.shouldUse, true);
  return new ConversationContextBuffer().add(sanitized.text, 1_000, "balanced");
}

test("Live local-only keeps answering across Linux, Dockerfile, and Linux", () => {
  const harness = createSequentialLiveHarness();
  const first = harness.process("Как поменять пароль в Linux?", 1_000);
  const second = harness.process("А что такое Dockerfile?", 2_000);
  const third = harness.process("Команды для замены пароля в Linux.", 3_000);

  assert.deepEqual(
    [first.cardId, second.cardId, third.cardId],
    ["linux-change-password", "dockerfile", "linux-change-password"]
  );
  assert.deepEqual([first.action, second.action, third.action], ["answer", "answer", "answer"]);
  assert.equal(third.topic, "Linux");
  assert.equal(third.state, "listening");
});

test("same local card with different wording is allowed but exact duplicate is blocked", () => {
  const harness = createSequentialLiveHarness();
  const first = harness.process("Как поменять пароль в Linux?", 1_000);
  const related = harness.process("Команды для замены пароля в Linux.", 2_000);
  const duplicate = harness.process("Команды для замены пароля в Linux.", 2_500);

  assert.equal(first.cardId, "linux-change-password");
  assert.equal(related.cardId, "linux-change-password");
  assert.equal(related.action, "answer");
  assert.equal(duplicate.action, "duplicate");
  assert.equal(duplicate.duplicateReason, "exact_transcript");
  assert.equal(duplicate.state, "listening");
});

test("password action variants route locally and incomplete fragments still wait", () => {
  for (const phrase of [
    "Менять пароль в Linux.",
    "Меняем пароль в Linux.",
    "Команды для замены пароля в Linux.",
    "Как изменить пароль пользователя Linux?",
    "Как сменить пароль в Linux?",
    "Как? Менять пароль в Linux."
  ]) {
    const result = createSequentialLiveHarness().process(phrase, 1_000);
    assert.equal(result.cardId, "linux-change-password", phrase);
    assert.equal(result.action, "answer", phrase);
  }

  for (const fragment of ["Как?", "Менять...", "Команды для..."]) {
    assert.equal(sanitizeTranscript(fragment, "ru").reason, "incomplete", fragment);
  }
});

test("short password follow-up uses recent Linux topic", () => {
  const harness = createSequentialLiveHarness();
  harness.process("Давайте поговорим о Linux", 1_000);
  const result = harness.process("Как поменять пароль?", 2_000);
  assert.equal(result.topic, "Linux");
  assert.equal(result.cardId, "linux-change-password");
  assert.equal(result.action, "answer");
});

test("local-only bypasses topic cooldown when a distinct request has a strong local match", () => {
  const context = new ConversationContextBuffer();
  const first = context.add("Как поменять пароль в Linux?", 1_000, "balanced");
  context.markAnswered(first, 1_000);
  const related = context.add("Как поменять пароль пользователя в Linux?", 2_000, "balanced");
  const lookup = lookupLocalKnowledge("Как поменять пароль пользователя в Linux?", {
    aggregatedText: related.aggregatedText,
    currentTopic: related.currentTopic
  });
  const fastPath = shouldUseLocalOnlyFastPath("local-only", related, Boolean(lookup.bestMatch));
  const policy = resolveLiveAssistDecision({
    contextDecision: fastPath ? { ...related, shouldAnswer: true, reason: "answer" } : related,
    answerSourceMode: "local-only",
    hasLocalMatch: Boolean(lookup.bestMatch),
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(related.reason, "topic_cooldown");
  assert.equal(fastPath, true);
  assert.equal(policy.action, "answer");
});

test("Clear resets transcript, context, request gate, and processing state", () => {
  const harness = createSequentialLiveHarness();
  assert.equal(harness.process("Как поменять пароль в Linux?", 1_000).action, "answer");
  assert.equal(harness.process("Как поменять пароль в Linux?", 1_500).action, "duplicate");
  harness.clear();
  assert.equal(harness.process("Как поменять пароль в Linux?", 1_600).action, "answer");
});

test("answer-level exact duplicate expires after its configured window", () => {
  const context = new ConversationContextBuffer({ duplicateWindowMs: 1_000, topicCooldownMs: 0 });
  const first = context.add("Как поменять пароль в Linux?", 1_000, "balanced");
  context.markAnswered(first, 1_000);
  assert.equal(context.add("Как поменять пароль в Linux?", 1_500, "balanced").reason, "duplicate");
  assert.notEqual(context.add("Как поменять пароль в Linux?", 2_001, "balanced").reason, "duplicate");
});

function createSequentialLiveHarness() {
  const context = new ConversationContextBuffer();
  const duplicates = new TranscriptDuplicateTracker();
  let state: import("@voiceassistant/shared").LiveProcessingState = "listening";

  return {
    process(text: string, timestamp: number) {
      const sanitized = sanitizeTranscript(text, "ru");
      if (!sanitized.shouldUse) {
        return { action: sanitized.reason, cardId: undefined, topic: null, state };
      }
      const normalized = normalizeTechnicalTerms(sanitized.text).text;
      if (duplicates.checkAndRemember(normalized, timestamp)) {
        state = "duplicate";
        state = "listening";
        return { action: "duplicate", duplicateReason: "exact_transcript", cardId: undefined, topic: null, state };
      }

      const utteranceBuffer = new UtteranceBuffer();
      const update = utteranceBuffer.addFragment(normalized, timestamp);
      const flushAt = update.shouldFlush ? timestamp : timestamp + 900;
      const utterance = utteranceBuffer.flush(flushAt)?.text ?? normalized;
      state = "deciding";
      const contextDecision = context.add(utterance, timestamp, "balanced");
      const lookup = lookupLocalKnowledge(utterance, {
        aggregatedText: contextDecision.aggregatedText,
        currentTopic: contextDecision.currentTopic
      });
      const fastPath = shouldUseLocalOnlyFastPath("local-only", contextDecision, Boolean(lookup.bestMatch));
      const policy = resolveLiveAssistDecision({
        contextDecision: fastPath ? { ...contextDecision, shouldAnswer: true, reason: "answer" } : contextDecision,
        answerSourceMode: "local-only",
        hasLocalMatch: Boolean(lookup.bestMatch),
        hasApiKey: false,
        answerMode: "short"
      });
      if (policy.action === "answer") {
        context.markAnswered(contextDecision, timestamp);
        state = "answered";
      }
      state = "listening";
      return {
        action: policy.action,
        cardId: lookup.bestMatch?.id,
        topic: contextDecision.currentTopic,
        state
      };
    },
    clear() {
      duplicates.clear();
      context.clear();
      state = "idle";
    }
  };
}
