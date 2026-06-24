export type LiveProcessingState =
  | "idle"
  | "listening"
  | "transcribing"
  | "collecting"
  | "deciding"
  | "searching_local"
  | "requesting_gpt"
  | "answered"
  | "duplicate"
  | "no_match"
  | "error";

export type LiveProcessingEvent =
  | "reset"
  | "listening_started"
  | "transcription_started"
  | "fragment_buffered"
  | "utterance_flushed"
  | "local_lookup_started"
  | "gpt_request_started"
  | "answer_rendered"
  | "duplicate_detected"
  | "local_match_missing"
  | "processing_failed"
  | "settled";

export interface LiveTimingDiagnostics {
  audioChunkCreatedAt?: number;
  transcriptionStartedAt?: number;
  transcriptionCompletedAt?: number;
  utteranceFlushedAt?: number;
  localLookupStartedAt?: number;
  localLookupCompletedAt?: number;
  gptRequestStartedAt?: number;
  gptRequestCompletedAt?: number;
  answerRenderedAt?: number;
  totalFromLastChunkMs?: number;
}

const eventStates: Record<LiveProcessingEvent, LiveProcessingState> = {
  reset: "idle",
  listening_started: "listening",
  transcription_started: "transcribing",
  fragment_buffered: "collecting",
  utterance_flushed: "deciding",
  local_lookup_started: "searching_local",
  gpt_request_started: "requesting_gpt",
  answer_rendered: "answered",
  duplicate_detected: "duplicate",
  local_match_missing: "no_match",
  processing_failed: "error",
  settled: "listening"
};

export function reduceLiveProcessingState(
  _current: LiveProcessingState,
  event: LiveProcessingEvent
): LiveProcessingState {
  return eventStates[event];
}

export class LiveAnswerRequestGate {
  private activeToken?: number;
  private tokenSequence = 0;

  tryAcquire(): number | undefined {
    if (this.activeToken !== undefined) return undefined;
    this.activeToken = ++this.tokenSequence;
    return this.activeToken;
  }

  tryStart(): boolean {
    return this.tryAcquire() !== undefined;
  }

  finish(token?: number): void {
    if (token !== undefined && token !== this.activeToken) return;
    this.activeToken = undefined;
  }

  reset(): void {
    this.activeToken = undefined;
  }

  isInFlight(): boolean {
    return this.activeToken !== undefined;
  }
}
