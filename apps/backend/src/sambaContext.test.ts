import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SambaConversationContext,
  detectSambaDeploymentRole,
  lookupLocalKnowledge,
  normalizeTechnicalTerms,
  sanitizeTranscript
} from "@voiceassistant/shared";

test("Samba context detects separate deployment roles", () => {
  assert.equal(detectSambaDeploymentRole("Установка Samba"), "install");
  assert.equal(detectSambaDeploymentRole("Как создать Samba шару?"), "share");
  assert.equal(detectSambaDeploymentRole("Как подключить SMB шару в Linux?"), "client");
  assert.equal(detectSambaDeploymentRole("Что такое Samba AD DC?"), "ad-dc");
  assert.equal(detectSambaDeploymentRole("танец Samba"), undefined);
});

test("Samba context qualifies only role-specific short follow-ups", () => {
  const install = new SambaConversationContext();
  install.accept("Установка Samba", 1_000);
  assert.equal(install.enrichFollowUp("А как запустить?", 2_000).text, "Как запустить Samba после установки?");

  const share = new SambaConversationContext();
  share.accept("Как создать Samba шару?", 1_000);
  assert.equal(share.enrichFollowUp("Как добавить пользователя?", 2_000).text, "Как добавить пользователя Samba share?");

  const ad = new SambaConversationContext();
  ad.accept("Что такое Samba AD DC?", 1_000);
  assert.equal(ad.enrichFollowUp("Как проверить репликацию?", 2_000).text, "Как проверить репликацию Samba AD?");

  assert.equal(new SambaConversationContext().enrichFollowUp("Как добавить пользователя?", 2_000).contextUsed, false);
});

test("Samba follow-ups survive the production normalization and sanitizer order", () => {
  const cases = [
    ["Установка самбы", "А как запустить?", "linux-samba-install"],
    ["Как создать Samba шару?", "Как добавить пользователя?", "linux-samba-share"],
    ["Что такое Samba AD DC?", "Как проверить репликацию?", "active-directory-samba-ad-dc-overview"]
  ] as const;

  for (const [contextText, followUp, expectedCardId] of cases) {
    const samba = new SambaConversationContext();
    const normalizedContext = normalizeTechnicalTerms(contextText).text;
    const first = sanitizeTranscript(normalizedContext, "ru");
    assert.equal(first.shouldUse, true, contextText);
    samba.accept(first.text, 1_000);

    const enriched = samba.enrichFollowUp(followUp, 2_000);
    const sanitizedFollowUp = sanitizeTranscript(enriched.text, "ru");
    assert.equal(sanitizedFollowUp.shouldUse, true, followUp);
    assert.equal(lookupLocalKnowledge(sanitizedFollowUp.text).bestMatch?.id, expectedCardId, followUp);
  }
});
