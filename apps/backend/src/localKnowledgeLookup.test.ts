import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConversationContextBuffer,
  lookupLocalKnowledge,
  normalizeTechnicalTerms,
  resolveLiveAssistDecision
} from "@voiceassistant/shared";

const basicQuestions = [
  ["Как проверить порты в Linux?", "linux-open-ports"],
  ["Как проверить порт в Linux?", "linux-open-ports"],
  ["Из чего состоит Docker?", "docker-overview"],
  ["Что такое Docker?", "docker-overview"],
  ["Из чего состоит Kubernetes?", "kubernetes-overview"],
  ["Что такое Kubernetes?", "kubernetes-overview"]
] as const;

test("production local lookup matches six basic supported questions", () => {
  for (const [query, expectedCardId] of basicQuestions) {
    const result = lookupLocalKnowledge(query);
    assert.equal(result.bestMatch?.id, expectedCardId, query);
    assert.equal(result.matches[0]?.id, expectedCardId, query);
    assert.ok(result.normalizedQuery.length > 0, query);
  }
});

test("production local lookup handles Linux port inflections and common overview wording", () => {
  for (const query of [
    "Какие порты открыты в Linux?",
    "Посмотреть открытые порты"
  ]) {
    assert.equal(lookupLocalKnowledge(query).bestMatch?.id, "linux-open-ports", query);
  }

  assert.equal(lookupLocalKnowledge("Основные компоненты Docker").bestMatch?.id, "docker-overview");
  assert.equal(lookupLocalKnowledge("Основные компоненты Kubernetes").bestMatch?.id, "kubernetes-overview");
});

test("new Docker question overrides previous Kubernetes context", () => {
  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Kubernetes", 1_000);
  const contextDecision = context.add("Что такое Docker?", 2_000);
  const result = lookupLocalKnowledge("Что такое Docker?", {
    aggregatedText: `Давайте поговорим о Kubernetes. ${contextDecision.aggregatedText}`,
    currentTopic: "Kubernetes"
  });

  assert.equal(result.bestMatch?.id, "docker-overview");
  assert.equal(result.querySource, "newest_fragment");
  assert.equal(result.topicContextAdded, false);
});

test("unrelated phrases stay unmatched and expose conservative diagnostics", () => {
  for (const query of ["из чего состоит дом", "порт вина", "докер без technical context"]) {
    const result = lookupLocalKnowledge(query);
    assert.equal(result.bestMatch, undefined, query);
    assert.deepEqual(result.matches, [], query);
    assert.ok(result.debugCandidates.length <= 5, query);
    assert.ok(result.debugCandidates.every((candidate) => candidate.score < result.scoreThreshold), query);
  }
});

test("Manual and Live production lookup return the same card for normalized text", () => {
  for (const [query, expectedCardId] of basicQuestions) {
    const contextDecision = new ConversationContextBuffer().add(query, 1_000, "balanced");
    const manualResult = lookupLocalKnowledge(query);
    const liveResult = lookupLocalKnowledge(query, {
      aggregatedText: contextDecision.aggregatedText,
      currentTopic: contextDecision.currentTopic
    });
    const policy = resolveLiveAssistDecision({
      contextDecision,
      answerSourceMode: "local-only",
      hasLocalMatch: liveResult.matches.length > 0,
      hasApiKey: false,
      answerMode: "short"
    });

    assert.equal(manualResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, manualResult.bestMatch?.id, query);
    assert.equal(policy.action, "answer", query);
    assert.equal(policy.sourceResolution, "local", query);
  }
});

test("Manual and Live lookup agree for natural sudo and Docker layer phrases", () => {
  const cases = [
    ["Как добавить пользователя в sudo?", "linux-add-user-sudo"],
    ["Что такое слой докера?", "docker-image-layers"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    const normalizedText = normalizeTechnicalTerms(query).text;
    const contextDecision = new ConversationContextBuffer().add(normalizedText, 1_000, "balanced");
    const manualResult = lookupLocalKnowledge(normalizedText);
    const liveResult = lookupLocalKnowledge(normalizedText, {
      aggregatedText: contextDecision.aggregatedText,
      currentTopic: contextDecision.currentTopic
    });

    assert.equal(manualResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, manualResult.bestMatch?.id, query);
  }
});

test("Manual and Live lookup agree on focused Active Directory user actions", () => {
  const cases = [
    ["Как добавить пользователя в Active Directory?", "active-directory-create-user"],
    ["Как создать пользователя в AD?", "active-directory-create-user"],
    ["Как проверить пользователя Active Directory?", "ad-user-lookup"],
    ["Как добавить пользователя в группу Active Directory?", "active-directory-add-user-to-group"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    const contextDecision = new ConversationContextBuffer().add(query, 1_000, "balanced");
    const manualResult = lookupLocalKnowledge(query);
    const liveResult = lookupLocalKnowledge(query, {
      aggregatedText: contextDecision.aggregatedText,
      currentTopic: contextDecision.currentTopic
    });
    assert.equal(manualResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, manualResult.bestMatch?.id, query);
  }
});

test("Manual and Live lookup agree on Linux privilege, permission, and password actions", () => {
  const cases = [
    ["Как повысить права пользователя в Linux?", "linux-add-user-sudo"],
    ["Как повысить привилегии пользователя?", "linux-add-user-sudo"],
    ["Как дать пользователю административные права?", "linux-add-user-sudo"],
    ["Как сделать пользователя sudo?", "linux-add-user-sudo"],
    ["Как добавить пользователя в sudo?", "linux-add-user-sudo"],
    ["Как добавить пользователя в wheel?", "linux-add-user-sudo"],
    ["Как дать пользователю root-права?", "linux-add-user-sudo"],
    ["Как дать пользователю права администратора в Linux?", "linux-add-user-sudo"],
    ["Как повысить права файлов?", "linux-file-directory-permissions"],
    ["Как повысить права файла?", "linux-file-directory-permissions"],
    ["Как повысить права файлов в Linux?", "linux-file-directory-permissions"],
    ["Как изменить права файла?", "linux-file-directory-permissions"],
    ["Как изменить права директории?", "linux-file-directory-permissions"],
    ["Как повысить права директории?", "linux-file-directory-permissions"],
    ["Как дать права на папку?", "linux-file-directory-permissions"],
    ["Как дать права на файл?", "linux-file-directory-permissions"],
    ["Как сделать файл исполняемым?", "linux-chmod"],
    ["Как изменить владельца файла?", "linux-file-directory-permissions"],
    ["Как поменять пароль в Linux?", "linux-change-password"],
    ["Как изменить пароль пользователя?", "linux-change-password"],
    ["Как сменить пароль Linux?", "linux-change-password"],
    ["Как поменять пароль пользователю?", "linux-change-password"],
    ["passwd", "linux-change-password"],
    ["сбросить пароль пользователя Linux", "linux-change-password"],
    ["сменить пароль root", "linux-change-password"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    const contextDecision = new ConversationContextBuffer().add(query, 1_000, "balanced");
    const manualResult = lookupLocalKnowledge(query);
    const liveResult = lookupLocalKnowledge(query, {
      aggregatedText: contextDecision.aggregatedText,
      currentTopic: contextDecision.currentTopic
    });
    const policy = resolveLiveAssistDecision({
      contextDecision,
      answerSourceMode: "local-only",
      hasLocalMatch: liveResult.matches.length > 0,
      hasApiKey: false,
      answerMode: "short"
    });

    assert.equal(manualResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, manualResult.bestMatch?.id, query);
    assert.equal(policy.action, "answer", query);
  }
});

test("Manual and Live lookup agree on explicit SELinux and firewall requests", () => {
  const cases = [
    ["Как отключить SELinux?", "linux-selinux-troubleshooting"],
    ["Как проверить SELinux?", "linux-selinux-troubleshooting"],
    ["Как отключить фаервол в Linux?", "linux-firewall-control"],
    ["Как открыть порт в firewalld?", "linux-firewall-control"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    const contextDecision = new ConversationContextBuffer().add(query, 1_000, "balanced");
    const manualResult = lookupLocalKnowledge(query);
    const liveResult = lookupLocalKnowledge(query, {
      aggregatedText: contextDecision.aggregatedText,
      currentTopic: contextDecision.currentTopic
    });
    assert.equal(manualResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, expectedCardId, query);
    assert.equal(liveResult.bestMatch?.id, manualResult.bestMatch?.id, query);
  }
});

test("ambiguous security disabling requires Linux context and stays non-destructive", () => {
  assert.equal(lookupLocalKnowledge("Отключить безопасность").bestMatch, undefined);

  const context = new ConversationContextBuffer();
  context.add("Давайте поговорим о Linux", 1_000, "balanced");
  const decision = context.add("Отключить безопасность", 2_000, "balanced");
  const contextual = lookupLocalKnowledge("Отключить безопасность", {
    aggregatedText: decision.aggregatedText,
    currentTopic: decision.currentTopic
  });

  assert.equal(decision.intent, "answer_request");
  assert.equal(contextual.bestMatch?.id, "linux-security-disable-guidance");
  assert.equal(contextual.bestMatch?.commands.includes("sudo systemctl disable --now firewalld"), false);
});

test("security disabling negatives remain unmatched", () => {
  for (const query of [
    "отключить безопасность браузера",
    "отключить безопасность телефона",
    "как отключить сигнализацию",
    "отключить защиту аккаунта",
    "выключить антивирус windows"
  ]) {
    assert.equal(lookupLocalKnowledge(query).bestMatch, undefined, query);
  }
});

test("port opening stays distinct from TCP port checking", () => {
  assert.equal(lookupLocalKnowledge("Как открыть порт 8080?").bestMatch?.id, "network-open-port");
  assert.equal(lookupLocalKnowledge("Как открыть порт 8080 в фаерволе?").bestMatch?.id, "network-open-port");
  assert.equal(lookupLocalKnowledge("Как проверить порт 8080?").bestMatch?.id, "network-tcp-port");
});

test("Manual and Live lookup agree on complete Networking Core questions", () => {
  const cases = [
    ["Как открыть порт 8080?", "network-open-port"],
    ["На каком уровне работает TCP?", "network-tcp-ip-model"],
    ["Сколько уровней OSI?", "network-osi-model"],
    ["Сетевые схемы", "network-topologies"],
    ["На каком уровне работает DNS?", "network-protocol-layers"]
  ] as const;

  for (const [rawQuery, expectedCardId] of cases) {
    const query = normalizeTechnicalTerms(rawQuery).text;
    const decision = new ConversationContextBuffer().add(query, 1_000, "balanced");
    const manual = lookupLocalKnowledge(query);
    const live = lookupLocalKnowledge(query, {
      aggregatedText: decision.aggregatedText,
      currentTopic: decision.currentTopic
    });
    assert.equal(manual.bestMatch?.id, expectedCardId, rawQuery);
    assert.equal(live.bestMatch?.id, expectedCardId, rawQuery);
  }
});

test("Networking context qualifies short OSI and TCP/IP follow-ups", () => {
  const osiContext = new ConversationContextBuffer();
  osiContext.add("Модель OSI", 1_000, "balanced");
  const osiCount = osiContext.add("Сколько уровней?", 2_000, "balanced");
  const osiResult = lookupLocalKnowledge("Сколько уровней?", {
    aggregatedText: osiCount.aggregatedText,
    currentTopic: osiCount.currentTopic
  });
  assert.equal(osiResult.bestMatch?.id, "network-osi-model");

  const tcpContext = new ConversationContextBuffer();
  tcpContext.add("Модель TCP/IP", 1_000, "balanced");
  const tcpCount = tcpContext.add("Сколько уровней?", 2_000, "balanced");
  const tcpResult = lookupLocalKnowledge("Сколько уровней?", {
    aggregatedText: tcpCount.aggregatedText,
    currentTopic: tcpCount.currentTopic
  });
  assert.equal(tcpResult.bestMatch?.id, "network-tcp-ip-model");

  const ipFollowUp = tcpContext.add("А IP?", 3_000, "balanced");
  const ipResult = lookupLocalKnowledge("А IP?", {
    aggregatedText: ipFollowUp.aggregatedText,
    currentTopic: ipFollowUp.currentTopic
  });
  assert.equal(ipResult.bestMatch?.id, "network-protocol-layers");

  assert.equal(lookupLocalKnowledge("Сколько уровней?").bestMatch, undefined);
});

test("Networking Core negative phrases remain unmatched", () => {
  for (const rawQuery of [
    "открыть портвейн",
    "уровни в игре",
    "схема квартиры",
    "что такое OCI в Oracle Cloud",
    "сколько уровней в здании"
  ]) {
    const query = normalizeTechnicalTerms(rawQuery).text;
    assert.equal(lookupLocalKnowledge(query).bestMatch, undefined, rawQuery);
  }
});
