import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  LiveAnswerRequestGate,
  lookupLocalKnowledge,
  reduceLiveProcessingState,
  resolveLiveAssistDecision
} from "@voiceassistant/shared";
import type { LiveProcessingEvent, LiveProcessingState } from "@voiceassistant/shared";

test("Live processing events expose the expected compact state sequence", () => {
  const events: LiveProcessingEvent[] = [
    "listening_started",
    "transcription_started",
    "fragment_buffered",
    "utterance_flushed",
    "local_lookup_started",
    "answer_rendered",
    "settled"
  ];
  const expected: LiveProcessingState[] = [
    "listening",
    "transcribing",
    "collecting",
    "deciding",
    "searching_local",
    "answered",
    "listening"
  ];

  let state: LiveProcessingState = "idle";
  assert.deepEqual(events.map((event) => (state = reduceLiveProcessingState(state, event))), expected);
});

test("terminal Live processing states settle back to listening", () => {
  for (const terminalEvent of ["answer_rendered", "duplicate_detected", "processing_failed"] as const) {
    const terminalState = reduceLiveProcessingState("deciding", terminalEvent);
    assert.notEqual(terminalState, "listening");
    assert.equal(reduceLiveProcessingState(terminalState, "settled"), "listening");
  }
});

test("answer request gate resets after success, error, and Clear", () => {
  const gate = new LiveAnswerRequestGate();
  assert.equal(gate.tryStart(), true);
  assert.equal(gate.isInFlight(), true);
  assert.equal(gate.tryStart(), false);

  gate.finish();
  assert.equal(gate.isInFlight(), false);
  assert.equal(gate.tryStart(), true);
  gate.finish();
  assert.equal(gate.isInFlight(), false);

  assert.equal(gate.tryStart(), true);
  gate.reset();
  assert.equal(gate.isInFlight(), false);
});

test("processing state transitions do not alter local answer selection", () => {
  const query = "Как поменять пароль в Linux?";
  const contextDecision = new ConversationContextBuffer().add(query, 1_000, "balanced");
  const before = lookupLocalKnowledge(query);
  let state: LiveProcessingState = "idle";
  for (const event of ["utterance_flushed", "local_lookup_started", "answer_rendered"] as const) {
    state = reduceLiveProcessingState(state, event);
  }
  const after = lookupLocalKnowledge(query, {
    aggregatedText: contextDecision.aggregatedText,
    currentTopic: contextDecision.currentTopic
  });
  const decision = resolveLiveAssistDecision({
    contextDecision,
    answerSourceMode: "local-only",
    hasLocalMatch: after.matches.length > 0,
    hasApiKey: false,
    answerMode: "short"
  });

  assert.equal(state, "answered");
  assert.equal(before.bestMatch?.id, "linux-change-password");
  assert.equal(after.bestMatch?.id, before.bestMatch?.id);
  assert.equal(decision.action, "answer");
});
