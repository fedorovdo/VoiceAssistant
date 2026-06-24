export interface SequentialRequestQueueOptions {
  maxPending?: number;
}

export type QueueEnqueueResult = "queued" | "queue_full";

export interface SequentialRequestQueueSnapshot<T> {
  active?: T;
  pending: T[];
}

export class SequentialRequestQueue<T> {
  private readonly maxPending: number;
  private active?: T;
  private pending: T[] = [];

  constructor(options: SequentialRequestQueueOptions = {}) {
    this.maxPending = options.maxPending ?? 5;
  }

  enqueue(request: T): QueueEnqueueResult {
    if (this.pending.length >= this.maxPending) return "queue_full";
    this.pending.push(request);
    return "queued";
  }

  startNext(): T | undefined {
    if (this.active) return undefined;
    this.active = this.pending.shift();
    return this.active;
  }

  finishActive(expectedActive?: T): T | undefined {
    if (expectedActive !== undefined && this.active !== expectedActive) return undefined;
    const finished = this.active;
    this.active = undefined;
    return finished;
  }

  getActive(): T | undefined {
    return this.active;
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  clear(): void {
    this.active = undefined;
    this.pending = [];
  }

  getSnapshot(): SequentialRequestQueueSnapshot<T> {
    return { active: this.active, pending: [...this.pending] };
  }
}
