export type FragmentClassification = "explicit_question" | "technical_term" | "ignore";

export interface FragmentDetectionResult {
  classification: FragmentClassification;
  normalizedText: string;
  matchedValue?: string;
  intentRescue: boolean;
  matchedQuestionPattern?: string;
  matchedTechnicalTerm?: string;
}

export interface IntentRescueResult {
  used: boolean;
  matchedQuestionPattern?: string;
  matchedTechnicalTerm?: string;
}

const explicitQuestionPatterns = [
  "что такое",
  "из чего состоит",
  "как работает",
  "для чего нужен",
  "для чего применяется",
  "для чего используется",
  "чем отличается",
  "как проверить",
  "как настроить"
];

const technicalTerms = [
  "active directory",
  "docker image",
  "kubernetes",
  "deployment",
  "container",
  "registry",
  "service",
  "ingress",
  "docker",
  "linux",
  "dhcp",
  "dns",
  "nat",
  "pod",
  "port"
];

const ignoredPhrases = [
  "продолжение следует",
  "спасибо за просмотр",
  "thanks for watching"
];

const rescueQuestionPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "чем отличается", pattern: /чем\s+отличается/i },
  { label: "как проверить", pattern: /как\s+проверить/i },
  { label: "как добавить", pattern: /как\s+добавить/i },
  { label: "как повысить", pattern: /как\s+повысить/i },
  { label: "как изменить", pattern: /как\s+изменить/i },
  { label: "как поменять", pattern: /как\s+поменять/i },
  { label: "как сменить", pattern: /как\s+сменить/i },
  { label: "как сделать", pattern: /как\s+сделать/i },
  { label: "как выдать", pattern: /как\s+выдать/i },
  { label: "как дать", pattern: /как\s+дать/i },
  { label: "как настроить", pattern: /как\s+настроить/i },
  { label: "как посмотреть", pattern: /как\s+посмотреть/i },
  { label: "сбросить пароль", pattern: /сбросить\s+парол/i },
  { label: "сменить пароль", pattern: /сменить\s+парол/i },
  { label: "зачем", pattern: /(?:^|[^а-я])зачем(?:$|[^а-я])/i },
  { label: "почему", pattern: /(?:^|[^а-я])почему(?:$|[^а-я])/i },
  { label: "команда", pattern: /(?:^|[^а-я])команд(?:а|у|ы|ой)(?:$|[^а-я])/i },
  { label: "права", pattern: /(?:^|[^а-я])прав(?:а|о|ами|ах)(?:$|[^а-я])/i },
  { label: "доступ", pattern: /(?:^|[^а-я])доступ(?:а|ом|у)?(?:$|[^а-я])/i },
  { label: "что", pattern: /(?:^|[^а-я])что(?:$|[^а-я])/i },
  { label: "как", pattern: /(?:^|[^а-я])как(?:$|[^а-я])/i }
];

const strongAdminTerms: Array<{ label: string; pattern: RegExp }> = [
  { label: "Active Directory", pattern: /\bactive\s+directory\b/i },
  { label: "Kubernetes", pattern: /\bkubernetes\b/i },
  { label: "Docker", pattern: /\bdocker\b/i },
  { label: "Proxmox", pattern: /\bproxmox\b/i },
  { label: "systemctl", pattern: /\bsystemctl\b/i },
  { label: "journalctl", pattern: /\bjournalctl\b/i },
  { label: "authorized_keys", pattern: /\bauthorized_keys\b/i },
  { label: "sudoers", pattern: /\bsudoers\b/i },
  { label: "usermod", pattern: /\busermod\b/i },
  { label: "firewall", pattern: /(?:\b(?:firewall|firewalld)\b|фаервол)/i },
  { label: "sudo", pattern: /\bsudo\b/i },
  { label: "wheel", pattern: /\bwheel\b/i },
  { label: "sshd", pattern: /\bsshd\b/i },
  { label: "chmod", pattern: /\bchmod\b/i },
  { label: "chown", pattern: /\bchown\b/i },
  { label: "passwd", pattern: /\bpasswd\b/i },
  { label: "chage", pattern: /\bchage\b/i },
  { label: "Linux", pattern: /\blinux\b/i },
  { label: "DHCP", pattern: /\bdhcp\b/i },
  { label: "DNS", pattern: /\bdns\b/i },
  { label: "Git", pattern: /\bgit\b/i },
  { label: "порт", pattern: /(?:порт|\bport\b)/i }
];

export function classifyTechnicalFragment(text: string): FragmentDetectionResult {
  const normalizedText = normalizeFragment(text);

  if (normalizedText.length === 0 || ignoredPhrases.some((phrase) => normalizedText.includes(phrase))) {
    return { classification: "ignore", normalizedText, intentRescue: false };
  }

  const questionPattern = explicitQuestionPatterns.find((pattern) => normalizedText.includes(pattern));
  if (questionPattern) {
    return {
      classification: "explicit_question",
      normalizedText,
      matchedValue: questionPattern,
      intentRescue: false
    };
  }

  const rescue = detectIntentRescue(normalizedText);
  if (rescue.used) {
    return {
      classification: "explicit_question",
      normalizedText,
      matchedValue: rescue.matchedTechnicalTerm,
      intentRescue: true,
      matchedQuestionPattern: rescue.matchedQuestionPattern,
      matchedTechnicalTerm: rescue.matchedTechnicalTerm
    };
  }

  const technicalTerm = technicalTerms.find((term) => containsTerm(normalizedText, term));
  if (technicalTerm) {
    return {
      classification: "technical_term",
      normalizedText,
      matchedValue: technicalTerm,
      intentRescue: false
    };
  }

  const knowledgeCard = findKnowledgeCards(text)[0];
  if (knowledgeCard) {
    return {
      classification: "technical_term",
      normalizedText,
      matchedValue: knowledgeCard.title,
      intentRescue: false
    };
  }

  return { classification: "ignore", normalizedText, intentRescue: false };
}

export function detectIntentRescue(text: string): IntentRescueResult {
  const normalizedText = normalizeFragment(text);
  const question = rescueQuestionPatterns.find(({ pattern }) => pattern.test(normalizedText));
  if (!question) return { used: false };

  const strongTerm = strongAdminTerms.find(({ pattern }) => pattern.test(normalizedText));
  const contextualTerm = strongTerm ?? findContextualAdminTerm(normalizedText);
  if (!contextualTerm) return { used: false };

  return {
    used: true,
    matchedQuestionPattern: question.label,
    matchedTechnicalTerm: contextualTerm.label
  };
}

function findContextualAdminTerm(text: string): { label: string; pattern: RegExp } | undefined {
  const rules: Array<{ label: string; term: RegExp; context: RegExp }> = [
    { label: "пользователь", term: /пользовател[ьяюем]*/i, context: /(?:sudo|sudoers|linux|групп|прав|привилег|административ|парол|доступ|\bid\b|\bgroups\b)/i },
    { label: "группа", term: /групп[аыеуойах]*/i, context: /(?:пользовател|sudo|wheel|linux|active\s+directory|\bad\b)/i },
    { label: "права", term: /прав(?:а|о|ами|ах)/i, context: /(?:пользовател|файл|директор|каталог|папк|sudo|linux|chmod|chown|доступ)/i },
    { label: "пароль", term: /парол[ьяюем]*/i, context: /(?:linux|пользовател|root|passwd|chage)/i },
    { label: "файл", term: /файл[а-я]*/i, context: /(?:исполняем|прав|chmod|chown|владел)/i },
    { label: "доступ", term: /доступ(?:а|ом|у)?/i, context: /(?:пользовател|файл|ssh|linux|sudo|active\s+directory|\bad\b)/i },
    { label: "безопасность", term: /безопасност[ьи]/i, context: /(?:linux|firewall|фаервол|ssh|sudo|selinux)/i },
    { label: "сервис", term: /сервис[а-я]*/i, context: /(?:linux|systemctl|journalctl|docker|kubernetes)/i }
  ];

  const match = rules.find(({ term, context }) => term.test(text) && context.test(text));
  return match ? { label: match.label, pattern: match.term } : undefined;
}

function normalizeFragment(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsTerm(text: string, term: string): boolean {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapedTerm}($|[^a-z0-9])`, "i").test(text);
}
import { findKnowledgeCards } from "./knowledgeCards.js";
