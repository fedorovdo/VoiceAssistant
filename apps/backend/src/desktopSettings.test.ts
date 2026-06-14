import assert from "node:assert/strict";
import { test } from "node:test";
import type { DesktopSettings } from "@voiceassistant/shared";
import { migrateDesktopSettings } from "@voiceassistant/shared";

const defaults: DesktopSettings = {
  apiKey: "",
  model: "gpt-4.1-mini",
  interfaceLanguage: "ru",
  answerLanguage: "ru",
  audioInputDeviceId: "",
  answerMode: "short",
  answerSourceMode: "local-plus-gpt",
  workMode: "manual",
  layoutMode: "vertical",
  speechToTextProvider: "mock"
};

test("settings migration adds answerSourceMode without dropping microphone settings", () => {
  const migrated = migrateDesktopSettings({
    apiKey: "sk-existing-test-key",
    model: "gpt-4.1",
    interfaceLanguage: "en",
    answerLanguage: "en",
    audioInputDeviceId: "microphone-device-id",
    answerMode: "learning",
    workMode: "live",
    layoutMode: "horizontal",
    speechToTextProvider: "microphone"
  }, defaults);

  assert.deepEqual(migrated, {
    apiKey: "sk-existing-test-key",
    model: "gpt-4.1",
    interfaceLanguage: "en",
    answerLanguage: "en",
    audioInputDeviceId: "microphone-device-id",
    answerMode: "learning",
    answerSourceMode: "local-plus-gpt",
    workMode: "live",
    layoutMode: "horizontal",
    speechToTextProvider: "microphone"
  });
});

test("settings migration keeps valid source mode independent from transcription settings", () => {
  const migrated = migrateDesktopSettings({
    apiKey: "sk-transcription-test-key",
    answerLanguage: "ru",
    answerSourceMode: "local-only",
    speechToTextProvider: "microphone"
  }, defaults);

  assert.equal(migrated.answerSourceMode, "local-only");
  assert.equal(migrated.apiKey, "sk-transcription-test-key");
  assert.equal(migrated.answerLanguage, "ru");
  assert.equal(migrated.speechToTextProvider, "microphone");
});
