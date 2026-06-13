import assert from "node:assert/strict";
import { test } from "node:test";
import { findKnowledgeCards, knowledgeCards } from "@voiceassistant/shared";

test("knowledgeCards keeps a valid unique offline catalog", () => {
  assert.ok(knowledgeCards.length >= 150);
  assert.equal(new Set(knowledgeCards.map((card) => card.id)).size, knowledgeCards.length);
  for (const card of knowledgeCards) {
    assert.ok(card.title.length > 0);
    assert.ok(card.aliases.length > 0);
    assert.ok(card.shortExplanation.length > 0);
    assert.ok(card.bullets.length > 0);
  }
});

test("findKnowledgeCards matches Russian and English command queries", () => {
  assert.equal(findKnowledgeCards("Как проверить открытые порты в Linux?")[0]?.id, "linux-open-ports");
  assert.equal(findKnowledgeCards("Show me kubectl get pods")[0]?.id, "kubectl-get-pods");
  assert.equal(findKnowledgeCards("команда ss")[0]?.id, "linux-ss");
});

test("findKnowledgeCards prioritizes specific service and compose commands", () => {
  assert.equal(findKnowledgeCards("как посмотреть логи сервиса")[0]?.id, "linux-journalctl-service");
  assert.equal(findKnowledgeCards("docker compose logs api")[0]?.id, "docker-compose-logs");
  assert.equal(findKnowledgeCards("kubectl logs my-pod")[0]?.id, "kubectl-logs");
});

test("findKnowledgeCards covers practical admin commands", () => {
  assert.equal(findKnowledgeCards("как найти большие файлы linux")[0]?.id, "linux-find-large-files");
  assert.equal(findKnowledgeCards("kubectl rollout restart deployment")[0]?.id, "kubectl-rollout-restart");
  assert.equal(findKnowledgeCards("проверить репликацию ad")[0]?.id, "ad-repadmin");
  assert.equal(findKnowledgeCards("проверить порт telnet")[0]?.id, "network-telnet-port");
});

test("findKnowledgeCards matches user-confirmed Linux command phrases", () => {
  assert.equal(findKnowledgeCards("Команда Linux посмотреть место на диске.")[0]?.id, "linux-df");
  assert.equal(findKnowledgeCards("Команда Linux задать права на исполнение.")[0]?.id, "linux-chmod");
  assert.equal(findKnowledgeCards("Права на исполнение файла командной строки.")[0]?.id, "linux-chmod");
  assert.equal(findKnowledgeCards("chmod +x script.sh")[0]?.id, "linux-chmod");
  assert.equal(findKnowledgeCards("chown")[0]?.id, "linux-chown");
});

test("findKnowledgeCards returns the most relevant related cards", () => {
  const results = findKnowledgeCards("Чем Kubernetes service отличается от ingress?");
  assert.deepEqual(results.map((card) => card.id), ["kubernetes-service", "kubernetes-ingress"]);
});

test("findKnowledgeCards avoids ambiguous short words without context", () => {
  assert.deepEqual(findKnowledgeCards("pod"), []);
  assert.deepEqual(findKnowledgeCards("free"), []);
  assert.deepEqual(findKnowledgeCards("service"), []);
  assert.deepEqual(findKnowledgeCards("log"), []);
  assert.equal(findKnowledgeCards("Что такое pod в Kubernetes?")[0]?.id, "kubernetes-pod");
});

test("findKnowledgeCards returns at most two cards", () => {
  assert.ok(findKnowledgeCards("DNS DHCP NAT nslookup dig").length <= 2);
});

test("findKnowledgeCards covers expanded offline troubleshooting phrases", () => {
  assert.equal(findKnowledgeCards("как проверить свободное место")[0]?.id, "linux-df");
  assert.equal(findKnowledgeCards("как посмотреть логи контейнера")[0]?.id, "docker-logs-follow");
  assert.equal(findKnowledgeCards("как зайти в контейнер")[0]?.id, "docker-exec");
  assert.equal(findKnowledgeCards("docker compose logs api")[0]?.id, "docker-compose-logs");
  assert.equal(findKnowledgeCards("kubectl logs api-7f9d")[0]?.id, "kubectl-logs");
  assert.equal(findKnowledgeCards("pod CrashLoopBackOff после запуска")[0]?.id, "kubernetes-crashloopbackoff");
});

test("findKnowledgeCards covers DNS, AD, and Proxmox diagnostics", () => {
  assert.equal(findKnowledgeCards("dns не работает на сервере")[0]?.id, "network-dns-troubleshooting");
  assert.equal(findKnowledgeCards("как обновить групповые политики")[0]?.id, "ad-gpupdate");
  assert.equal(findKnowledgeCards("dcdiag проверить контроллер домена")[0]?.id, "ad-dcdiag");
  assert.equal(findKnowledgeCards("как проверить репликацию ad")[0]?.id, "ad-repadmin");
  assert.equal(findKnowledgeCards("как проверить fsmo")[0]?.id, "ad-fsmo");
  assert.equal(findKnowledgeCards("как посмотреть хранилища proxmox")[0]?.id, "proxmox-storage-status");
  assert.equal(findKnowledgeCards("pvesm status")[0]?.id, "proxmox-storage-status");
});

test("findKnowledgeCards keeps new generic words conservative", () => {
  assert.deepEqual(findKnowledgeCards("group"), []);
  assert.deepEqual(findKnowledgeCards("pod"), []);
  assert.deepEqual(findKnowledgeCards("container"), []);
  assert.deepEqual(findKnowledgeCards("port"), []);
});
