import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTechnicalFragment } from "@voiceassistant/shared";

test("classifyTechnicalFragment detects explicit Russian questions", () => {
  const result = classifyTechnicalFragment("Как работает Kubernetes?");
  assert.equal(result.classification, "explicit_question");
});

test("classifyTechnicalFragment detects standalone technical terms", () => {
  const result = classifyTechnicalFragment("Docker image хранится в registry");
  assert.equal(result.classification, "technical_term");
});

test("classifyTechnicalFragment ignores ordinary conversation", () => {
  const result = classifyTechnicalFragment("Давайте вернемся к этому после обеда");
  assert.equal(result.classification, "ignore");
});
