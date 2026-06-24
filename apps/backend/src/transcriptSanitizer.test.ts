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

test("sanitizeTranscript protects networking terms followed by punctuation", () => {
  for (const phrase of ["Расскажи о модели OSI.", "Схема OSI.", "Протокол TCP/IP на каком уровне?"]) {
    const result = sanitizeTranscript(phrase, "ru");
    assert.equal(result.shouldUse, true, phrase);
    assert.equal(result.technicalProtectionApplied, true, phrase);
  }
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

test("sanitizeTranscript protects complete technical password questions", () => {
  const variants = [
    "Как поменять пароль Linux?",
    "Как поменять пароль в Linux?",
    "Как изменить пароль пользователя Linux?",
    "Как сменить пароль?",
    "Поменять пароль пользователю в Linux"
  ];

  for (const phrase of variants) {
    const result = sanitizeTranscript(phrase, "ru");
    assert.equal(result.shouldUse, true, phrase);
    assert.equal(result.reason, "accepted", phrase);
  }
  assert.equal(sanitizeTranscript("Как поменять пароль Linux?", "ru").technicalProtectionApplied, true);
});

test("sanitizeTranscript keeps genuinely incomplete password fragments waiting", () => {
  const result = sanitizeTranscript("Пароль...", "ru");
  assert.equal(result.shouldUse, false);
  assert.equal(result.reason, "incomplete");
});

test("sanitizeTranscript keeps malformed short networking starts out of the answer pipeline", () => {
  for (const phrase of ["Сколько у?", "На каком...", "Протокол..."]) {
    const result = sanitizeTranscript(phrase, "ru");
    assert.equal(result.shouldUse, false, phrase);
    assert.equal(result.reason, "incomplete", phrase);
  }
});
