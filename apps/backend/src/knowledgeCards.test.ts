import assert from "node:assert/strict";
import { test } from "node:test";
import { findKnowledgeCards } from "@voiceassistant/shared";

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
