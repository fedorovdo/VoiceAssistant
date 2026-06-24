import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  NetworkingConversationContext,
  LiveAnswerRequestGate,
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
  expectImmediateFlush = true,
  networkingContext = new NetworkingConversationContext()
) {
  const snapshot = context.getSnapshot(1_000);
  const normalizedResult = normalizeTechnicalTerms(text, {
    currentTopic: snapshot.currentTopic,
    contextText: snapshot.fragments.slice(-3).map((fragment) => fragment.text).join(" ")
  });
  const networkingFollowUp = networkingContext.enrichFollowUp(normalizedResult.text, 1_000);
  const sanitized = sanitizeTranscript(networkingFollowUp.text, "ru");
  assert.equal(sanitized.shouldUse, true, `sanitizer rejected: ${text}`);
  const normalized = sanitized.text;
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
  const afterClear = harness.process("Как поменять пароль в Linux?", 1_600);
  assert.equal(afterClear.action, "answer");
  assert.equal(afterClear.requestId, "test-live-1");
  assert.equal(afterClear.previousQuestion, undefined);
  assert.equal(afterClear.answerInFlightAfter, false);
});

test("answer-level exact duplicate expires after its configured window", () => {
  const context = new ConversationContextBuffer({ duplicateWindowMs: 1_000, topicCooldownMs: 0 });
  const first = context.add("Как поменять пароль в Linux?", 1_000, "balanced");
  context.markAnswered(first, 1_000);
  assert.equal(context.add("Как поменять пароль в Linux?", 1_500, "balanced").reason, "duplicate");
  assert.notEqual(context.add("Как поменять пароль в Linux?", 2_001, "balanced").reason, "duplicate");
});

test("Networking questions pass the production sanitize-to-local pipeline", () => {
  const cases = [
    ["Протокол TCP/IP на каком уровне?", "network-tcp-ip-model"],
    ["На каком уровне работает TCP?", "network-tcp-ip-model"],
    ["На каком уровне работает TCP/IP?", "network-tcp-ip-model"],
    ["Сколько уровней TCP/IP?", "network-tcp-ip-model"],
    ["Сколько уровней OSI?", "network-osi-model"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    const result = runProductionPipeline(query);
    assert.equal(result.sanitized.shouldUse, true, query);
    assert.equal(result.sanitized.technicalProtectionApplied, true, query);
    assert.equal(result.contextDecision.currentTopic, "Networking", query);
    assert.equal(result.contextDecision.intent, "answer_request", query);
    assert.equal(result.localLookup.bestMatch?.id, expectedCardId, query);
    assert.equal(result.policy.action, "answer", query);
  }
});

test("networking context repairs OCI model wording before sanitizer and lookup", () => {
  for (const query of ["Расскажи о системе OCI.", "Схема OCI."]) {
    const context = new ConversationContextBuffer();
    context.add("Поговорим о TCP/IP.", 500, "balanced");
    const result = runProductionPipeline(query, context);
    assert.match(result.normalized, /OSI/i, query);
    assert.equal(result.sanitized.technicalProtectionApplied, true, query);
    assert.equal(result.contextDecision.currentTopic, "Networking", query);
    assert.equal(result.localLookup.bestMatch?.id, "network-osi-model", query);
    assert.equal(result.policy.action, "answer", query);
  }

  assert.equal(
    normalizeTechnicalTerms("Что такое OCI в Oracle Cloud?", { currentTopic: "Networking" }).text,
    "Что такое OCI в Oracle Cloud?"
  );
});

test("TSP/IP typo becomes a TCP/IP topic introduction", () => {
  const result = runProductionPipeline("Протокол TSP/IP.", new ConversationContextBuffer(), false);
  assert.equal(result.normalized, "Протокол TCP/IP.");
  assert.equal(result.sanitized.technicalProtectionApplied, true);
  assert.equal(result.contextDecision.currentTopic, "Networking");
  assert.equal(result.contextDecision.intent, "topic_intro");
  assert.equal(result.localLookup.bestMatch?.id, "network-tcp-ip-model");
  assert.equal(result.policy.action, "topic_intro");
});

test("short networking follow-ups use context and remain distinct", () => {
  const context = new ConversationContextBuffer();
  const networkingContext = new NetworkingConversationContext();
  context.add("Поговорим о TCP/IP.", 500, "balanced");
  networkingContext.accept("Расскажи о модели TCP/IP.", 500);

  const level = runProductionPipeline("На каком уровне работает?", context, true, networkingContext);
  assert.equal(level.normalized, "На каком уровне работает TCP/IP?");
  assert.equal(level.sanitized.technicalProtectionApplied, true);
  assert.equal(level.localLookup.bestMatch?.id, "network-tcp-ip-model");

  const duplicates = new TranscriptDuplicateTracker();
  assert.equal(duplicates.checkAndRemember("На каком уровне работает TCP?", 1_000), false);
  assert.equal(duplicates.checkAndRemember("На каком уровне работает TCP?", 1_500), true);
  assert.equal(duplicates.checkAndRemember("А IP?", 1_600), false);
  assert.equal(duplicates.checkAndRemember("А DNS?", 1_700), false);
});

test("explicit TCP question overrides stale Linux context", () => {
  const context = new ConversationContextBuffer();
  context.add("Поговорим о Linux.", 500, "balanced");
  const result = runProductionPipeline("На каком уровне работает TCP?", context);
  assert.equal(result.contextDecision.currentTopic, "Networking");
  assert.equal(result.localLookup.bestMatch?.id, "network-tcp-ip-model");
  assert.equal(result.policy.action, "answer");
});

test("one Live local-only session renders every distinct networking request", () => {
  const harness = createSequentialLiveHarness();
  const sequence = [
    ["Расскажи о модели TCP/IP.", "network-tcp-ip-model"],
    ["Сколько уровней TCP/IP?", "network-tcp-ip-model"],
    ["На каком уровне работает TCP/IP?", "network-tcp-ip-model"],
    ["Расскажи о модели OSI.", "network-osi-model"],
    ["Схема OSI.", "network-osi-model"]
  ] as const;

  const results = sequence.map(([query], index) => harness.process(query, 1_000 + index * 1_000));
  assert.deepEqual(results.map((result) => result.action), sequence.map(() => "answer"));
  assert.deepEqual(results.map((result) => result.cardId), sequence.map(([, cardId]) => cardId));
  assert.deepEqual(results.map((result) => result.rendered), sequence.map(() => true));
  assert.deepEqual(results.map((result) => result.answerInFlightAfter), sequence.map(() => false));
  assert.deepEqual(results.map((result) => result.state), sequence.map(() => "listening"));
  assert.equal(results[1].sameCardAsPrevious, true);
  assert.equal(results[2].sameCardAsPrevious, true);
  assert.equal(results[3].sameCardAsPrevious, false);
  assert.equal(new Set(results.map((result) => result.requestId)).size, sequence.length);
});

test("Live networking duplicates are exact and expire after the TTL", () => {
  const harness = createSequentialLiveHarness();
  const first = harness.process("Сколько уровней TCP/IP?", 1_000);
  const distinctSameCard = harness.process("На каком уровне работает TCP/IP?", 2_000);
  const duplicate = harness.process("Сколько уровней TCP/IP?", 3_000);
  const afterTtl = harness.process("Сколько уровней TCP/IP?", 31_001);

  assert.equal(first.action, "answer");
  assert.equal(distinctSameCard.action, "answer");
  assert.equal(distinctSameCard.sameCardAsPrevious, true);
  assert.equal(duplicate.action, "duplicate");
  assert.equal(duplicate.exactDuplicate, true);
  assert.equal(duplicate.state, "listening");
  assert.equal(afterTtl.action, "answer");
  assert.equal(afterTtl.rendered, true);
});

function createSequentialLiveHarness() {
  const context = new ConversationContextBuffer();
  const duplicates = new TranscriptDuplicateTracker();
  const answerGate = new LiveAnswerRequestGate();
  let state: import("@voiceassistant/shared").LiveProcessingState = "listening";
  let requestSequence = 0;
  let lastCardId: string | undefined;
  let lastQuestion: string | undefined;
  let renderedCount = 0;

  return {
    process(text: string, timestamp: number) {
      const requestId = `test-live-${++requestSequence}`;
      const previousCardId = lastCardId;
      const previousQuestion = lastQuestion;
      const snapshot = context.getSnapshot(timestamp);
      const normalizedResult = normalizeTechnicalTerms(text, {
        currentTopic: snapshot.currentTopic,
        contextText: snapshot.fragments.slice(-3).map((fragment) => fragment.text).join(" ")
      });
      const sanitized = sanitizeTranscript(normalizedResult.text, "ru");
      if (!sanitized.shouldUse) {
        return { action: sanitized.reason, cardId: undefined, topic: null, state, requestId, rendered: false, exactDuplicate: false, sameCardAsPrevious: false, answerInFlightAfter: answerGate.isInFlight(), previousQuestion };
      }
      const normalized = sanitized.text;
      if (duplicates.checkAndRemember(normalized, timestamp)) {
        state = "duplicate";
        state = "listening";
        return { action: "duplicate", duplicateReason: "exact_transcript", cardId: undefined, topic: null, state, requestId, rendered: false, exactDuplicate: true, sameCardAsPrevious: false, answerInFlightAfter: answerGate.isInFlight(), previousQuestion };
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
        answerGate.finish();
        renderedCount += 1;
        lastCardId = lookup.bestMatch?.id;
        lastQuestion = utterance;
        state = "answered";
      }
      state = "listening";
      return {
        action: policy.action,
        cardId: lookup.bestMatch?.id,
        topic: contextDecision.currentTopic,
        state,
        requestId,
        rendered: policy.action === "answer",
        renderedCount,
        exactDuplicate: false,
        sameCardAsPrevious: Boolean(lookup.bestMatch?.id && lookup.bestMatch.id === previousCardId),
        answerInFlightAfter: answerGate.isInFlight(),
        previousQuestion
      };
    },
    clear() {
      duplicates.clear();
      context.clear();
      answerGate.reset();
      requestSequence = 0;
      lastCardId = undefined;
      lastQuestion = undefined;
      renderedCount = 0;
      state = "idle";
    }
  };
}
