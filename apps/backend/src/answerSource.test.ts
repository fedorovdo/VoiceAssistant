import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAnswerSource, shouldSearchLocalKnowledge } from "@voiceassistant/shared";

test("local-only uses matching local knowledge without an API key", () => {
  assert.equal(shouldSearchLocalKnowledge("local-only"), true);
  assert.equal(resolveAnswerSource({
    mode: "local-only",
    hasLocalMatch: true,
    hasApiKey: false,
    answerMode: "short"
  }), "local");
});

test("local-only reports an unknown phrase as not found", () => {
  assert.equal(resolveAnswerSource({
    mode: "local-only",
    hasLocalMatch: false,
    hasApiKey: true,
    answerMode: "learning"
  }), "local-not-found");
});

test("gpt-only skips local knowledge and requires an API key", () => {
  assert.equal(shouldSearchLocalKnowledge("gpt-only"), false);
  assert.equal(resolveAnswerSource({
    mode: "gpt-only",
    hasLocalMatch: true,
    hasApiKey: false,
    answerMode: "interview"
  }), "gpt-key-required");
});

test("local-plus-gpt keeps local-first enrichment and fallback behavior", () => {
  assert.equal(resolveAnswerSource({
    mode: "local-plus-gpt",
    hasLocalMatch: true,
    hasApiKey: true,
    answerMode: "learning"
  }), "local-and-gpt");
  assert.equal(resolveAnswerSource({
    mode: "local-plus-gpt",
    hasLocalMatch: false,
    hasApiKey: true,
    answerMode: "short"
  }), "gpt");
  assert.equal(resolveAnswerSource({
    mode: "local-plus-gpt",
    hasLocalMatch: false,
    hasApiKey: false,
    answerMode: "short"
  }), "hybrid-key-required");
});
