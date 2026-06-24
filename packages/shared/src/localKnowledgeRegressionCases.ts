import type { KnowledgeCard } from "./knowledgeCards.js";
import type { TechnicalTopic } from "./conversationContext.js";

export interface LocalKnowledgeRegressionCase {
  query: string;
  expectedCardId?: string;
  expectedCategory?: KnowledgeCard["category"];
  expectedCommandFragment?: string;
  currentTopic?: TechnicalTopic;
  aggregatedText?: string;
}

export const localKnowledgeRegressionCases: LocalKnowledgeRegressionCase[] = [
  { query: "Как проверить порты в Linux?", expectedCardId: "linux-open-ports", expectedCommandFragment: "ss -lntup" },
  { query: "Как посмотреть открытые порты?", expectedCardId: "linux-open-ports", expectedCommandFragment: "ss -lntup" },
  { query: "Как дать права в Linux?", expectedCardId: "linux-permissions-overview", expectedCommandFragment: "chmod" },
  { query: "Как добавить пользователю sudo?", expectedCardId: "linux-add-user-sudo", expectedCommandFragment: "usermod -aG sudo" },
  { query: "Как добавить пользователя в sudo?", expectedCardId: "linux-add-user-sudo", expectedCommandFragment: "usermod -aG sudo" },
  { query: "Как повысить права пользователя в Linux?", expectedCardId: "linux-add-user-sudo", expectedCommandFragment: "usermod -aG sudo" },
  { query: "Как повысить права файлов в Linux?", expectedCardId: "linux-file-directory-permissions", expectedCommandFragment: "chmod 640" },
  { query: "Как повысить права директории?", expectedCardId: "linux-file-directory-permissions", expectedCommandFragment: "chmod 750" },
  { query: "Как поменять пароль в Linux?", expectedCardId: "linux-change-password", expectedCommandFragment: "sudo passwd USER" },
  { query: "Как проверить безопасность Linux?", expectedCardId: "linux-security-quick-check", expectedCommandFragment: "ss -lntup" },
  { query: "Как отключить SELinux?", expectedCardId: "linux-selinux-troubleshooting", expectedCommandFragment: "setenforce 0" },
  { query: "Как проверить SELinux?", expectedCardId: "linux-selinux-troubleshooting", expectedCommandFragment: "getenforce" },
  { query: "Как отключить фаервол в Linux?", expectedCardId: "linux-firewall-control", expectedCommandFragment: "systemctl stop firewalld" },
  { query: "Как открыть порт в firewalld?", expectedCardId: "linux-firewall-control", expectedCommandFragment: "--add-port=8080/tcp" },
  { query: "Отключить безопасность в Linux", expectedCardId: "linux-security-disable-guidance", expectedCommandFragment: "getenforce", currentTopic: "Linux" },

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
  { query: "Как проверить доступность порта?", expectedCardId: "network-tcp-port", expectedCommandFragment: "Test-NetConnection" },
  { query: "Как открыть порт 8080?", expectedCardId: "network-open-port", expectedCommandFragment: "firewall-cmd --permanent" },
  { query: "Как открыть порт 8080 в фаерволе?", expectedCardId: "network-open-port", expectedCommandFragment: "ufw allow 8080" },
  { query: "На каком уровне работает TCP?", expectedCardId: "network-tcp-ip-model" },
  { query: "Сколько уровней TCP/IP?", expectedCardId: "network-tcp-ip-model" },
  { query: "Сколько уровней OSI?", expectedCardId: "network-osi-model" },
  { query: "Сетевые схемы", expectedCardId: "network-topologies" },
  { query: "Схема OCI", expectedCardId: "network-osi-model", currentTopic: "Networking", aggregatedText: "Обсудим модель OSI" },
  { query: "На каком уровне работает DNS?", expectedCardId: "network-protocol-layers" }
];

export const localKnowledgeNegativeRegressionCases = [
  "Как приготовить чай?",
  "Из чего состоит дом?",
  "Как выбрать подарок?",
  "как добавить пользователя на сайт",
  "как создать пользователя в приложении",
  "как повысить зарплату",
  "как повысить громкость",
  "как поменять пароль на сайте",
  "как изменить права человека",
  "как дать права персонажу в игре",
  "отключить безопасность браузера",
  "отключить безопасность телефона",
  "как отключить сигнализацию",
  "отключить защиту аккаунта",
  "выключить антивирус windows",
  "открыть портвейн",
  "уровни в игре",
  "схема квартиры",
  "что такое OCI в Oracle Cloud",
  "сколько уровней в здании"
];
