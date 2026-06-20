export type KnowledgeTopicId =
  | "linux"
  | "docker"
  | "kubernetes"
  | "networking"
  | "active-directory"
  | "git"
  | "proxmox";

export interface KnowledgeCard {
  id: string;
  title: string;
  aliases: string[];
  category: KnowledgeTopicId;
  shortExplanation: string;
  bullets: string[];
  commands: string[];
  relatedTerms: string[];
}

export interface KnowledgeTopicPack {
  id: KnowledgeTopicId;
  displayName: string;
  cards: KnowledgeCard[];
}

export function defineCard(
  id: string,
  title: string,
  aliases: string[],
  category: KnowledgeTopicId,
  shortExplanation: string,
  bullets: string[],
  commands: string[],
  relatedTerms: string[]
): KnowledgeCard {
  return { id, title, aliases, category, shortExplanation, bullets, commands, relatedTerms };
}
