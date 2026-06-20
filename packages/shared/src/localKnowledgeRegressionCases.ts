import type { KnowledgeCard } from "./knowledgeCards.js";

export interface LocalKnowledgeRegressionCase {
  query: string;
  expectedCardId?: string;
  expectedCategory?: KnowledgeCard["category"];
  expectedCommandFragment?: string;
}

export const localKnowledgeRegressionCases: LocalKnowledgeRegressionCase[] = [
  { query: "Как проверить порты в Linux?", expectedCardId: "linux-open-ports", expectedCommandFragment: "ss -lntup" },
  { query: "Как посмотреть открытые порты?", expectedCardId: "linux-open-ports", expectedCommandFragment: "ss -lntup" },
  { query: "Как дать права в Linux?", expectedCardId: "linux-permissions-overview", expectedCommandFragment: "chmod" },
  { query: "Как добавить пользователю sudo?", expectedCardId: "linux-add-user-sudo", expectedCommandFragment: "usermod -aG sudo" },
  { query: "Как добавить пользователя в sudo?", expectedCardId: "linux-add-user-sudo", expectedCommandFragment: "usermod -aG sudo" },
  { query: "Как проверить безопасность Linux?", expectedCardId: "linux-security-quick-check", expectedCommandFragment: "ss -lntup" },

  { query: "Что такое Docker?", expectedCardId: "docker-overview", expectedCommandFragment: "docker info" },
  { query: "Из чего состоит Docker?", expectedCardId: "docker-overview", expectedCommandFragment: "docker info" },
  { query: "Что такое Dockerfile?", expectedCardId: "dockerfile", expectedCommandFragment: "docker build" },
  { query: "Из чего состоит Dockerfile?", expectedCardId: "dockerfile", expectedCommandFragment: "docker build" },
  { query: "Что такое слой Docker?", expectedCardId: "docker-image-layers", expectedCommandFragment: "docker history" },
  { query: "Что такое слой докера?", expectedCardId: "docker-image-layers", expectedCommandFragment: "docker history" },
  { query: "Как посмотреть логи контейнера?", expectedCardId: "docker-logs-follow", expectedCommandFragment: "docker logs" },

  { query: "Что такое Kubernetes?", expectedCardId: "kubernetes-overview", expectedCommandFragment: "kubectl cluster-info" },
  { query: "Из чего состоит Kubernetes?", expectedCardId: "kubernetes-overview", expectedCommandFragment: "kubectl cluster-info" },
  { query: "Какие основные команды Kubernetes?", expectedCardId: "kubernetes-basic-commands", expectedCommandFragment: "kubectl get pods" },
  { query: "Как перезапустить deployment?", expectedCardId: "kubectl-rollout-restart", expectedCommandFragment: "kubectl rollout restart" },
  { query: "Как посмотреть логи pod?", expectedCardId: "kubectl-logs", expectedCommandFragment: "kubectl logs" },

  { query: "Как посмотреть ветки Git?", expectedCardId: "git-branch", expectedCommandFragment: "git branch" },
  { query: "Как отменить последний commit?", expectedCategory: "git" },
  { query: "Что такое pull request?", expectedCategory: "git" },

  { query: "Как добавить пользователя в Active Directory?", expectedCardId: "active-directory-create-user", expectedCommandFragment: "New-ADUser" },
  { query: "Как создать пользователя в AD?", expectedCardId: "active-directory-create-user", expectedCommandFragment: "New-ADUser" },
  { query: "Что такое Active Directory?", expectedCardId: "active-directory", expectedCommandFragment: "Get-ADDomain" },
  { query: "Как добавить пользователя в группу Active Directory?", expectedCardId: "active-directory-add-user-to-group", expectedCommandFragment: "Add-ADGroupMember" },
  { query: "Как проверить пользователя AD?", expectedCardId: "ad-user-lookup", expectedCommandFragment: "Get-ADUser" },
  { query: "Как обновить групповые политики?", expectedCardId: "ad-gpupdate", expectedCommandFragment: "gpupdate" },

  { query: "Что такое NAT?", expectedCardId: "network-nat" },
  { query: "Как проверить DNS?", expectedCardId: "network-dns-tools", expectedCommandFragment: "nslookup" },
  { query: "Как проверить доступность порта?", expectedCardId: "network-tcp-port", expectedCommandFragment: "Test-NetConnection" }
];

export const localKnowledgeNegativeRegressionCases = [
  "Как приготовить чай?",
  "Из чего состоит дом?",
  "Как выбрать подарок?",
  "как добавить пользователя на сайт",
  "как создать пользователя в приложении"
];
