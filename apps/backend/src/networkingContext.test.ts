import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  detectNetworkingContext,
  getNetworkingFocusedResponse,
  lookupLocalKnowledge,
  NetworkingConversationContext,
  normalizeTechnicalTerms,
  resolveLiveAssistDecision,
  sanitizeTranscript,
  shouldUseLocalOnlyFastPath,
  TranscriptDuplicateTracker,
  UtteranceBuffer
} from "@voiceassistant/shared";

function createNetworkingPipelineHarness(ttlMs = 90_000) {
  const conversation = new ConversationContextBuffer();
  const networking = new NetworkingConversationContext({ ttlMs });
  const duplicates = new TranscriptDuplicateTracker();
  let requestSequence = 0;
  let lastCardId: string | undefined;

  return {
    process(rawText: string, timestamp: number) {
      const networkBefore = networking.getSnapshot(timestamp);
      const conversationBefore = conversation.getSnapshot(timestamp);
      const normalized = normalizeTechnicalTerms(rawText, {
        currentTopic: conversationBefore.currentTopic,
        contextText: [networkBefore.lastValidQuestion, ...conversationBefore.fragments.slice(-2).map((item) => item.text)]
          .filter(Boolean)
          .join(" ")
      });
      const followUp = networking.enrichFollowUp(normalized.text, timestamp);
      const sanitized = sanitizeTranscript(followUp.text, "ru");
      const requestId = `network-${++requestSequence}`;
      if (!sanitized.shouldUse) {
        return {
          action: sanitized.reason,
          requestId,
          rendered: false,
          state: "listening",
          contextUsed: followUp.contextUsed,
          context: networking.getSnapshot(timestamp)
        };
      }

      if (duplicates.checkAndRemember(sanitized.text, timestamp)) {
        return {
          action: "duplicate",
          requestId,
          rendered: false,
          state: "listening",
          exactDuplicate: true,
          context: networking.getSnapshot(timestamp)
        };
      }

      const utteranceBuffer = new UtteranceBuffer();
      const update = utteranceBuffer.addFragment(sanitized.text, timestamp);
      const utterance = utteranceBuffer.flush(update.shouldFlush ? timestamp : timestamp + 900)?.text ?? sanitized.text;
      const contextDecision = conversation.add(utterance, timestamp, "balanced");
      const detected = detectNetworkingContext(utterance);
      const shouldUpdate = (contextDecision.intent === "answer_request" || contextDecision.intent === "topic_intro")
        && (contextDecision.currentTopic === "Networking" || contextDecision.currentTopic === "DNS/DHCP")
        && contextDecision.reason !== "duplicate"
        && !contextDecision.shouldWait;
      const transition = shouldUpdate
        ? networking.accept(utterance, timestamp)
        : { previous: networkBefore, detected, effective: networkBefore };
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
      const focusedResponse = getNetworkingFocusedResponse(utterance, "ru");
      const previousCardId = lastCardId;
      if (policy.action === "answer") {
        conversation.markAnswered(contextDecision, timestamp);
        lastCardId = lookup.bestMatch?.id;
      }

      return {
        action: policy.action,
        requestId,
        cardId: lookup.bestMatch?.id,
        rendered: policy.action === "answer",
        state: "listening",
        exactDuplicate: false,
        sameCardAsPrevious: Boolean(lookup.bestMatch?.id && lookup.bestMatch.id === previousCardId),
        contextUsed: followUp.contextUsed,
        context: transition.effective,
        focusedResponseType: focusedResponse?.type,
        focusedResponseText: focusedResponse?.text
      };
    },
    snapshot(timestamp: number) {
      return networking.getSnapshot(timestamp);
    },
    clear() {
      conversation.clear();
      networking.clear();
      duplicates.clear();
      requestSequence = 0;
      lastCardId = undefined;
    }
  };
}

test("TCP/IP context survives noise and qualifies a short level-count follow-up", () => {
  const harness = createNetworkingPipelineHarness();
  const overview = harness.process("Расскажи о модели TCP/IP.", 1_000);
  const noise = harness.process("Сколько уровней тест?", 2_000);
  const incomplete = harness.process("Сколько у?", 3_000);
  const followUp = harness.process("Сколько уровней?", 4_000);

  assert.equal(overview.cardId, "network-tcp-ip-model");
  assert.equal(noise.rendered, false);
  assert.equal(incomplete.action, "incomplete");
  assert.equal(followUp.action, "answer");
  assert.equal(followUp.cardId, "network-tcp-ip-model");
  assert.equal(followUp.contextUsed, true);
  assert.equal(followUp.focusedResponseType, "tcp_ip_level_count");
  assert.match(followUp.focusedResponseText ?? "", /4 уровня/);
});

test("OSI context qualifies a short question and provides the seven-layer fact", () => {
  const harness = createNetworkingPipelineHarness();
  assert.equal(harness.process("Расскажи о модели OSI.", 1_000).cardId, "network-osi-model");
  const followUp = harness.process("Сколько уровней?", 2_000);

  assert.equal(followUp.cardId, "network-osi-model");
  assert.equal(followUp.context.subtopic, "osi_model");
  assert.equal(followUp.focusedResponseType, "osi_level_count");
  assert.match(followUp.focusedResponseText ?? "", /7 уровней/);
});

test("focused protocol follow-ups produce three distinct protocol-layer answers", () => {
  const harness = createNetworkingPipelineHarness();
  const tcp = harness.process("На каком уровне работает TCP?", 1_000);
  const ip = harness.process("А IP?", 2_000);
  const dns = harness.process("А DNS?", 3_000);

  for (const result of [tcp, ip, dns]) {
    assert.equal(result.action, "answer");
    assert.equal(result.state, "listening");
    assert.equal(result.focusedResponseType, "protocol_layer");
  }
  assert.match(tcp.focusedResponseText ?? "", /транспортном/);
  assert.match(ip.focusedResponseText ?? "", /сетевом/);
  assert.match(dns.focusedResponseText ?? "", /прикладного/);
  assert.equal(new Set([tcp.requestId, ip.requestId, dns.requestId]).size, 3);
});

test("explicit OSI question overrides TCP/IP context after malformed fragments", () => {
  const harness = createNetworkingPipelineHarness();
  harness.process("Расскажи о модели TCP/IP.", 1_000);
  harness.process("随机外语噪声", 2_000);
  harness.process("На каком...", 3_000);
  const osi = harness.process("Сколько уровней OSI?", 4_000);

  assert.equal(osi.action, "answer");
  assert.equal(osi.cardId, "network-osi-model");
  assert.equal(osi.context.subtopic, "osi_model");
  assert.equal(osi.context.focusedEntity, "OSI");
});

test("exact duplicates are blocked while distinct same-card questions render", () => {
  const harness = createNetworkingPipelineHarness();
  const first = harness.process("Расскажи о модели TCP/IP.", 1_000);
  const distinct = harness.process("Сколько уровней TCP/IP?", 2_000);
  const duplicate = harness.process("Сколько уровней TCP/IP?", 3_000);

  assert.equal(first.rendered, true);
  assert.equal(distinct.rendered, true);
  assert.equal(distinct.sameCardAsPrevious, true);
  assert.equal(duplicate.action, "duplicate");
  assert.equal(duplicate.exactDuplicate, true);
  assert.equal(duplicate.state, "listening");
});

test("real five-question networking session renders every accepted request", () => {
  const harness = createNetworkingPipelineHarness();
  const sequence = [
    ["На каком уровне находится TCP/IP протокол?", "network-tcp-ip-model", "tcp_ip_suite_layers"],
    ["Что такое IP-протокол?", "network-protocol-layers", "ip_protocol_definition"],
    ["Расскажи про модель OSI.", "network-osi-model", undefined],
    ["Сколько уровней OSI?", "network-osi-model", "osi_level_count"],
    ["На каком уровне протоколов TCP/IP?", "network-tcp-ip-model", "tcp_ip_suite_layers"]
  ] as const;

  const results = sequence.map(([query], index) => harness.process(query, 1_000 + index * 1_000));
  assert.deepEqual(results.map((result) => result.action), sequence.map(() => "answer"));
  assert.deepEqual(results.map((result) => result.cardId), sequence.map(([, cardId]) => cardId));
  assert.deepEqual(results.map((result) => result.focusedResponseType), sequence.map(([, , response]) => response));
  assert.deepEqual(results.map((result) => result.rendered), sequence.map(() => true));
  assert.deepEqual(results.map((result) => result.state), sequence.map(() => "listening"));
  assert.equal(new Set(results.map((result) => result.requestId)).size, sequence.length);
  assert.equal(results[3].sameCardAsPrevious, true);
  assert.equal(results[4].sameCardAsPrevious, false);
});

test("networking context expires, noise does not refresh it, and Clear resets it", () => {
  const harness = createNetworkingPipelineHarness(1_000);
  harness.process("Расскажи о модели TCP/IP.", 1_000);
  harness.process("Сколько уровней тест?", 1_700);
  assert.equal(harness.snapshot(1_999).subtopic, "tcp_ip_model");
  assert.equal(harness.snapshot(2_001).broadTopic, null);
  assert.notEqual(harness.process("Сколько уровней?", 2_100).action, "answer");

  harness.process("Сколько уровней OSI?", 3_000);
  harness.clear();
  assert.deepEqual(harness.snapshot(3_001), { broadTopic: null });
});

test("generic short networking wording stays unmatched without valid context", () => {
  const harness = createNetworkingPipelineHarness();
  for (const phrase of ["Сколько уровней?", "На каком уровне работает?", "А он?"]) {
    assert.notEqual(harness.process(phrase, 1_000).action, "answer", phrase);
  }
});
