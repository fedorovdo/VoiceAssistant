export type UtteranceFlushReason = "strong_punctuation" | "idle_timeout" | "max_fragments";

export interface UtteranceBufferOptions {
  combineWindowMs?: number;
  idleFlushMs?: number;
  maxFragments?: number;
}

export interface UtteranceBufferUpdate {
  pendingUtterance: string;
  shouldFlush: boolean;
  flushReason?: UtteranceFlushReason;
}

export interface FlushedUtterance {
  text: string;
  fragments: string[];
  reason: UtteranceFlushReason;
}

interface BufferedFragment {
  text: string;
  timestamp: number;
}

export class UtteranceBuffer {
  private readonly combineWindowMs: number;
  private readonly idleFlushMs: number;
  private readonly maxFragments: number;
  private fragments: BufferedFragment[] = [];
  private immediateFlushReason?: UtteranceFlushReason;

  constructor(options: UtteranceBufferOptions = {}) {
    this.combineWindowMs = options.combineWindowMs ?? 8_000;
    this.idleFlushMs = options.idleFlushMs ?? 900;
    this.maxFragments = options.maxFragments ?? 3;
  }

  addFragment(text: string, timestamp = Date.now()): UtteranceBufferUpdate {
    const cleanedText = cleanupText(text);
    if (!cleanedText) {
      return { pendingUtterance: this.getPendingUtterance(), shouldFlush: false };
    }

    const lastFragment = this.fragments.at(-1);
    if (lastFragment && timestamp - lastFragment.timestamp > this.combineWindowMs) {
      this.clear();
    }

    if (!this.fragments.some((fragment) => normalize(fragment.text) === normalize(cleanedText))) {
      this.fragments.push({ text: cleanedText, timestamp });
    } else if (lastFragment) {
      lastFragment.timestamp = timestamp;
    }

    this.immediateFlushReason = this.getImmediateFlushReason();
    return {
      pendingUtterance: this.getPendingUtterance(),
      shouldFlush: this.immediateFlushReason !== undefined,
      flushReason: this.immediateFlushReason
    };
  }

  getPendingUtterance(): string {
    return combineFragments(this.fragments.map((fragment) => fragment.text));
  }

  shouldFlush(now = Date.now()): boolean {
    return this.getFlushReason(now) !== undefined;
  }

  getFlushReason(now = Date.now()): UtteranceFlushReason | undefined {
    if (this.immediateFlushReason) return this.immediateFlushReason;
    const lastFragment = this.fragments.at(-1);
    if (lastFragment && now - lastFragment.timestamp >= this.idleFlushMs) {
      return "idle_timeout";
    }
    return undefined;
  }

  flush(now = Date.now()): FlushedUtterance | undefined {
    if (this.fragments.length === 0) return undefined;
    const reason = this.getFlushReason(now) ?? "idle_timeout";
    const fragments = this.fragments.map((fragment) => fragment.text);
    const text = combineFragments(fragments);
    this.clear();
    return text ? { text, fragments, reason } : undefined;
  }

  clear() {
    this.fragments = [];
    this.immediateFlushReason = undefined;
  }

  private getImmediateFlushReason(): UtteranceFlushReason | undefined {
    if (this.fragments.length >= this.maxFragments) return "max_fragments";
    const newestText = this.fragments.at(-1)?.text ?? "";
    if (hasStrongTerminalPunctuation(newestText) && isClearlyCompleteUtterance(this.getPendingUtterance(), newestText)) {
      return "strong_punctuation";
    }
    return undefined;
  }
}

function combineFragments(fragments: string[]): string {
  if (fragments.length === 0) return "";

  let base = stripTerminalPunctuation(fragments[0]);
  const baseWasQuestion = /\?$/.test(fragments[0].trim());
  const trailingSentences: string[] = [];

  for (const fragment of fragments.slice(1)) {
    const cleaned = stripTerminalPunctuation(fragment);
    if (!cleaned) continue;

    if (isContextContinuation(cleaned) || isStandaloneTechnicalQualifier(cleaned)) {
      base = `${base} ${lowercaseContinuation(cleaned)}`.trim();
    } else if (isCommandPrompt(cleaned) && baseWasQuestion) {
      trailingSentences.push(`${capitalize(cleaned)}.`);
    } else {
      base = `${base} ${cleaned}`.trim();
    }
  }

  const finalPunctuation = baseWasQuestion ? "?" : terminalPunctuation(fragments.at(-1) ?? fragments[0]);
  return [`${base}${finalPunctuation}`, ...trailingSentences].join(" ").replace(/\s+/g, " ").trim();
}

function isClearlyCompleteUtterance(combinedText: string, newestText: string): boolean {
  if (isLikelyContinuation(newestText)) return false;
  const normalized = normalize(combinedText);
  const wordCount = normalized.split(" ").filter(Boolean).length;
  const hasExplicitQuestion = /(?:что такое|из чего состоит|для чего (?:нужен|нужна|нужно|нужны|применяется|используется)|как работает|чем отличается|на каком уровне|сколько уровней|где работает|расскажи(?:те)?|(?:схема|модель)\s+|как (?:проверить|добавить|создать|выдать|дать|настроить|посмотреть|поменять|изменить|сменить|повысить|сделать|установить|подключить|смонтировать|запустить))/i.test(normalized);
  const hasStrongTechnicalTerm = /(?:\bdockerfile\b|\blinux\b|\bsamba\b|\bsmbclient\b|\bcifs\b|\bsudo\b|\bsudoers\b|\bwheel\b|\bpasswd\b|\bchmod\b|\bchown\b|\bdocker\b|\bkubernetes\b|\bkubectl\b|\bfirewall\b|\bsystemctl\b|\bjournalctl\b|\bactive directory\b|\bdns\b|\bdhcp\b|\bproxmox\b|\btcp(?:\/ip)?\b|\btsp\/ip\b|\budp\b|\bosi\b|\boci\b|\barp\b|\bvlan\b|\bicmp\b|протокол|порт|парол|пользовател)/i.test(normalized);

  if (hasStrongTerminalPunctuation(newestText) && hasExplicitQuestion && hasStrongTechnicalTerm) return true;
  return wordCount >= 5 && hasStrongTechnicalTerm && !isLikelyIncompleteStart(normalized);
}

function isLikelyContinuation(text: string): boolean {
  const normalized = normalize(text);
  return isContextContinuation(normalized)
    || isStandaloneTechnicalQualifier(normalized)
    || isCommandPrompt(normalized)
    || isLikelyIncompleteStart(normalized)
    || /^(?:перезапустить|проверить|настроить|добавить|выдать|дать)\s+(?:pod|сервис|права|доступ)[?.!]?$/i.test(normalized);
}

function isLikelyIncompleteStart(text: string): boolean {
  const normalized = normalize(text);
  if (/^(?:протокол\s+tcp\/ip|на\s+каком\s+уровне|сколько\s+уровней)$/.test(normalized)) return true;
  return /^(?:как (?:проверить|дать|добавить|создать|выдать|настроить|посмотреть|поменять|изменить|сменить|повысить|сделать|установить|подключить|смонтировать|запустить)|команда для)(?:\s+[^.!?]+)?[?.!]?$/i.test(text)
    && text.split(" ").filter(Boolean).length <= 4;
}

function isContextContinuation(text: string): boolean {
  return /^(?:в|во)\s+(?:linux|kubernetes|docker|samba|proxmox|active directory)$/i.test(normalize(text));
}

function isStandaloneTechnicalQualifier(text: string): boolean {
  return /^(?:sudo|sudoers|kubectl|docker|samba|linux|kubernetes|firewall)$/i.test(normalize(text));
}

function isCommandPrompt(text: string): boolean {
  return /^(?:команда|команды|command|commands)$/i.test(normalize(text));
}

function hasStrongTerminalPunctuation(text: string): boolean {
  return /[?.!]$/.test(text.trim());
}

function stripTerminalPunctuation(text: string): string {
  return cleanupText(text).replace(/[?.!]+$/g, "").trim();
}

function terminalPunctuation(text: string): string {
  const match = text.trim().match(/[?.!]$/);
  return match?.[0] ?? ".";
}

function lowercaseContinuation(text: string): string {
  return text.length > 0 ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
}

function capitalize(text: string): string {
  return text.length > 0 ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function cleanupText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalize(text: string): string {
  return stripTerminalPunctuation(text).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
