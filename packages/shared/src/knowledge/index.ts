import type { KnowledgeCard, KnowledgeTopicPack } from "./types.js";
import { linuxTopicPack } from "./linux.js";
import { dockerTopicPack } from "./docker.js";
import { kubernetesTopicPack } from "./kubernetes.js";
import { networkingTopicPack } from "./networking.js";
import { activeDirectoryTopicPack } from "./activeDirectory.js";
import { gitTopicPack } from "./git.js";
import { proxmoxTopicPack } from "./proxmox.js";

export type { KnowledgeCard, KnowledgeTopicId, KnowledgeTopicPack } from "./types.js";
export * from "./linux.js";
export * from "./docker.js";
export * from "./kubernetes.js";
export * from "./networking.js";
export * from "./activeDirectory.js";
export * from "./git.js";
export * from "./proxmox.js";

export const knowledgeTopicPacks: KnowledgeTopicPack[] = [
  linuxTopicPack,
  dockerTopicPack,
  kubernetesTopicPack,
  networkingTopicPack,
  activeDirectoryTopicPack,
  gitTopicPack,
  proxmoxTopicPack
];

// Preserve historical tie-breaking; cards added to a topic pack later are appended automatically.
const catalogOrder = [
  "linux-open-ports",
  "linux-ss",
  "linux-netstat",
  "linux-journalctl",
  "linux-systemctl",
  "linux-df",
  "linux-free",
  "docker-image",
  "docker-container",
  "docker-overview",
  "dockerfile",
  "docker-build",
  "docker-run",
  "docker-ps",
  "docker-logs",
  "kubernetes-pod",
  "kubernetes-overview",
  "kubernetes-deployment",
  "kubernetes-service",
  "kubernetes-ingress",
  "kubectl-get-pods",
  "kubectl-describe",
  "kubectl-logs",
  "kubernetes-basic-commands",
  "network-nat",
  "network-dns",
  "network-dhcp",
  "network-ping",
  "network-traceroute",
  "network-dns-tools",
  "active-directory",
  "domain-controller",
  "group-policy",
  "active-directory-dns",
  "dhcp-role",
  "linux-systemctl-status",
  "linux-systemctl-restart",
  "linux-journalctl-service",
  "linux-journalctl-follow",
  "linux-find-large-files",
  "linux-processes",
  "linux-kill-process",
  "linux-ip-addr",
  "linux-ip-route",
  "linux-ls-permissions",
  "linux-chmod",
  "linux-chown",
  "linux-mount",
  "linux-fstab",
  "docker-images",
  "docker-exec",
  "docker-inspect",
  "docker-compose-up",
  "docker-compose-down",
  "docker-compose-logs",
  "docker-volumes",
  "docker-networks",
  "kubectl-get-svc",
  "kubectl-exec",
  "kubectl-apply",
  "kubectl-delete",
  "kubectl-rollout-restart",
  "kubectl-rollout-status",
  "kubectl-port-forward",
  "kubernetes-namespace",
  "kubernetes-context",
  "network-nslookup",
  "network-dig",
  "network-curl",
  "network-netcat",
  "network-telnet-port",
  "network-dns-records",
  "network-dhcp-lease",
  "ad-check-domain-controller",
  "ad-dns-records",
  "ad-gpupdate",
  "ad-gpresult",
  "ad-dcdiag",
  "ad-repadmin",
  "ad-fsmo",
  "ad-gpo-basics",
  "linux-failed-services",
  "linux-journalctl-xe",
  "linux-boot-logs",
  "linux-inodes",
  "linux-swap",
  "linux-cpu-load",
  "linux-firewall-status",
  "linux-firewalld",
  "linux-iptables",
  "linux-selinux",
  "linux-users",
  "linux-sudo-permissions",
  "linux-permissions-overview",
  "linux-security-quick-check",
  "linux-sudo-basics",
  "linux-add-user-sudo",
  "linux-sudoers-basics",
  "linux-user-groups",
  "linux-ssh-access",
  "linux-tar",
  "linux-grep",
  "linux-find",
  "linux-rsync",
  "linux-cron",
  "linux-crontab",
  "docker-ps-all",
  "docker-logs-follow",
  "docker-stats",
  "docker-pull",
  "docker-lifecycle",
  "docker-remove",
  "docker-volume-list",
  "docker-volume-inspect",
  "docker-network-list",
  "docker-network-inspect",
  "docker-start-troubleshooting",
  "docker-port-mapping",
  "dockerfile-instructions",
  "docker-image-layers",
  "docker-build-cache",
  "compose-ps",
  "compose-logs-follow",
  "compose-restart",
  "compose-pull",
  "compose-build",
  "compose-exec",
  "compose-config",
  "compose-environment",
  "compose-volumes",
  "compose-networks",
  "kubectl-get-pods-all",
  "kubectl-get-nodes",
  "kubectl-logs-follow",
  "kubectl-events",
  "kubectl-top-pods",
  "kubectl-top-nodes",
  "kubectl-current-context",
  "kubernetes-crashloopbackoff",
  "kubernetes-imagepullbackoff",
  "kubernetes-service-types",
  "kubernetes-configmap",
  "kubernetes-secret",
  "kubernetes-probes",
  "network-tcp-port",
  "network-udp",
  "network-dns-troubleshooting",
  "network-default-gateway",
  "network-cidr",
  "network-arp",
  "network-route-troubleshooting",
  "windows-whoami-groups",
  "windows-flush-dns",
  "windows-secure-channel",
  "ad-groups",
  "active-directory-create-user",
  "active-directory-add-user-to-group",
  "ad-user-lookup",
  "ad-nested-groups",
  "ad-sysvol",
  "windows-dns-role",
  "windows-event-viewer",
  "windows-service-status",
  "windows-service-restart",
  "windows-test-netconnection",
  "proxmox-version",
  "proxmox-storage-status",
  "proxmox-qm-list",
  "proxmox-qm-status",
  "proxmox-qm-lifecycle",
  "proxmox-pct-list",
  "proxmox-pct-status",
  "proxmox-vzdump",
  "proxmox-cluster-status",
  "proxmox-node-resources",
  "git-status",
  "git-add",
  "git-commit",
  "git-push",
  "git-pull",
  "git-checkout",
  "git-branch",
  "git-log",
  "git-diff",
  "git-uncommitted-changes",
  "git-undo-last-commit",
  "git-pull-request"
] as const;

export function validateKnowledgeTopicPacks(packs: readonly KnowledgeTopicPack[]): string[] {
  const errors: string[] = [];
  const cardIds = new Set<string>();

  for (const pack of packs) {
    if (!pack.id) errors.push("Topic pack has no id.");
    if (!pack.displayName.trim()) errors.push(`Topic pack ${pack.id || "<unknown>"} has no display name.`);

    for (const card of pack.cards) {
      if (!card.id.trim()) errors.push(`Topic ${pack.id} contains a card with no id.`);
      if (cardIds.has(card.id)) errors.push(`Duplicate knowledge card id: ${card.id}.`);
      cardIds.add(card.id);
      if (!card.title.trim()) errors.push(`Card ${card.id} has an empty title.`);
      if (!card.category) errors.push(`Card ${card.id} has no category.`);
      if (card.category !== pack.id) {
        errors.push(`Card ${card.id} belongs to ${card.category}, but is registered in ${pack.id}.`);
      }
      if (card.aliases.length === 0 || card.aliases.some((alias) => !alias.trim())) {
        errors.push(`Card ${card.id} has empty aliases.`);
      }
    }
  }

  return errors;
}

const integrityErrors = validateKnowledgeTopicPacks(knowledgeTopicPacks);
if (integrityErrors.length > 0) {
  throw new Error(`Invalid local knowledge registry:\n${integrityErrors.join("\n")}`);
}

const cardsById = new Map(
  knowledgeTopicPacks.flatMap((pack) => pack.cards).map((card) => [card.id, card] as const)
);
const catalogOrderIds = new Set<string>(catalogOrder);

export const knowledgeCards: KnowledgeCard[] = [
  ...catalogOrder.map((cardId) => {
    const card = cardsById.get(cardId);
    if (!card) throw new Error(`Knowledge catalog order references missing card: ${cardId}.`);
    return card;
  }),
  ...knowledgeTopicPacks
    .flatMap((pack) => pack.cards)
    .filter((card) => !catalogOrderIds.has(card.id))
];

if (knowledgeCards.length !== cardsById.size) {
  throw new Error("Knowledge catalog order does not contain every registered card exactly once.");
}
