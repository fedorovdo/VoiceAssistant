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

test("classifyTechnicalFragment rescues practical Linux admin questions", () => {
  const security = classifyTechnicalFragment("Как проверить безопасность в Linux?");
  const sudo = classifyTechnicalFragment("Как добавить пользователю права sudo?");
  const sudoPhrase = classifyTechnicalFragment("Как добавить права пользователю, чтобы не писать sudo?");

  assert.equal(security.classification, "explicit_question");
  assert.equal(security.intentRescue, false);

  for (const result of [sudo, sudoPhrase]) {
    assert.equal(result.classification, "explicit_question");
    assert.equal(result.intentRescue, true);
    assert.ok(result.matchedQuestionPattern);
    assert.ok(result.matchedTechnicalTerm);
  }
});

test("intent rescue does not promote lyrics or ordinary questions", () => {
  assert.equal(classifyTechnicalFragment("You're trying, you're crying now").classification, "ignore");
  assert.equal(classifyTechnicalFragment("Как приготовить чай?").classification, "ignore");
});
