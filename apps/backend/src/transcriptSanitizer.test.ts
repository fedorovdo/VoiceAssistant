import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeTranscript } from "@voiceassistant/shared";

test("sanitizeTranscript accepts Russian questions with English technical terms", () => {
  assert.equal(sanitizeTranscript("Что такое Docker image?", "ru").shouldUse, true);
  assert.equal(sanitizeTranscript("Как проверить порт в Linux?", "ru").shouldUse, true);
});

test("sanitizeTranscript rejects common filler phrases", () => {
  assert.equal(sanitizeTranscript("продолжение следует", "ru").reason, "filler");
  assert.equal(sanitizeTranscript("thanks for watching", "en").reason, "filler");
});

test("sanitizeTranscript rejects unsupported-script noise in Russian mode", () => {
  const result = sanitizeTranscript("你好世界随机文本", "ru");
  assert.equal(result.shouldUse, false);
  assert.equal(result.reason, "wrong_script");
});

test("sanitizeTranscript preserves mixed Russian and English technical phrases", () => {
  assert.equal(sanitizeTranscript("Нужно проверить Kubernetes service", "ru").text, "Нужно проверить Kubernetes service");
  assert.equal(sanitizeTranscript("Linux port", "ru").shouldUse, true);
});

test("sanitizeTranscript marks an unfinished question for buffering", () => {
  const result = sanitizeTranscript("Как работает", "ru");
  assert.equal(result.shouldUse, false);
  assert.equal(result.reason, "incomplete");
  assert.equal(result.quality, "incomplete");
  assert.equal(sanitizeTranscript("Как работает Kubernetes?", "ru").shouldUse, true);
  assert.equal(sanitizeTranscript("Как проверить порт", "ru").reason, "incomplete");
  assert.equal(sanitizeTranscript("Как проверить порт в Linux?", "ru").shouldUse, true);
});

test("sanitizeTranscript collapses repeated whitespace", () => {
  const result = sanitizeTranscript("  Что   такое\n\nDocker image?  ", "ru");
  assert.equal(result.text, "Что такое\nDocker image?");
});
