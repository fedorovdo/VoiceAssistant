import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationContextBuffer, detectTechnicalTopic, normalizeTechnicalTerms } from "@voiceassistant/shared";

test("normalizeTechnicalTerms restores common Kubernetes STT distortions", () => {
  assert.equal(
    normalizeTechnicalTerms("Давайте поговорим про Кубернетес").text,
    "Давайте поговорим про Kubernetes"
  );
  assert.equal(normalizeTechnicalTerms("Что делает Шидуле").text, "Что делает scheduler");
  assert.equal(normalizeTechnicalTerms("Команды кубси тейл").text, "Команды kubectl");
});

test("normalizeTechnicalTerms restores Docker image wording", () => {
  const result = normalizeTechnicalTerms("Что такое докер образ");
  assert.equal(result.text, "Что такое Docker image");
  assert.deepEqual(result.replacements.map((replacement) => replacement.to), ["Docker image"]);
});

test("normalizeTechnicalTerms restores Dockerfile variants and repairs STT phrases", () => {
  for (const variant of [
    "докер файл",
    "докерфайл",
    "docker файл",
    "docker-файл",
    "docker file",
    "docker-файле",
    "докер файле",
    "докер-файле"
  ]) {
    assert.equal(normalizeTechnicalTerms(variant).text, "Dockerfile");
  }

  assert.equal(normalizeTechnicalTerms("Что стоит Docker-файл?").text, "что такое Dockerfile?");
  assert.equal(normalizeTechnicalTerms("Что состоит Docker-файл?").text, "из чего состоит Dockerfile?");
  assert.equal(normalizeTechnicalTerms("Что в Docker-файле?").text, "из чего состоит Dockerfile?");
  assert.equal(normalizeTechnicalTerms("Из чего Dockerfile?").text, "из чего состоит Dockerfile?");
  assert.equal(normalizeTechnicalTerms("что стоит стол").text, "что стоит стол");
});

test("normalizeTechnicalTerms restores Linux command wording", () => {
  assert.equal(
    normalizeTechnicalTerms("как посмотреть журнал контрол сервиса").text,
    "как посмотреть journalctl сервиса"
  );
});

test("normalizeTechnicalTerms restores Active Directory commands", () => {
  assert.equal(normalizeTechnicalTerms("джипи апдейт").text, "gpupdate");
  assert.equal(normalizeTechnicalTerms("ди си диаг").text, "dcdiag");
});

test("normalizeTechnicalTerms keeps ordinary Russian phrases intact", () => {
  const phrase = "Мы сидели под деревом и обсуждали композицию картины";
  const result = normalizeTechnicalTerms(phrase);
  assert.equal(result.text, phrase);
  assert.deepEqual(result.replacements, []);
});

test("normalizeTechnicalTerms only maps ambiguous cybernetics wording with Kubernetes context", () => {
  assert.equal(normalizeTechnicalTerms("лекция про кибернетику").text, "лекция про кибернетику");
  assert.equal(
    normalizeTechnicalTerms("кубернетика кластера и сервисы").text,
    "Kubernetes кластера и сервисы"
  );
});

test("normalized terms improve topic detection and Live Assist intent", () => {
  const kubernetesText = normalizeTechnicalTerms("Давайте поговорим про Кубернетес").text;
  assert.equal(detectTechnicalTopic(kubernetesText).currentTopic, "Kubernetes");

  const context = new ConversationContextBuffer();
  const schedulerQuestion = context.add(normalizeTechnicalTerms("Что делает Шидуле").text, 1_000);
  assert.equal(schedulerQuestion.currentTopic, "Kubernetes");
  assert.equal(schedulerQuestion.shouldAnswer, true);
});
