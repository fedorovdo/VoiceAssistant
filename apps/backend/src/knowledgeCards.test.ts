import assert from "node:assert/strict";
import { test } from "node:test";
import { findKnowledgeCards, knowledgeCards, lookupLocalKnowledge } from "@voiceassistant/shared";

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
  assert.equal(findKnowledgeCards("Перечислите основные команды Kubernetes")[0]?.id, "kubernetes-basic-commands");
  assert.equal(findKnowledgeCards("команды kubectl")[0]?.id, "kubernetes-basic-commands");
  assert.equal(findKnowledgeCards("как посмотреть логи pod")[0]?.id, "kubectl-logs");
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

test("findKnowledgeCards covers Kubernetes command overview and restart requests", () => {
  assert.equal(findKnowledgeCards("Какие основные команды вы знаете Kubernetes?")[0]?.id, "kubernetes-basic-commands");
  assert.equal(findKnowledgeCards("Как перезапустить Kubernetes?")[0]?.id, "kubectl-rollout-restart");
});

test("findKnowledgeCards covers Linux sudo, security, groups, firewall, and SSH", () => {
  assert.equal(findKnowledgeCards("Как добавить пользователю права sudo?")[0]?.id, "linux-add-user-sudo");
  assert.equal(findKnowledgeCards("Как дать sudo пользователю?")[0]?.id, "linux-add-user-sudo");
  assert.equal(findKnowledgeCards("Как добавить пользователя в sudoers?")[0]?.id, "linux-sudoers-basics");
  assert.equal(findKnowledgeCards("Чтобы не писать sudo")[0]?.id, "linux-sudo-basics");
  assert.equal(findKnowledgeCards("Как проверить безопасность в Linux?")[0]?.id, "linux-security-quick-check");
  assert.equal(findKnowledgeCards("Проверить firewall")[0]?.id, "linux-firewall-status");
  assert.equal(findKnowledgeCards("В каких группах пользователь?")[0]?.id, "linux-user-groups");
  assert.equal(findKnowledgeCards("id username")[0]?.id, "linux-user-groups");
  assert.equal(findKnowledgeCards("groups username")[0]?.id, "linux-user-groups");
  assert.equal(findKnowledgeCards("sshd status")[0]?.id, "linux-ssh-access");
});

test("findKnowledgeCards matches broad Linux permission questions conservatively", () => {
  assert.equal(findKnowledgeCards("Как дать права в Linux?")[0]?.id, "linux-permissions-overview");
  assert.equal(findKnowledgeCards("Как дать права в Линукс?")[0]?.id, "linux-permissions-overview");
  assert.equal(findKnowledgeCards("как выдать права пользователю в linux")[0]?.id, "linux-permissions-overview");
  assert.deepEqual(findKnowledgeCards("как дать подарок"), []);
  assert.deepEqual(findKnowledgeCards("как дать совет"), []);
});

test("findKnowledgeCards matches Dockerfile questions and STT distortions", () => {
  for (const phrase of [
    "Что такое Docker-файл?",
    "Из чего состоит Dockerfile?",
    "Что стоит Docker-файл?",
    "Что состоит Docker-файл?",
    "Что в Dockerfile?",
    "Что вы знаете про Dockerfile?"
  ]) {
    assert.equal(findKnowledgeCards(phrase)[0]?.id, "dockerfile", phrase);
  }

  assert.deepEqual(findKnowledgeCards("что стоит стол"), []);
});

test("production lookup covers repaired sudo, Docker, Git, AD, and port phrases", () => {
  const cases = [
    ["Как добавить пользователю sudo?", "linux-add-user-sudo"],
    ["Как дать пользователю права sudo?", "linux-add-user-sudo"],
    ["Как добавить пользователя в группу sudo?", "linux-add-user-sudo"],
    ["Что такое слой Docker?", "docker-image-layers"],
    ["Из чего состоит Docker-образ?", "docker-image-layers"],
    ["Как посмотреть слои Docker?", "docker-image-layers"],
    ["Как посмотреть ветки Git?", "git-branch"],
    ["Показать все ветки Git", "git-branch"],
    ["Как отменить последний commit?", "git-undo-last-commit"],
    ["Как откатить последний коммит?", "git-undo-last-commit"],
    ["Что такое pull request?", "git-pull-request"],
    ["Что такое пул реквест?", "git-pull-request"],
    ["Как проверить пользователя AD?", "ad-user-lookup"],
    ["Как найти пользователя Active Directory?", "ad-user-lookup"],
    ["Как проверить доступность порта?", "network-tcp-port"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    assert.equal(lookupLocalKnowledge(query).bestMatch?.id, expectedCardId, query);
  }
});

test("production lookup covers natural sudo assignment and Docker layer wording", () => {
  const cases = [
    ["Как добавить пользователя в sudo?", "linux-add-user-sudo"],
    ["Добавить пользователя в sudo", "linux-add-user-sudo"],
    ["Как добавить юзера в sudo?", "linux-add-user-sudo"],
    ["Добавить юзера в группу sudo", "linux-add-user-sudo"],
    ["Как включить пользователя в sudo?", "linux-add-user-sudo"],
    ["Как дать пользователю sudo?", "linux-add-user-sudo"],
    ["Как добавить пользователя в wheel?", "linux-add-user-sudo"],
    ["Добавить пользователя в группу wheel", "linux-add-user-sudo"],
    ["Что такое слой докера?", "docker-image-layers"],
    ["Что такое слои докера?", "docker-image-layers"],
    ["Как устроен слой докера?", "docker-image-layers"],
    ["Из чего состоит слой докера?", "docker-image-layers"],
    ["Как посмотреть слои докера?", "docker-image-layers"],
    ["Слои образа докера", "docker-image-layers"],
    ["Слой Docker-образа", "docker-image-layers"]
  ] as const;

  for (const [query, expectedCardId] of cases) {
    assert.equal(lookupLocalKnowledge(query).bestMatch?.id, expectedCardId, query);
  }
});

test("new technical aliases stay conservative for unrelated phrases", () => {
  for (const query of [
    "как добавить сахар",
    "слой пирога",
    "ветки дерева",
    "отменить встречу",
    "запрос в магазин",
    "найти пользователя сайта",
    "порт вина",
    "как добавить пользователя на сайт",
    "что такое слой пирога",
    "как добавить человека в чат"
  ]) {
    assert.equal(lookupLocalKnowledge(query).bestMatch, undefined, query);
  }
});
