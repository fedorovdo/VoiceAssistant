export interface TranscriptDuplicateTrackerOptions {
  duplicateWindowMs?: number;
}

export class TranscriptDuplicateTracker {
  private readonly duplicateWindowMs: number;
  private readonly acceptedAt = new Map<string, number>();

  constructor(options: TranscriptDuplicateTrackerOptions = {}) {
    this.duplicateWindowMs = options.duplicateWindowMs ?? 30_000;
  }

  checkAndRemember(text: string, timestamp = Date.now()): boolean {
    const normalized = normalizeTranscript(text);
    if (!normalized) return false;

    this.prune(timestamp);
    const previousTimestamp = this.acceptedAt.get(normalized);
    if (previousTimestamp !== undefined && timestamp - previousTimestamp <= this.duplicateWindowMs) {
      return true;
    }

    this.acceptedAt.set(normalized, timestamp);
    return false;
  }

  clear(): void {
    this.acceptedAt.clear();
  }

  private prune(timestamp: number): void {
    for (const [text, acceptedAt] of this.acceptedAt) {
      if (timestamp - acceptedAt > this.duplicateWindowMs) this.acceptedAt.delete(text);
    }
  }
}

function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9+./-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
