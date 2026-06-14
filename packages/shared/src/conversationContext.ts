import { classifyTechnicalFragment } from "./liveAssist.js";
import type { FragmentClassification } from "./liveAssist.js";

export type LiveAssistSensitivity = "conservative" | "balanced" | "active";

export type TechnicalTopic =
  | "Linux"
  | "Docker"
  | "Docker Compose"
  | "Kubernetes"
  | "Networking"
  | "DNS/DHCP"
  | "Active Directory"
  | "Git"
  | "Proxmox";

export interface TopicDetectionResult {
  currentTopic: TechnicalTopic | null;
  confidence: number;
  matchedTerms: string[];
}

export interface ConversationFragment {
  text: string;
  timestamp: number;
  topic: TechnicalTopic | null;
  classification: FragmentClassification;
}

export interface ConversationContextSnapshot extends TopicDetectionResult {
  fragments: ConversationFragment[];
}

export type LiveAssistIntent = "topic_intro" | "answer_request" | "ignore" | "wait";
export type LiveDecisionSource = "newest_fragment" | "pending_context";

export type LiveContextDecisionReason =
  | "answer"
  | "topic_intro"
  | "incomplete"
  | "ignored"
  | "active_topic_fragment"
  | "pending_answer_request"
  | "duplicate"
  | "topic_cooldown";

export interface LiveContextDecision extends ConversationContextSnapshot {
  aggregatedText: string;
  normalizedText: string;
  classification: FragmentClassification;
  intent: LiveAssistIntent;
  shouldAnswer: boolean;
  shouldWait: boolean;
  reason: LiveContextDecisionReason;
  cooldownRemainingMs: number;
  sensitivity: LiveAssistSensitivity;
  decisionSource: LiveDecisionSource;
  pendingRequestText?: string;
}

export interface ConversationContextOptions {
  maxAgeMs?: number;
  maxFragments?: number;
  topicCooldownMs?: number;
  pendingRequestMaxAgeMs?: number;
}

interface PendingAnswerRequest {
  text: string;
  normalizedText: string;
  topic: TechnicalTopic;
  classification: FragmentClassification;
  timestamp: number;
}

const topicTerms: Record<TechnicalTopic, string[]> = {
  "Docker Compose": ["docker compose", "docker-compose", "compose.yaml", "compose.yml"],
  Kubernetes: ["kubernetes", "k8s", "kubectl", "scheduler", "helm", "ingress", "deployment", "statefulset", "namespace", "кластер kubernetes", "кластер k8s"],
  "Active Directory": ["active directory", "domain controller", "group policy", "gpo", "gpupdate", "dcdiag", "repadmin", "fsmo", "контроллер домена", "групповая политика"],
  "DNS/DHCP": ["dns", "dhcp", "nslookup", "dig", "dns-запись", "dns запись", "dhcp lease", "аренда dhcp"],
  Proxmox: ["proxmox", "pve", "pvesm", "vzdump", "qm command", "qm list"],
  Docker: ["docker", "dockerfile", "docker image", "container", "registry", "контейнер", "образ docker"],
  Linux: ["linux", "systemctl", "journalctl", "chmod", "chown", "fstab", "bash", "df -h", "free -h", "ip addr", "ip route"],
  Networking: ["networking", "network", "nat", "port", "ping", "traceroute", "tracert", "netcat", "маршрут", "сеть", "порт"],
  Git: ["git", "commit", "branch", "merge", "rebase", "pull request", "репозиторий", "коммит", "ветка git"]
};

const topicPriority: TechnicalTopic[] = [
  "Docker Compose",
  "Kubernetes",
  "Active Directory",
  "DNS/DHCP",
  "Proxmox",
  "Docker",
  "Linux",
  "Networking",
  "Git"
];

const explanatoryIntentPatterns = [
  /что такое/i,
  /как работает/i,
  /для чего (?:нужен|нужна|нужно|нужны)/i,
  /чем отличается/i,
  /из чего состоит/i,
  /что делает/i,
  /объясни(?:те)?/i,
  /поясни(?:те)?/i,
  /расскажи(?:те)?/i,
  /\bwhat is\b/i,
  /\bwhat does\b/i,
  /\bhow does\b/i,
  /\bexplain\b/i,
  /\btell me about\b/i
];

const commandIntentPatterns = [
  /как (?:проверить|настроить|посмотреть|узнать|найти|запустить|остановить|перезапустить|сделать|собрать|пересобрать)/i,
  /(?:какая|какой|какую) команд[ауой]/i,
  /команда для/i,
  /команд(?:а|ы)\s+(?:для\s+)?[a-zа-я]/i,
  /(?:перечисли(?:те)?|покажи(?:те)?)\s+(?:основные\s+)?команд[ыау]/i,
  /(?:какие\s+)?основные\s+команд[ыау]/i,
  /расскажи(?:те)?\s+(?:про\s+)?основные\s+команд[ыау]/i,
  /помоги(?:те)?/i,
  /\bhow to\b/i,
  /\b(?:build|rebuild)\b/i,
  /\bcommand (?:for|to)\b/i,
  /\bhelp (?:with|me)\b/i
];

const topicIntroPatterns = [
  /^(?:коллеги[, ]+)?(?:давайте\s+)?поговорим\s+(?:о|об|про)\s+/i,
  /^(?:коллеги[, ]+)?(?:давайте\s+)?обсудим\s+/i,
  /^тема\s+/i,
  /^сегодня\s+(?:говорим\s+)?(?:о|об|про)\s+/i,
  /^(?:let'?s\s+)?talk\s+about\s+/i,
  /^let'?s\s+discuss\s+/i,
  /^today(?:'s\s+topic\s+is|\s+we\s+discuss)\s+/i
];

const ignoredConversationPatterns = [
  /^(?:привет|здравствуйте|добрый день|hello|hi|hey)[!. ]*$/i,
  /\b(?:начнем встречу|закончим встречу|вернемся после обеда|следующий слайд|всем спасибо|есть вопросы)\b/i,
  /\b(?:start the meeting|end the meeting|back after lunch|next slide|thanks everyone|any questions)\b/i
];

const incompletePatterns = [
  /(?:\.\.\.|…)[ ]*$/,
  /^(?:как проверить|как настроить|как посмотреть|команда для|что такое|как работает)[?.! ]*$/i,
  /^(?:how to|command for|what is|how does)[?.! ]*$/i,
  /\b(?:в|во) (?:kubernetes|docker|linux|proxmox) (?:есть|нужно|можно)[?.! ]*$/i,
  /\b(?:in) (?:kubernetes|docker|linux|proxmox) (?:there is|we can|you can)[?.! ]*$/i
];

const danglingWords = new Set([
  "и", "или", "а", "но", "в", "во", "на", "с", "со", "для", "по", "как", "что", "чем",
  "and", "or", "but", "in", "on", "with", "for", "to", "the", "how", "what", "why"
]);

export class ConversationContextBuffer {
  private readonly maxAgeMs: number;
  private readonly maxFragments: number;
  private readonly topicCooldownMs: number;
  private readonly pendingRequestMaxAgeMs: number;
  private fragments: ConversationFragment[] = [];
  private answeredFragments = new Map<string, number>();
  private lastTopicAnswers = new Map<TechnicalTopic, { timestamp: number; normalizedText: string }>();
  private pendingRequest?: PendingAnswerRequest;

  constructor(options: ConversationContextOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? 90_000;
    this.maxFragments = options.maxFragments ?? 10;
    this.topicCooldownMs = options.topicCooldownMs ?? 30_000;
    this.pendingRequestMaxAgeMs = options.pendingRequestMaxAgeMs ?? 25_000;
  }

  add(text: string, timestamp = Date.now(), sensitivity: LiveAssistSensitivity = "balanced"): LiveContextDecision {
    this.prune(timestamp);
    const cleanedText = cleanupText(text);
    const fragmentTopic = detectTechnicalTopic(cleanedText);
    const classification = classifyTechnicalFragment(cleanedText).classification;
    this.fragments.push({
      text: cleanedText,
      timestamp,
      topic: fragmentTopic.currentTopic,
      classification
    });
    this.fragments = this.fragments.slice(-this.maxFragments);

    const snapshot = this.getSnapshot(timestamp);
    const aggregatedText = aggregateConversationFragments(this.fragments, snapshot.currentTopic);
    const normalizedText = normalizeContextText(aggregatedText);
    const normalizedNewestText = normalizeContextText(cleanedText);
    const aggregatedClassification = classifyTechnicalFragment(aggregatedText).classification;

    if (isLikelyIncompleteConversationFragment(cleanedText)) {
      return decision(snapshot, aggregatedText, normalizedText, aggregatedClassification, "wait", false, true, "incomplete", sensitivity);
    }

    if (isTopicIntroduction(cleanedText, fragmentTopic.currentTopic)) {
      return decision(snapshot, aggregatedText, normalizedText, aggregatedClassification, "topic_intro", false, false, "topic_intro", sensitivity);
    }

    if (ignoredConversationPatterns.some((pattern) => pattern.test(normalizedNewestText))) {
      const pendingDecision = this.recoverPendingRequest(snapshot, sensitivity, timestamp);
      if (pendingDecision) return pendingDecision;
      return decision(snapshot, aggregatedText, normalizedText, aggregatedClassification, "ignore", false, false, "ignored", sensitivity);
    }

    const hasIntent = hasAnswerIntent(cleanedText);
    const balancedAnswer = classification === "explicit_question"
      || (snapshot.currentTopic !== null && hasIntent);
    const conservativeAnswer = snapshot.currentTopic !== null && hasIntent;
    const activeTopicAnswer = isActiveTopicRequest(cleanedText, snapshot.currentTopic, classification);
    const shouldAnswer = sensitivity === "conservative"
      ? conservativeAnswer
      : sensitivity === "active"
        ? balancedAnswer || activeTopicAnswer
        : balancedAnswer;
    const answerReason: LiveContextDecisionReason = activeTopicAnswer && !balancedAnswer
      ? "active_topic_fragment"
      : "answer";

    if (!shouldAnswer) {
      const pendingDecision = this.recoverPendingRequest(snapshot, sensitivity, timestamp);
      if (pendingDecision) return pendingDecision;
      return decision(snapshot, aggregatedText, normalizedText, aggregatedClassification, "ignore", false, false, "ignored", sensitivity);
    }

    if (this.answeredFragments.has(normalizedText)) {
      return decision(snapshot, aggregatedText, normalizedText, aggregatedClassification, "answer_request", false, false, "duplicate", sensitivity);
    }

    const cooldownRemainingMs = snapshot.currentTopic
      ? this.getTopicCooldownRemaining(snapshot.currentTopic, normalizedText, timestamp, sensitivity)
      : 0;
    if (cooldownRemainingMs > 0) {
      return decision(snapshot, aggregatedText, normalizedText, aggregatedClassification, "answer_request", false, false, "topic_cooldown", sensitivity, cooldownRemainingMs);
    }

    if (snapshot.currentTopic) {
      this.pendingRequest = {
        text: aggregatedText,
        normalizedText,
        topic: snapshot.currentTopic,
        classification: aggregatedClassification,
        timestamp
      };
    }

    return decision(
      snapshot,
      aggregatedText,
      normalizedText,
      aggregatedClassification,
      "answer_request",
      true,
      false,
      answerReason,
      sensitivity,
      0,
      "newest_fragment",
      aggregatedText
    );
  }

  markAnswered(result: Pick<LiveContextDecision, "normalizedText" | "currentTopic">, timestamp = Date.now()) {
    if (result.normalizedText) {
      this.answeredFragments.set(result.normalizedText, timestamp);
    }
    if (result.currentTopic) {
      this.lastTopicAnswers.set(result.currentTopic, {
        timestamp,
        normalizedText: result.normalizedText
      });
    }
    if (this.pendingRequest?.normalizedText === result.normalizedText) {
      this.pendingRequest = undefined;
    }
  }

  clearPendingRequest() {
    this.pendingRequest = undefined;
  }

  getSnapshot(timestamp = Date.now()): ConversationContextSnapshot {
    this.prune(timestamp);
    const newestFragment = this.fragments.at(-1);
    const topic = newestFragment?.topic
      ? detectTechnicalTopic(newestFragment.text)
      : detectTechnicalTopic(this.fragments.map((fragment) => fragment.text));
    return { fragments: [...this.fragments], ...topic };
  }

  clear() {
    this.fragments = [];
    this.answeredFragments.clear();
    this.lastTopicAnswers.clear();
    this.pendingRequest = undefined;
  }

  private getTopicCooldownRemaining(
    topic: TechnicalTopic,
    normalizedText: string,
    timestamp: number,
    sensitivity: LiveAssistSensitivity
  ): number {
    const lastAnswer = this.lastTopicAnswers.get(topic);
    if (!lastAnswer) return 0;

    const elapsed = timestamp - lastAnswer.timestamp;
    const similarityThreshold = sensitivity === "conservative" ? 0.55 : sensitivity === "active" ? 0.88 : 0.72;
    if (elapsed >= this.topicCooldownMs || textSimilarity(lastAnswer.normalizedText, normalizedText) < similarityThreshold) {
      return 0;
    }

    return this.topicCooldownMs - elapsed;
  }

  private recoverPendingRequest(
    snapshot: ConversationContextSnapshot,
    sensitivity: LiveAssistSensitivity,
    timestamp: number
  ): LiveContextDecision | undefined {
    const pending = this.pendingRequest;
    if (sensitivity === "conservative" || !pending || timestamp - pending.timestamp > this.pendingRequestMaxAgeMs) {
      return undefined;
    }

    return decision(
      { ...snapshot, currentTopic: pending.topic },
      pending.text,
      pending.normalizedText,
      pending.classification,
      "answer_request",
      true,
      false,
      "pending_answer_request",
      sensitivity,
      0,
      "pending_context",
      pending.text
    );
  }

  private prune(timestamp: number) {
    const oldestAllowed = timestamp - this.maxAgeMs;
    this.fragments = this.fragments
      .filter((fragment) => fragment.timestamp >= oldestAllowed)
      .slice(-this.maxFragments);
    for (const [fragment, answeredAt] of this.answeredFragments) {
      if (answeredAt < oldestAllowed) {
        this.answeredFragments.delete(fragment);
      }
    }
    if (this.pendingRequest && timestamp - this.pendingRequest.timestamp > this.pendingRequestMaxAgeMs) {
      this.pendingRequest = undefined;
    }
  }
}

export function detectTechnicalTopic(text: string | string[]): TopicDetectionResult {
  const source = normalizeContextText(Array.isArray(text) ? text.join(" ") : text);
  const scores = new Map<TechnicalTopic, { score: number; terms: string[] }>();

  for (const topic of topicPriority) {
    const terms = topicTerms[topic].filter((term) => containsTerm(source, term));
    if (terms.length > 0) {
      scores.set(topic, {
        score: terms.reduce((sum, term) => sum + Math.min(3, term.split(/\s+/).length), 0),
        terms
      });
    }
  }

  const winner = topicPriority
    .filter((topic) => scores.has(topic))
    .sort((left, right) => (scores.get(right)?.score ?? 0) - (scores.get(left)?.score ?? 0))[0];

  if (!winner) {
    return { currentTopic: null, confidence: 0, matchedTerms: [] };
  }

  const match = scores.get(winner)!;
  return {
    currentTopic: winner,
    confidence: Math.min(1, 0.45 + match.score * 0.15),
    matchedTerms: match.terms
  };
}

export function aggregateConversationFragments(
  fragments: ConversationFragment[],
  currentTopic: TechnicalTopic | null
): string {
  const recent = fragments.slice(-3);
  const newest = recent.at(-1);
  if (!newest) return "";

  const selected = recent.filter((fragment, index) => {
    if (index === recent.length - 1) return true;
    if (isLikelyIncompleteConversationFragment(fragment.text)) return true;
    if (hasAnswerIntent(fragment.text)) return false;
    if (currentTopic && fragment.topic === currentTopic) return true;
    return newest.topic === null && currentTopic !== null && fragment.topic === currentTopic;
  });

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const fragment of selected) {
    const normalized = normalizeContextText(fragment.text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(fragment.text.trim());
  }

  return unique
    .map((text, index) => addSentencePunctuation(text, index === unique.length - 1 && hasQuestionIntent(text)))
    .join(" ")
    .slice(0, 600);
}

export function isLikelyIncompleteConversationFragment(text: string): boolean {
  const cleaned = cleanupText(text);
  const normalized = normalizeContextText(cleaned);
  if (!normalized) return false;
  if (incompletePatterns.some((pattern) => pattern.test(cleaned))) return true;

  const lastWord = normalized.split(" ").at(-1) ?? "";
  return !/[?.!]$/.test(cleaned) && danglingWords.has(lastWord);
}

export function isTopicIntroduction(text: string, topic = detectTechnicalTopic(text).currentTopic): boolean {
  const normalized = normalizeContextText(text);
  return topic !== null
    && topicIntroPatterns.some((pattern) => pattern.test(normalized))
    && !hasAnswerIntent(normalized);
}

function isActiveTopicRequest(
  text: string,
  currentTopic: TechnicalTopic | null,
  classification: FragmentClassification
): boolean {
  if (!currentTopic) return false;
  const normalized = normalizeContextText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 9) return false;

  return classification === "technical_term"
    || /\b(?:логи?|logs?|команд[ыау]?|commands?|ошибк[аи]?|error|troubleshoot)\b/i.test(normalized)
    || /(?:не\s+(?:стартует|запускается|работает)|cannot\s+(?:start|run)|won't\s+start)/i.test(normalized);
}

function hasAnswerIntent(text: string): boolean {
  return hasQuestionIntent(text)
    || explanatoryIntentPatterns.some((pattern) => pattern.test(text))
    || commandIntentPatterns.some((pattern) => pattern.test(text));
}

function hasQuestionIntent(text: string): boolean {
  return /\?$/.test(text.trim())
    || explanatoryIntentPatterns.some((pattern) => pattern.test(text))
    || commandIntentPatterns.some((pattern) => pattern.test(text));
}

function decision(
  snapshot: ConversationContextSnapshot,
  aggregatedText: string,
  normalizedText: string,
  classification: FragmentClassification,
  intent: LiveAssistIntent,
  shouldAnswer: boolean,
  shouldWait: boolean,
  reason: LiveContextDecisionReason,
  sensitivity: LiveAssistSensitivity,
  cooldownRemainingMs = 0,
  decisionSource: LiveDecisionSource = "newest_fragment",
  pendingRequestText?: string
): LiveContextDecision {
  return {
    ...snapshot,
    aggregatedText,
    normalizedText,
    classification,
    intent,
    shouldAnswer,
    shouldWait,
    reason,
    cooldownRemainingMs,
    sensitivity,
    decisionSource,
    pendingRequestText
  };
}

function addSentencePunctuation(text: string, question: boolean): string {
  const cleaned = text.trim();
  if (!cleaned || /[?.!]$/.test(cleaned)) return cleaned;
  return `${cleaned}${question ? "?" : "."}`;
}

function cleanupText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeContextText(text: string): string {
  return cleanupText(text).toLowerCase().replace(/ё/g, "е");
}

function containsTerm(text: string, term: string): boolean {
  const escaped = normalizeContextText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zа-я0-9])${escaped}($|[^a-zа-я0-9])`, "i").test(text);
}

function textSimilarity(left: string, right: string): number {
  const leftTokens = similarityTokens(left);
  const rightTokens = similarityTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function similarityTokens(text: string): Set<string> {
  return new Set(
    normalizeContextText(text)
      .replace(/[?!.,;:]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}
