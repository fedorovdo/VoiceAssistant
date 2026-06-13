import assert from "node:assert/strict";
import { test } from "node:test";
import { findKnowledgeCards } from "@voiceassistant/shared";

test("findKnowledgeCards matches Russian and English command queries", () => {
    assert.equal(findKnowledgeCards("Как проверить открытые порты в Linux?")[0]?.id, "linux-open-ports");
  assert.equal(findKnowledgeCards("Show me kubectl get pods")[0]?.id, "kubectl-get-pods");
});

test("findKnowledgeCards returns the most relevant related cards", () => {
  const results = findKnowledgeCards("Чем Kubernetes service отличается от ingress?");
  assert.deepEqual(results.slice(0, 2).map((card) => card.id), ["kubernetes-service", "kubernetes-ingress"]);
});

test("findKnowledgeCards avoids ambiguous short words without context", () => {
  assert.deepEqual(findKnowledgeCards("pod"), []);
  assert.deepEqual(findKnowledgeCards("free"), []);
  assert.equal(findKnowledgeCards("Что такое pod в Kubernetes?")[0]?.id, "kubernetes-pod");
});

test("findKnowledgeCards returns at most three cards", () => {
  assert.ok(findKnowledgeCards("DNS DHCP NAT nslookup dig").length <= 3);
});
