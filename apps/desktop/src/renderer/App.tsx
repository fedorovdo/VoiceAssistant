import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Play, RefreshCw, Send, Settings, ShieldCheck, Square, Trash2, X } from "lucide-react";
import type {
  AnswerMode,
  AnswerSourceMode,
  AppLanguage,
  AssistantAnswerResponse,
  DesktopSettings,
  KnowledgeCard,
  KnowledgeCandidateDebug,
  LayoutMode,
  LiveAssistAction,
  LiveAssistIntent,
  LiveAssistSensitivity,
  LiveContextDecision,
  LiveProcessingEvent,
  LiveProcessingState,
  LiveTimingDiagnostics,
  NetworkingFocusedEntity,
  NetworkingFocusedResponseType,
  NetworkingSubtopic,
  FragmentClassification,
  SanitizedTranscript,
  SpeechToTextProviderId,
  TechnicalTopic,
  TranscriptSanitizationReason,
  UtteranceFlushReason,
  WorkMode
} from "@voiceassistant/shared";
import {
  ConversationContextBuffer,
  detectNetworkingContext,
  getNetworkingFocusedResponse,
  LiveAnswerRequestGate,
  lookupLocalKnowledge,
  migrateDesktopSettings,
  normalizeTechnicalTerms,
  NetworkingConversationContext,
  reduceLiveProcessingState,
  resolveLiveAssistDecision,
  resolveAnswerSource,
  sanitizeTranscript,
  SequentialRequestQueue,
  shouldSearchLocalKnowledge,
  shouldUseLocalOnlyFastPath,
  TranscriptDuplicateTracker,
  UtteranceBuffer
} from "@voiceassistant/shared";
import { createTranslator } from "./i18n.js";
import { MicrophoneLevelMeter } from "./MicrophoneLevelMeter.js";
import { createSpeechToTextProvider } from "./speech/createSpeechToTextProvider.js";
import type { RecognitionStatus } from "./speech/SpeechToTextProvider.js";
import { useChunkTranscription } from "./speech/useChunkTranscription.js";
import type { TranscriptionStatus } from "./speech/useChunkTranscription.js";
import { useMicrophoneRecorder } from "./speech/useMicrophoneRecorder.js";
import type { MicrophoneRecorderStatus } from "./speech/useMicrophoneRecorder.js";
import { normalizeSplitterRatio, usePanelSplitter } from "./usePanelSplitter.js";

const defaultSettings: DesktopSettings = {
  apiKey: "",
  model: "gpt-4.1-mini",
  interfaceLanguage: "ru",
  answerLanguage: "ru",
  audioInputDeviceId: "",
  answerMode: "short",
  answerSourceMode: "local-plus-gpt",
  liveAssistSensitivity: "balanced",
  workMode: "manual",
  layoutMode: "vertical",
  speechToTextProvider: "mock"
};

const settingsStorageKey = "voiceassistant.settings";
const splitterRatioStorageKey = "voiceassistant.splitterRatio";
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";
const liveDebounceMs = 650;
const liveThrottleMs = 2000;
// Disabled because Web Audio analysis currently interferes with experimental STT in Electron.
const enableMicrophoneVisualizer = false;

type DeviceStatus = "permission_hint" | "unavailable" | "none" | "found" | "error";
type PermissionState = "idle" | "requesting" | "success" | "error";
type PermissionMessage = "unavailable" | "granted" | "denied" | "not_found" | "error" | undefined;
type LiveFragmentSource = "mock" | "microphone";
type AnswerSource = "local" | "gpt" | undefined;
type SttCleanupStatus = "idle" | "accepted" | "skipped" | "waiting" | "duplicate";

interface TranscriptDecisionDiagnostics {
  rawTranscript: string;
  normalizedTranscript: string;
  sanitizerDecision: "accepted" | "rejected" | "duplicate";
  sanitizerReason: TranscriptSanitizationReason;
  technicalProtectionApplied: boolean;
  duplicateDetected: boolean;
  networkingNormalizationApplied: boolean;
  contextPreservedAfterNoise: boolean;
}

interface LiveDecisionDiagnostics {
  requestId: string;
  rawFragment: string;
  normalizedFragment: string;
  previousQuestion?: string;
  aggregatedFragment: string;
  topic: TechnicalTopic | null;
  classification: FragmentClassification;
  answerSourceMode: AnswerSourceMode;
  decision: LiveAssistAction;
  reason: string;
  cooldownRemainingMs: number;
  intent: LiveAssistIntent;
  localMatchFound: boolean;
  matchedCardId?: string;
  matchedCardTitle?: string;
  answerRendered: boolean;
  renderedAt?: number;
  renderReason?: string;
  localNormalizedQuery: string;
  localDebugCandidates: KnowledgeCandidateDebug[];
  localScoreThreshold: number;
  localTopicContextAdded: boolean;
  localQuerySource?: string;
  localSelectionReason?: string;
  sensitivity: LiveAssistSensitivity;
  decisionSource: LiveContextDecision["decisionSource"];
  pendingRequestText?: string;
  intentRescue: boolean;
  matchedQuestionPattern?: string;
  matchedTechnicalTerm?: string;
  processingStateBefore: LiveProcessingState;
  processingStateAfter: LiveProcessingState;
  answerInFlightBefore: boolean;
  answerInFlightAfter: boolean;
  duplicateKey?: string;
  duplicateReason?: string;
  exactDuplicate: boolean;
  selectedCardId?: string;
  previousSelectedCardId?: string;
  sameCardAsPrevious: boolean;
  cooldownType: "none" | "topic" | "gpt";
  cooldownBlocked: boolean;
  pendingRequestBefore?: string;
  pendingRequestAfter?: string;
  returnedToListening: boolean;
  broadTopic: "Networking" | null;
  previousSubtopic?: NetworkingSubtopic;
  detectedSubtopic?: NetworkingSubtopic;
  effectiveSubtopic?: NetworkingSubtopic;
  previousFocusedEntity?: NetworkingFocusedEntity;
  detectedFocusedEntity?: NetworkingFocusedEntity;
  effectiveFocusedEntity?: NetworkingFocusedEntity;
  contextAgeMs?: number;
  contextUsedForFollowUp: boolean;
  contextPreservedAfterNoise: boolean;
  focusedResponseType?: NetworkingFocusedResponseType;
}

interface UtteranceDiagnostics {
  pendingText: string;
  flushedText: string;
  flushReason?: UtteranceFlushReason;
}

interface LastRenderedLiveAnswer {
  requestId: string;
  question: string;
  selectedCardId?: string;
  renderedAt: number;
}

interface QueuedLiveRequest {
  requestId: string;
  transcriptEventId: string;
  fragment: string;
  source: LiveFragmentSource;
  rawFragment: string;
  contextUsedForFollowUp: boolean;
}

interface LiveTranscriptEventTrace {
  transcriptEventId: string;
  requestId?: string;
  rawTranscript: string;
  normalizedTranscript: string;
  receivedAt: number;
  sanitizerDecision: string;
  utteranceDecision?: string;
  intent?: LiveAssistIntent;
  broadTopic?: string | null;
  networkingSubtopic?: NetworkingSubtopic;
  focusedEntity?: NetworkingFocusedEntity;
  duplicateDecision?: string;
  cooldownDecision?: string;
  lookupStarted?: boolean;
  lookupFinished?: boolean;
  selectedCardId?: string;
  focusedAnswerType?: NetworkingFocusedResponseType;
  answerRequestStarted?: number;
  answerRequestFinished?: number;
  setAnswerCalled?: boolean;
  answerRevisionBefore?: number;
  answerRevisionAfter?: number;
  answerInFlightBefore?: boolean;
  answerInFlightAfter?: boolean;
  pendingRequestBefore?: string;
  pendingRequestAfter?: string;
  processingStateBefore?: LiveProcessingState;
  processingStateAfter?: LiveProcessingState;
  returnedToListening?: boolean;
  rejectionReason?: string;
  queueDecision?: "accepted" | "queue_full" | "started" | "finished" | "cleared";
  queuePendingBefore?: number;
  queuePendingAfter?: number;
}

export function App() {
  const [settings, setSettings] = useState<DesktopSettings>(loadSettings);
  const [splitterRatio, setSplitterRatio] = useState(loadSplitterRatio);
  const t = useMemo(() => createTranslator(settings.interfaceLanguage), [settings.interfaceLanguage]);
  const speechToTextProvider = useMemo(
    () => createSpeechToTextProvider(settings.speechToTextProvider),
    [settings.speechToTextProvider]
  );
  const [recognizedText, setRecognizedText] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerRenderRevision, setAnswerRenderRevision] = useState(0);
  const [answerSource, setAnswerSource] = useState<AnswerSource>();
  const [localAnswerCards, setLocalAnswerCards] = useState<KnowledgeCard[]>([]);
  const [focusedLocalAnswer, setFocusedLocalAnswer] = useState("");
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus>("stopped");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isSearchingLocal, setIsSearchingLocal] = useState(false);
  const [error, setError] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [normalizedTerms, setNormalizedTerms] = useState<string[]>([]);
  const [liveDecisionDiagnostics, setLiveDecisionDiagnostics] = useState<LiveDecisionDiagnostics>();
  const [utteranceDiagnostics, setUtteranceDiagnostics] = useState<UtteranceDiagnostics>({
    pendingText: "",
    flushedText: ""
  });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [sttCleanupStatus, setSttCleanupStatus] = useState<SttCleanupStatus>("idle");
  const [transcriptDecisionDiagnostics, setTranscriptDecisionDiagnostics] = useState<TranscriptDecisionDiagnostics>();
  const [liveProcessingState, setLiveProcessingState] = useState<LiveProcessingState>("idle");
  const [liveTimingDiagnostics, setLiveTimingDiagnostics] = useState<LiveTimingDiagnostics>({});
  const [queuedLiveRequestCount, setQueuedLiveRequestCount] = useState(0);
  const [lastLiveEventTrace, setLastLiveEventTrace] = useState<LiveTranscriptEventTrace>();
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("permission_hint");
  const [permissionState, setPermissionState] = useState<PermissionState>("idle");
  const [permissionMessage, setPermissionMessage] = useState<PermissionMessage>();
  const [liveContextStatus, setLiveContextStatus] = useState<{ currentTopic: TechnicalTopic | null; fragmentCount: number }>({
    currentTopic: null,
    fragmentCount: 0
  });
  const liveFragmentHandlerRef = useRef<(fragment: string, source: LiveFragmentSource, rawFragment: string, contextUsed: boolean, transcriptEventId: string) => void>(() => undefined);
  const conversationContextRef = useRef(new ConversationContextBuffer());
  const networkingContextRef = useRef(new NetworkingConversationContext());
  const utteranceBufferRef = useRef(new UtteranceBuffer());
  const utteranceSourceRef = useRef<LiveFragmentSource>("microphone");
  const utteranceNetworkingContextUsedRef = useRef(false);
  const utteranceTranscriptEventIdRef = useRef<string>();
  const utteranceTimerRef = useRef<number>();
  const pendingMicrophoneFragmentsRef = useRef<string[]>([]);
  const transcriptDuplicateTrackerRef = useRef(new TranscriptDuplicateTracker());
  const liveTimingRef = useRef<LiveTimingDiagnostics>({});
  const lastAudioChunkCreatedAtRef = useRef<number>();
  const liveProcessingStateRef = useRef<LiveProcessingState>("idle");
  const processingSettleTimerRef = useRef<number>();
  const answerRequestGateRef = useRef(new LiveAnswerRequestGate());
  const answerRevisionRef = useRef(0);
  const liveAnswerQueueRef = useRef(new SequentialRequestQueue<QueuedLiveRequest>({ maxPending: 5 }));
  const drainLiveAnswerQueueRef = useRef<() => void>(() => undefined);
  const processQueuedLiveRequestRef = useRef<(request: QueuedLiveRequest) => void>(() => undefined);
  const liveRequestSequenceRef = useRef(0);
  const transcriptEventSequenceRef = useRef(0);
  const liveEventTraceRef = useRef(new Map<string, LiveTranscriptEventTrace>());
  const lastRenderedLiveAnswerRef = useRef<LastRenderedLiveAnswer>();
  const transitionLiveProcessing = useCallback((event: LiveProcessingEvent) => {
    const terminalEvent = event === "answer_rendered"
      || event === "duplicate_detected"
      || event === "local_match_missing"
      || event === "processing_failed"
      || event === "settled";
    if (!terminalEvent && processingSettleTimerRef.current !== undefined) {
      window.clearTimeout(processingSettleTimerRef.current);
      processingSettleTimerRef.current = undefined;
    }
    const next = reduceLiveProcessingState(liveProcessingStateRef.current, event);
    liveProcessingStateRef.current = next;
    setLiveProcessingState(next);
  }, []);
  const scheduleReturnToListening = useCallback((delayMs = 1_200) => {
    if (processingSettleTimerRef.current !== undefined) {
      window.clearTimeout(processingSettleTimerRef.current);
    }
    processingSettleTimerRef.current = window.setTimeout(() => {
      processingSettleTimerRef.current = undefined;
      transitionLiveProcessing("settled");
      setRecognitionMessage("");
      setLiveDecisionDiagnostics((current) => current ? {
        ...current,
        processingStateAfter: "listening",
        answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
        pendingRequestAfter: conversationContextRef.current.getPendingRequestText(),
        returnedToListening: true
      } : current);
    }, delayMs);
  }, [transitionLiveProcessing]);
  const returnToListeningNow = useCallback(() => {
    transitionLiveProcessing("settled");
    setLiveDecisionDiagnostics((current) => current ? {
      ...current,
      processingStateAfter: "listening",
      answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
      pendingRequestAfter: conversationContextRef.current.getPendingRequestText(),
      returnedToListening: true
    } : current);
  }, [transitionLiveProcessing]);
  const beginLiveTimingCycle = useCallback((timestamp: number) => {
    if (!import.meta.env.DEV) return;
    const next = { audioChunkCreatedAt: timestamp };
    liveTimingRef.current = next;
    setLiveTimingDiagnostics(next);
  }, []);
  const markLiveTiming = useCallback((
    field: Exclude<keyof LiveTimingDiagnostics, "totalFromLastChunkMs">,
    timestamp = Date.now()
  ) => {
    if (!import.meta.env.DEV) return;
    const next: LiveTimingDiagnostics = { ...liveTimingRef.current, [field]: timestamp };
    if (field === "answerRenderedAt" && next.audioChunkCreatedAt !== undefined) {
      next.totalFromLastChunkMs = timestamp - next.audioChunkCreatedAt;
    }
    liveTimingRef.current = next;
    setLiveTimingDiagnostics(next);
  }, []);
  const updateLiveEventTrace = useCallback((eventId: string, patch: Partial<LiveTranscriptEventTrace>) => {
    if (!import.meta.env.DEV) return;
    const current = liveEventTraceRef.current.get(eventId);
    if (!current) return;
    const next = { ...current, ...patch };
    liveEventTraceRef.current.set(eventId, next);
    setLastLiveEventTrace(next);
    console.debug("[VoiceAssistant Live trace]", next);
  }, []);
  const createLiveEventTrace = useCallback((rawTranscript: string, receivedAt: number) => {
    const transcriptEventId = `transcript-${++transcriptEventSequenceRef.current}`;
    if (import.meta.env.DEV) {
      const trace: LiveTranscriptEventTrace = {
        transcriptEventId,
        rawTranscript,
        normalizedTranscript: rawTranscript,
        receivedAt,
        sanitizerDecision: "pending",
        lookupStarted: false,
        lookupFinished: false,
        setAnswerCalled: false,
        returnedToListening: false
      };
      liveEventTraceRef.current.set(transcriptEventId, trace);
      setLastLiveEventTrace(trace);
    }
    return transcriptEventId;
  }, []);
  const bumpAnswerRevision = useCallback(() => {
    const before = answerRevisionRef.current;
    const after = before + 1;
    answerRevisionRef.current = after;
    setAnswerRenderRevision(after);
    return { before, after };
  }, []);
  const processRecognizedFragment = useCallback((rawText: string, source: LiveFragmentSource) => {
    const now = Date.now();
    const transcriptEventId = createLiveEventTrace(rawText, now);
    const contextSnapshot = conversationContextRef.current.getSnapshot();
    const networkingSnapshot = networkingContextRef.current.getSnapshot(now);
    const normalizationContext = {
      currentTopic: contextSnapshot.currentTopic,
      contextText: [
        contextSnapshot.fragments.slice(-3).map((fragment) => fragment.text).join(" "),
        networkingSnapshot.lastValidQuestion
      ].filter(Boolean).join(" ")
    };
    const earlyTechnicalText = normalizeTechnicalTerms(rawText, normalizationContext);
    const earlyFollowUp = networkingContextRef.current.enrichFollowUp(earlyTechnicalText.text, now);
    const sanitized = sanitizeTranscript(earlyFollowUp.text, settings.answerLanguage);
    updateLiveEventTrace(transcriptEventId, {
      normalizedTranscript: sanitized.text,
      sanitizerDecision: sanitized.shouldUse ? "accepted" : sanitized.reason,
      rejectionReason: sanitized.shouldUse ? undefined : sanitized.reason
    });
    setTranscriptDecisionDiagnostics({
      rawTranscript: rawText,
      normalizedTranscript: sanitized.text,
      sanitizerDecision: sanitized.shouldUse ? "accepted" : "rejected",
      sanitizerReason: sanitized.reason,
      technicalProtectionApplied: sanitized.technicalProtectionApplied,
      duplicateDetected: false,
      networkingNormalizationApplied: earlyTechnicalText.replacements.some((replacement) => replacement.to === "OSI" || replacement.to === "TCP/IP"),
      contextPreservedAfterNoise: !sanitized.shouldUse && networkingSnapshot.broadTopic === "Networking"
    });

    const shortLiveContinuation = settings.workMode === "live"
      && sanitized.reason === "too_short"
      && utteranceBufferRef.current.getPendingUtterance().length > 0;

    if (!sanitized.shouldUse && sanitized.reason !== "incomplete" && !shortLiveContinuation) {
      setSttCleanupStatus("skipped");
      if (!liveAnswerQueueRef.current.getActive()) setRecognitionMessage(t("sttNoiseSkipped"));
      if (settings.workMode === "live" && !liveAnswerQueueRef.current.getActive()) transitionLiveProcessing("listening_started");
      updateLiveEventTrace(transcriptEventId, {
        utteranceDecision: "rejected_before_buffer",
        processingStateAfter: settings.workMode === "live" ? "listening" : liveProcessingStateRef.current,
        returnedToListening: settings.workMode === "live"
      });
      return;
    }

    let candidate: SanitizedTranscript = shortLiveContinuation
      ? { text: sanitized.text, shouldUse: true, reason: "accepted", quality: "short_technical", technicalProtectionApplied: false }
      : sanitized;
    if (source === "microphone") {
      const pendingFragments = pendingMicrophoneFragmentsRef.current;
      if (sanitized.reason === "incomplete") {
        const nextFragments = [...pendingFragments, sanitized.text].slice(-2);
        candidate = sanitizeTranscript(nextFragments.join(" "), settings.answerLanguage);
        if (!candidate.shouldUse) {
          pendingMicrophoneFragmentsRef.current = nextFragments;
          setSttCleanupStatus("waiting");
          if (!liveAnswerQueueRef.current.getActive()) {
            setRecognitionMessage(t("sttWaitingMoreContext"));
            transitionLiveProcessing("fragment_buffered");
          }
          updateLiveEventTrace(transcriptEventId, {
            utteranceDecision: "waiting_for_context",
            processingStateAfter: "collecting",
            rejectionReason: candidate.reason
          });
          return;
        }
      } else if (pendingFragments.length > 0) {
        candidate = sanitizeTranscript([...pendingFragments, sanitized.text].join(" "), settings.answerLanguage);
        if (!candidate.shouldUse) {
          pendingMicrophoneFragmentsRef.current = [...pendingFragments, sanitized.text].slice(-2);
          setSttCleanupStatus(candidate.reason === "incomplete" ? "waiting" : "skipped");
          if (!liveAnswerQueueRef.current.getActive()) {
            setRecognitionMessage(candidate.reason === "incomplete" ? t("sttWaitingMoreContext") : t("sttNoiseSkipped"));
            transitionLiveProcessing(candidate.reason === "incomplete" ? "fragment_buffered" : "listening_started");
          }
          updateLiveEventTrace(transcriptEventId, {
            utteranceDecision: candidate.reason === "incomplete" ? "waiting_for_context" : "rejected_combined_fragment",
            processingStateAfter: candidate.reason === "incomplete" ? "collecting" : "listening",
            rejectionReason: candidate.reason
          });
          return;
        }
      }

      pendingMicrophoneFragmentsRef.current = [];
    }

    const technicalText = normalizeTechnicalTerms(candidate.text, normalizationContext);
    const finalFollowUp = networkingContextRef.current.enrichFollowUp(technicalText.text, now);
    const acceptedText = finalFollowUp.text;
    const networkingContextUsed = earlyFollowUp.contextUsed || finalFollowUp.contextUsed;
    const normalizedCandidate = normalizeTranscriptForComparison(acceptedText);
    if (!normalizedCandidate) {
      setSttCleanupStatus("skipped");
      if (!liveAnswerQueueRef.current.getActive()) setRecognitionMessage(t("sttNoiseSkipped"));
      if (settings.workMode === "live" && !liveAnswerQueueRef.current.getActive()) transitionLiveProcessing("listening_started");
      updateLiveEventTrace(transcriptEventId, {
        utteranceDecision: "empty_after_normalization",
        processingStateAfter: settings.workMode === "live" ? "listening" : liveProcessingStateRef.current,
        rejectionReason: "empty_after_normalization"
      });
      return;
    }

    const duplicateDetected = transcriptDuplicateTrackerRef.current.checkAndRemember(acceptedText);
    setTranscriptDecisionDiagnostics({
      rawTranscript: rawText,
      normalizedTranscript: acceptedText,
      sanitizerDecision: duplicateDetected ? "duplicate" : "accepted",
      sanitizerReason: candidate.reason,
      technicalProtectionApplied: candidate.technicalProtectionApplied,
      duplicateDetected,
      networkingNormalizationApplied: [...earlyTechnicalText.replacements, ...technicalText.replacements]
        .some((replacement) => replacement.to === "OSI" || replacement.to === "TCP/IP"),
      contextPreservedAfterNoise: false
    });
    if (duplicateDetected) {
      const requestId = `live-${++liveRequestSequenceRef.current}`;
      const previousRenderedAnswer = lastRenderedLiveAnswerRef.current;
      const activeRequest = liveAnswerQueueRef.current.getActive();
      setSttCleanupStatus("duplicate");
      if (!activeRequest) setRecognitionMessage(t("sttDuplicate"));
      if (settings.workMode === "live" && !activeRequest) {
        const processingStateBefore = liveProcessingStateRef.current;
        transitionLiveProcessing("duplicate_detected");
        setLiveDecisionDiagnostics((current) => current ? {
          ...current,
          processingStateBefore,
          processingStateAfter: "duplicate",
          answerInFlightBefore: answerRequestGateRef.current.isInFlight(),
          answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
          requestId,
          previousQuestion: previousRenderedAnswer?.question,
          duplicateKey: normalizedCandidate,
          duplicateReason: "exact_transcript",
          exactDuplicate: true,
          selectedCardId: undefined,
          previousSelectedCardId: previousRenderedAnswer?.selectedCardId,
          sameCardAsPrevious: false,
          renderReason: "exact_duplicate_blocked",
          cooldownType: "none",
          cooldownBlocked: false,
          pendingRequestBefore: conversationContextRef.current.getPendingRequestText(),
          pendingRequestAfter: conversationContextRef.current.getPendingRequestText(),
          answerRendered: false,
          returnedToListening: false
        } : current);
        scheduleReturnToListening(900);
      }
      updateLiveEventTrace(transcriptEventId, {
        requestId,
        normalizedTranscript: acceptedText,
        sanitizerDecision: "accepted",
        utteranceDecision: "exact_duplicate_before_queue",
        duplicateDecision: "blocked_exact_duplicate",
        answerInFlightBefore: answerRequestGateRef.current.isInFlight(),
        answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
        processingStateAfter: settings.workMode === "live" && !activeRequest ? "duplicate" : liveProcessingStateRef.current,
        rejectionReason: "exact_duplicate"
      });
      return;
    }

    setNormalizedTerms(getNormalizedTermTargets([...earlyTechnicalText.replacements, ...technicalText.replacements]));
    setRecognizedText((currentText) => appendRecognizedText(currentText, acceptedText));
    setSttCleanupStatus("accepted");
    if (!liveAnswerQueueRef.current.getActive()) setRecognitionMessage("");
    updateLiveEventTrace(transcriptEventId, {
      normalizedTranscript: acceptedText,
      sanitizerDecision: "accepted",
      duplicateDecision: "accepted"
    });
    liveFragmentHandlerRef.current(acceptedText, source, candidate.text, networkingContextUsed, transcriptEventId);
  }, [createLiveEventTrace, scheduleReturnToListening, settings.answerLanguage, settings.workMode, t, transitionLiveProcessing, updateLiveEventTrace]);
  const handleTranscript = useCallback((text: string) => {
    processRecognizedFragment(text, "microphone");
  }, [processRecognizedFragment]);
  const handleTranscriptionStarted = useCallback((timestamp: number) => {
    beginLiveTimingCycle(lastAudioChunkCreatedAtRef.current ?? timestamp);
    markLiveTiming("transcriptionStartedAt", timestamp);
    if (settings.workMode === "live") transitionLiveProcessing("transcription_started");
  }, [beginLiveTimingCycle, markLiveTiming, settings.workMode, transitionLiveProcessing]);
  const handleTranscriptionCompleted = useCallback((timestamp: number) => {
    markLiveTiming("transcriptionCompletedAt", timestamp);
  }, [markLiveTiming]);
  const chunkTranscription = useChunkTranscription({
    backendUrl,
    apiKey: settings.apiKey,
    language: settings.answerLanguage,
    onTranscript: handleTranscript,
    onTranscriptionStarted: handleTranscriptionStarted,
    onTranscriptionCompleted: handleTranscriptionCompleted
  });
  const handleAudioChunk = useCallback((chunk: Blob) => {
    lastAudioChunkCreatedAtRef.current = Date.now();
    void chunkTranscription.transcribeChunk(chunk);
  }, [chunkTranscription.transcribeChunk]);
  const microphoneRecorder = useMicrophoneRecorder({
    onChunk: handleAudioChunk,
    enableAudioLevel: enableMicrophoneVisualizer
  });
  const liveTimerRef = useRef<number>();
  const lastLiveAnswerAtRef = useRef(0);
  const isMicrophoneActive = microphoneRecorder.status === "recording" || microphoneRecorder.status === "requesting_permission";
  const isListening = recognitionStatus === "listening" || isMicrophoneActive;

  const persistSplitterRatio = useCallback((ratio: number) => {
    localStorage.setItem(splitterRatioStorageKey, String(ratio));
  }, []);
  const panelSplitter = usePanelSplitter({
    mode: settings.layoutMode,
    ratio: splitterRatio,
    onRatioChange: setSplitterRatio,
    onRatioCommit: persistSplitterRatio
  });

  const statusText = getMainStatusText(settings.speechToTextProvider, recognitionStatus, microphoneRecorder.status, t);

  const selectedAudioDeviceLabel = useMemo(() => {
    if (!settings.audioInputDeviceId) {
      return t("systemDefaultMicrophone");
    }

    const selectedIndex = audioInputDevices.findIndex(
      (device) => device.deviceId === settings.audioInputDeviceId
    );

    return selectedIndex === -1
      ? t("selectedMicrophone")
      : getAudioDeviceLabel(audioInputDevices[selectedIndex], selectedIndex);
  }, [audioInputDevices, settings.audioInputDeviceId, t]);

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setAudioInputDevices([]);
      setDeviceStatus("unavailable");
      return;
    }

    setIsRefreshingDevices(true);

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");
      setAudioInputDevices(audioInputs);

      if (audioInputs.length === 0) {
        setDeviceStatus("none");
      } else if (audioInputs.some((device) => device.label.length === 0)) {
        setDeviceStatus("permission_hint");
      } else {
        setDeviceStatus("found");
      }
    } catch {
      setAudioInputDevices([]);
      setDeviceStatus("error");
    } finally {
      setIsRefreshingDevices(false);
    }
  }, []);

  const showLocalAnswer = useCallback((cards: KnowledgeCard[], focusedAnswer = "") => {
    setAnswer(formatKnowledgeCards(cards, settings.answerLanguage));
    setLocalAnswerCards(cards);
    setFocusedLocalAnswer(focusedAnswer);
    setAnswerSource("local");
    const revision = bumpAnswerRevision();
    setError("");
    return revision;
  }, [bumpAnswerRevision, settings.answerLanguage]);

  const requestAnswer = useCallback(async (
    text: string,
    workMode: WorkMode,
    preserveLocalAnswer = false,
    isCurrent: () => boolean = () => true
  ): Promise<boolean> => {
    const trimmedText = text.trim();
    if (!trimmedText) return false;
    const gateToken = answerRequestGateRef.current.tryAcquire();
    if (gateToken === undefined) return false;

    setLiveDecisionDiagnostics((current) => current ? {
      ...current,
      answerInFlightBefore: false,
      answerInFlightAfter: true
    } : current);
    setIsAsking(true);
    setError("");
    if (!preserveLocalAnswer) {
      setLocalAnswerCards([]);
      setFocusedLocalAnswer("");
      setAnswerSource(undefined);
    }

    try {
      const response = await fetch(`${backendUrl}/api/assistant/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmedText,
          mode: settings.answerMode,
          model: settings.model,
          apiKey: settings.apiKey,
          workMode,
          answerLanguage: settings.answerLanguage
        })
      });
      const data = (await response.json()) as AssistantAnswerResponse | { error: string };

      if (!response.ok) {
        throw new Error("error" in data ? data.error : t("permissionError"));
      }

      if (!isCurrent()) return false;

      setAnswer("answer" in data ? data.answer : "");
      setLocalAnswerCards([]);
      setFocusedLocalAnswer("");
      setAnswerSource(settings.apiKey.trim() ? "gpt" : undefined);
      bumpAnswerRevision();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("permissionError"));
      return false;
    } finally {
      answerRequestGateRef.current.finish(gateToken);
      setLiveDecisionDiagnostics((current) => current ? {
        ...current,
        answerInFlightAfter: false
      } : current);
      setIsAsking(false);
    }
  }, [bumpAnswerRevision, settings.answerLanguage, settings.answerMode, settings.apiKey, settings.model, t]);

  const finishQueuedLiveRequest = useCallback((request: QueuedLiveRequest, delayMs = 1_200) => {
    const queue = liveAnswerQueueRef.current;
    if (queue.getActive()?.requestId !== request.requestId) return;

    queue.finishActive(request);
    const pendingAfter = queue.getPendingCount();
    setQueuedLiveRequestCount(pendingAfter);
    updateLiveEventTrace(request.transcriptEventId, {
      answerRequestFinished: Date.now(),
      answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
      pendingRequestAfter: conversationContextRef.current.getPendingRequestText(),
      processingStateAfter: liveProcessingStateRef.current,
      queueDecision: "finished",
      queuePendingAfter: pendingAfter
    });

    if (pendingAfter > 0) {
      returnToListeningNow();
      updateLiveEventTrace(request.transcriptEventId, { returnedToListening: true });
      window.setTimeout(() => drainLiveAnswerQueueRef.current(), 0);
      return;
    }

    scheduleReturnToListening(delayMs);
    window.setTimeout(() => updateLiveEventTrace(request.transcriptEventId, { returnedToListening: true }), delayMs);
  }, [returnToListeningNow, scheduleReturnToListening, updateLiveEventTrace]);

  const processQueuedLiveAnswer = useCallback((request: QueuedLiveRequest) => {
    const { requestId, transcriptEventId, fragment, source, rawFragment, contextUsedForFollowUp } = request;
    if (settings.workMode !== "live" || liveAnswerQueueRef.current.getActive()?.requestId !== requestId) {
      finishQueuedLiveRequest(request, 0);
      return;
    }
    void source;
    const previousRenderedAnswer = lastRenderedLiveAnswerRef.current;
    const processingStateBefore = liveProcessingStateRef.current;
    const answerInFlightBefore = answerRequestGateRef.current.isInFlight();
    const pendingRequestBefore = conversationContextRef.current.getPendingRequestText();
    if (import.meta.env.DEV) {
      console.assert(!answerInFlightBefore, "A queued Live request started while the answer gate was still active.", { requestId });
    }
    transitionLiveProcessing("utterance_flushed");
    updateLiveEventTrace(transcriptEventId, {
      answerRequestStarted: Date.now(),
      answerInFlightBefore,
      pendingRequestBefore,
      processingStateBefore,
      processingStateAfter: liveProcessingStateRef.current,
      queueDecision: "started",
      queuePendingBefore: liveAnswerQueueRef.current.getPendingCount()
    });

    const decisionTimestamp = Date.now();
    const previousNetworking = networkingContextRef.current.getSnapshot(decisionTimestamp);
    const detectedNetworking = detectNetworkingContext(fragment);
    const contextDecision = conversationContextRef.current.add(fragment, decisionTimestamp, settings.liveAssistSensitivity);
    const shouldUpdateNetworking = (contextDecision.intent === "answer_request" || contextDecision.intent === "topic_intro")
      && contextDecision.reason !== "duplicate"
      && !contextDecision.shouldWait
      && (contextDecision.currentTopic === "Networking" || contextDecision.currentTopic === "DNS/DHCP");
    const networkingTransition = shouldUpdateNetworking
      ? networkingContextRef.current.accept(fragment, decisionTimestamp)
      : { previous: previousNetworking, detected: detectedNetworking, effective: previousNetworking };
    setLiveContextStatus({
      currentTopic: contextDecision.currentTopic,
      fragmentCount: contextDecision.fragments.length
    });

    const knowledgeFragment = contextDecision.decisionSource === "pending_context"
      ? contextDecision.pendingRequestText ?? fragment
      : fragment;
    const canAttemptLocalFastPath = settings.answerSourceMode === "local-only"
      && contextDecision.intent === "answer_request"
      && !contextDecision.shouldWait
      && contextDecision.reason !== "duplicate";
    const distinctCooldownRequest = contextDecision.intent === "answer_request"
      && contextDecision.reason === "topic_cooldown";
    const shouldRunLocalLookup = shouldSearchLocalKnowledge(settings.answerSourceMode)
      && (contextDecision.shouldAnswer || canAttemptLocalFastPath || distinctCooldownRequest);
    if (shouldRunLocalLookup) {
      setRecognitionMessage(t("liveStatusSearchingLocal"));
      transitionLiveProcessing("local_lookup_started");
      markLiveTiming("localLookupStartedAt");
    }
    const localLookup = shouldRunLocalLookup
      ? lookupLocalKnowledge(knowledgeFragment, {
        aggregatedText: contextDecision.aggregatedText,
        currentTopic: contextDecision.currentTopic
      })
      : undefined;
    if (localLookup) markLiveTiming("localLookupCompletedAt");
    const knowledgeMatches = localLookup?.matches ?? [];
    const focusedResponse = getNetworkingFocusedResponse(knowledgeFragment, settings.answerLanguage);
    const localFastPath = shouldUseLocalOnlyFastPath(
      settings.answerSourceMode,
      contextDecision,
      knowledgeMatches.length > 0
    );
    const policyDecision = resolveLiveAssistDecision({
      contextDecision: localFastPath || distinctCooldownRequest
        ? { ...contextDecision, shouldAnswer: true, reason: "answer" }
        : contextDecision,
      answerSourceMode: settings.answerSourceMode,
      hasLocalMatch: knowledgeMatches.length > 0,
      hasApiKey: settings.apiKey.trim().length > 0,
      answerMode: settings.answerMode
    });
    updateLiveEventTrace(transcriptEventId, {
      intent: contextDecision.intent,
      broadTopic: networkingTransition.effective.broadTopic,
      networkingSubtopic: networkingTransition.effective.subtopic,
      focusedEntity: networkingTransition.effective.focusedEntity,
      duplicateDecision: policyDecision.action === "duplicate" ? policyDecision.reason : "not_duplicate",
      cooldownDecision: policyDecision.action === "cooldown" ? policyDecision.reason : "not_blocked",
      lookupStarted: shouldRunLocalLookup,
      lookupFinished: shouldRunLocalLookup,
      selectedCardId: knowledgeMatches[0]?.id,
      focusedAnswerType: focusedResponse?.type
    });

    setLiveDecisionDiagnostics(createLiveDecisionDiagnostics(
      rawFragment,
      fragment,
      contextDecision,
      settings.answerSourceMode,
      policyDecision.action,
      policyDecision.reason,
      knowledgeMatches,
      localLookup,
      {
        requestId,
        previousQuestion: previousRenderedAnswer?.question,
        processingStateBefore,
        processingStateAfter: liveProcessingStateRef.current,
        answerInFlightBefore,
        answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
        duplicateKey: policyDecision.action === "duplicate" ? contextDecision.normalizedText : undefined,
        duplicateReason: policyDecision.action === "duplicate" ? "exact_answered_utterance" : undefined,
        exactDuplicate: policyDecision.action === "duplicate",
        selectedCardId: knowledgeMatches[0]?.id,
        previousSelectedCardId: previousRenderedAnswer?.selectedCardId,
        sameCardAsPrevious: Boolean(knowledgeMatches[0]?.id && knowledgeMatches[0]?.id === previousRenderedAnswer?.selectedCardId),
        cooldownType: policyDecision.action === "cooldown" ? "topic" : "none",
        cooldownBlocked: policyDecision.action === "cooldown",
        pendingRequestBefore,
        pendingRequestAfter: conversationContextRef.current.getPendingRequestText(),
        returnedToListening: false,
        broadTopic: networkingTransition.effective.broadTopic,
        previousSubtopic: networkingTransition.previous.subtopic,
        detectedSubtopic: networkingTransition.detected.subtopic,
        effectiveSubtopic: networkingTransition.effective.subtopic,
        previousFocusedEntity: networkingTransition.previous.focusedEntity,
        detectedFocusedEntity: networkingTransition.detected.focusedEntity,
        effectiveFocusedEntity: networkingTransition.effective.focusedEntity,
        contextAgeMs: networkingTransition.effective.ageMs,
        contextUsedForFollowUp,
        contextPreservedAfterNoise: !shouldUpdateNetworking && previousNetworking.broadTopic === "Networking",
        focusedResponseType: focusedResponse?.type
      }
    ));

    if (policyDecision.action === "topic_intro") {
      setRecognitionMessage(t("liveStatusTopicDetected"));
      finishQueuedLiveRequest(request, 0);
      return;
    }
    if (policyDecision.action === "wait") {
      setRecognitionMessage(t("liveStatusWaiting"));
      transitionLiveProcessing("fragment_buffered");
      finishQueuedLiveRequest(request);
      return;
    }
    if (policyDecision.action === "duplicate") {
      setRecognitionMessage(t("sttDuplicate"));
      transitionLiveProcessing("duplicate_detected");
      finishQueuedLiveRequest(request, 900);
      return;
    }
    if (policyDecision.action === "cooldown") {
      setRecognitionMessage(t("liveStatusCooldown"));
      finishQueuedLiveRequest(request, 0);
      return;
    }
    if (policyDecision.action === "ignore") {
      setRecognitionMessage(t("liveFragmentIgnored"));
      finishQueuedLiveRequest(request, 0);
      return;
    }
    if (policyDecision.action === "no_local_match") {
      conversationContextRef.current.clearPendingRequest();
      setRecognitionMessage(t("liveStatusNoLocalMatch"));
      transitionLiveProcessing("local_match_missing");
      updateLiveEventTrace(transcriptEventId, { rejectionReason: "no_local_match" });
      finishQueuedLiveRequest(request);
      return;
    }
    if (policyDecision.action === "missing_api_key") {
      conversationContextRef.current.clearPendingRequest();
      setRecognitionMessage(t("liveStatusMissingApiKey"));
      transitionLiveProcessing("local_match_missing");
      updateLiveEventTrace(transcriptEventId, { rejectionReason: "missing_api_key" });
      finishQueuedLiveRequest(request);
      return;
    }

    const answerText = contextDecision.aggregatedText;
    const resolution = policyDecision.sourceResolution;

    if (resolution === "local" || resolution === "local-and-gpt") {
      const renderedAt = Date.now();
      const selectedCardId = knowledgeMatches[0]?.id;
      const revision = showLocalAnswer(knowledgeMatches, focusedResponse?.text);
      updateLiveEventTrace(transcriptEventId, {
        setAnswerCalled: true,
        answerRevisionBefore: revision.before,
        answerRevisionAfter: revision.after
      });
      conversationContextRef.current.markAnswered(contextDecision);
      lastRenderedLiveAnswerRef.current = { requestId, question: fragment, selectedCardId, renderedAt };
      lastLiveAnswerAtRef.current = renderedAt;
      setLiveDecisionDiagnostics((current) => current ? {
        ...current,
        answerRendered: true,
        renderedAt,
        renderReason: current.sameCardAsPrevious ? "distinct_request_same_card" : "new_local_answer"
      } : current);
      setRecognitionMessage(resolution === "local" ? t("liveStatusLocalFound") : t("enrichingWithGpt"));
      markLiveTiming("answerRenderedAt");
      transitionLiveProcessing("answer_rendered");
      setLiveDecisionDiagnostics((current) => current ? {
        ...current,
        processingStateAfter: "answered",
        answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
        pendingRequestAfter: conversationContextRef.current.getPendingRequestText()
      } : current);
    } else {
      setRecognitionMessage(t("utteranceCollectedSearching"));
    }

    if (resolution === "local") {
      finishQueuedLiveRequest(request);
      return;
    }

    const throttleDelay = Math.max(0, liveThrottleMs - (Date.now() - lastLiveAnswerAtRef.current));
    setLiveDecisionDiagnostics((current) => current ? {
      ...current,
      cooldownType: throttleDelay > 0 ? "gpt" : "none",
      cooldownBlocked: throttleDelay > 0
    } : current);
    transitionLiveProcessing("gpt_request_started");
    liveTimerRef.current = window.setTimeout(async () => {
      liveTimerRef.current = undefined;
      if (liveAnswerQueueRef.current.getActive()?.requestId !== requestId) return;
      if (!resolution) {
        updateLiveEventTrace(transcriptEventId, { rejectionReason: "missing_source_resolution" });
        transitionLiveProcessing("processing_failed");
        finishQueuedLiveRequest(request);
        return;
      }
      lastLiveAnswerAtRef.current = Date.now();

      markLiveTiming("gptRequestStartedAt");
      const sent = await requestAnswer(
        answerText,
        "live",
        resolution === "local-and-gpt",
        () => liveAnswerQueueRef.current.getActive()?.requestId === requestId
      );
      markLiveTiming("gptRequestCompletedAt");
      if (liveAnswerQueueRef.current.getActive()?.requestId !== requestId) return;
      if (!sent && resolution === "gpt") {
        conversationContextRef.current.clearPendingRequest();
      } else if (resolution === "gpt") {
        conversationContextRef.current.markAnswered(contextDecision);
      }
      if (sent) {
        const renderedAt = Date.now();
        lastRenderedLiveAnswerRef.current = {
          requestId,
          question: fragment,
          selectedCardId: knowledgeMatches[0]?.id,
          renderedAt
        };
        const revision = { before: Math.max(0, answerRevisionRef.current - 1), after: answerRevisionRef.current };
        updateLiveEventTrace(transcriptEventId, {
          setAnswerCalled: true,
          answerRevisionBefore: revision.before,
          answerRevisionAfter: revision.after
        });
        setLiveDecisionDiagnostics((current) => current ? {
          ...current,
          answerRendered: true,
          renderedAt,
          renderReason: resolution === "local-and-gpt" ? "gpt_enrichment" : "new_gpt_answer"
        } : current);
        markLiveTiming("answerRenderedAt");
        transitionLiveProcessing("answer_rendered");
      } else {
        transitionLiveProcessing("processing_failed");
      }
      setRecognitionMessage("");
      setLiveDecisionDiagnostics((current) => current ? {
        ...current,
        processingStateAfter: sent ? "answered" : "error",
        answerInFlightAfter: answerRequestGateRef.current.isInFlight(),
        pendingRequestAfter: conversationContextRef.current.getPendingRequestText()
      } : current);
      finishQueuedLiveRequest(request);
    }, Math.max(liveDebounceMs, throttleDelay));
  }, [finishQueuedLiveRequest, markLiveTiming, requestAnswer, settings.answerLanguage, settings.answerMode, settings.answerSourceMode, settings.apiKey, settings.liveAssistSensitivity, settings.workMode, showLocalAnswer, t, transitionLiveProcessing, updateLiveEventTrace]);

  processQueuedLiveRequestRef.current = processQueuedLiveAnswer;

  const drainLiveAnswerQueue = useCallback(() => {
    const request = liveAnswerQueueRef.current.startNext();
    if (!request) return;
    setQueuedLiveRequestCount(liveAnswerQueueRef.current.getPendingCount());
    processQueuedLiveRequestRef.current(request);
  }, []);
  drainLiveAnswerQueueRef.current = drainLiveAnswerQueue;

  const queueLiveAnswer = useCallback((fragment: string, source: LiveFragmentSource, rawFragment = fragment, contextUsedForFollowUp = false, transcriptEventId = `transcript-${++transcriptEventSequenceRef.current}`) => {
    if (settings.workMode !== "live") return;

    const requestId = `live-${++liveRequestSequenceRef.current}`;
    const queue = liveAnswerQueueRef.current;
    const pendingBefore = queue.getPendingCount();
    const result = queue.enqueue({ requestId, transcriptEventId, fragment, source, rawFragment, contextUsedForFollowUp });
    updateLiveEventTrace(transcriptEventId, {
      requestId,
      utteranceDecision: "flushed",
      queueDecision: result === "queued" ? "accepted" : "queue_full",
      queuePendingBefore: pendingBefore,
      queuePendingAfter: queue.getPendingCount(),
      rejectionReason: result === "queue_full" ? "queue_full" : undefined
    });

    if (result === "queue_full") {
      setRecognitionMessage(t("liveQueueFull"));
      return;
    }

    setQueuedLiveRequestCount(queue.getPendingCount());
    drainLiveAnswerQueueRef.current();
  }, [settings.workMode, t, updateLiveEventTrace]);

  const flushBufferedUtterance = useCallback((now = Date.now()) => {
    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
      utteranceTimerRef.current = undefined;
    }

    const flushed = utteranceBufferRef.current.flush(now);
    if (!flushed) return;

    setUtteranceDiagnostics({
      pendingText: "",
      flushedText: flushed.text,
      flushReason: flushed.reason
    });
    markLiveTiming("utteranceFlushedAt", now);
    if (!liveAnswerQueueRef.current.getActive()) transitionLiveProcessing("utterance_flushed");
    if (!liveAnswerQueueRef.current.getActive()) setRecognitionMessage(t("utteranceCollectedSearching"));
    const contextUsed = utteranceNetworkingContextUsedRef.current;
    const transcriptEventId = utteranceTranscriptEventIdRef.current ?? `transcript-${++transcriptEventSequenceRef.current}`;
    utteranceNetworkingContextUsedRef.current = false;
    utteranceTranscriptEventIdRef.current = undefined;
    updateLiveEventTrace(transcriptEventId, { utteranceDecision: `flushed:${flushed.reason}` });
    queueLiveAnswer(flushed.text, utteranceSourceRef.current, flushed.fragments.join(" | "), contextUsed, transcriptEventId);
  }, [markLiveTiming, queueLiveAnswer, t, transitionLiveProcessing]);

  const bufferLiveFragment = useCallback((fragment: string, source: LiveFragmentSource, _rawFragment: string, contextUsed: boolean, transcriptEventId: string) => {
    if (settings.workMode !== "live") return;

    utteranceSourceRef.current = source;
    utteranceNetworkingContextUsedRef.current ||= contextUsed;
    utteranceTranscriptEventIdRef.current = transcriptEventId;
    const now = Date.now();
    const update = utteranceBufferRef.current.addFragment(fragment, now);
    updateLiveEventTrace(transcriptEventId, {
      utteranceDecision: update.shouldFlush ? `flush:${update.flushReason}` : "buffered",
      processingStateBefore: liveProcessingStateRef.current,
      processingStateAfter: update.shouldFlush ? "deciding" : "collecting"
    });
    setUtteranceDiagnostics((current) => ({
      ...current,
      pendingText: update.pendingUtterance,
      flushReason: undefined
    }));

    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
      utteranceTimerRef.current = undefined;
    }

    if (update.shouldFlush) {
      flushBufferedUtterance(now);
      return;
    }

    if (!liveAnswerQueueRef.current.getActive()) {
      transitionLiveProcessing("fragment_buffered");
      setRecognitionMessage(t("utteranceCollecting"));
    }
    utteranceTimerRef.current = window.setTimeout(() => {
      if (utteranceBufferRef.current.shouldFlush(Date.now())) {
        flushBufferedUtterance(Date.now());
      }
    }, 950);
  }, [flushBufferedUtterance, settings.workMode, t, transitionLiveProcessing, updateLiveEventTrace]);

  liveFragmentHandlerRef.current = bufferLiveFragment;

  useEffect(() => () => speechToTextProvider?.stop(), [speechToTextProvider]);
  useEffect(() => { void refreshAudioDevices(); }, [refreshAudioDevices]);
  useEffect(() => {
    speechToTextProvider?.stop();
    chunkTranscription.stopSession();
    microphoneRecorder.stop();
    setRecognitionStatus("stopped");
    setRecognitionMessage("");
    setSttCleanupStatus("idle");
    pendingMicrophoneFragmentsRef.current = [];
    transcriptDuplicateTrackerRef.current.clear();
    setTranscriptDecisionDiagnostics(undefined);
    setNormalizedTerms([]);
    utteranceBufferRef.current.clear();
    setUtteranceDiagnostics({ pendingText: "", flushedText: "" });
    utteranceTranscriptEventIdRef.current = undefined;
    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
      utteranceTimerRef.current = undefined;
    }
    conversationContextRef.current.clear();
    networkingContextRef.current.clear();
    utteranceNetworkingContextUsedRef.current = false;
    lastRenderedLiveAnswerRef.current = undefined;
    liveRequestSequenceRef.current = 0;
    answerRequestGateRef.current.reset();
    liveAnswerQueueRef.current.clear();
    setQueuedLiveRequestCount(0);
    setLiveContextStatus({ currentTopic: null, fragmentCount: 0 });
    transitionLiveProcessing("reset");
    if (processingSettleTimerRef.current !== undefined) {
      window.clearTimeout(processingSettleTimerRef.current);
      processingSettleTimerRef.current = undefined;
    }
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = undefined;
    }
  }, [settings.answerLanguage, settings.speechToTextProvider, speechToTextProvider, microphoneRecorder.stop, chunkTranscription.stopSession, transitionLiveProcessing]);
  useEffect(() => {
    if (settings.workMode !== "live") return;
    if (chunkTranscription.status === "error" || chunkTranscription.status === "missing_api_key") {
      transitionLiveProcessing("processing_failed");
      scheduleReturnToListening();
    }
  }, [chunkTranscription.status, scheduleReturnToListening, settings.workMode, transitionLiveProcessing]);
  useEffect(() => () => {
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
    }
    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
    }
    if (processingSettleTimerRef.current !== undefined) {
      window.clearTimeout(processingSettleTimerRef.current);
    }
    liveAnswerQueueRef.current.clear();
    answerRequestGateRef.current.reset();
  }, []);

  async function startListening() {
    setError("");
    setRecognitionMessage("");
    setSttCleanupStatus("idle");
    pendingMicrophoneFragmentsRef.current = [];
    utteranceBufferRef.current.clear();
    utteranceNetworkingContextUsedRef.current = false;
    utteranceTranscriptEventIdRef.current = undefined;
    setUtteranceDiagnostics({ pendingText: "", flushedText: "" });
    if (settings.workMode === "live") transitionLiveProcessing("listening_started");
    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
      utteranceTimerRef.current = undefined;
    }

    if (settings.speechToTextProvider === "microphone") {
      chunkTranscription.startSession();
      await microphoneRecorder.start(settings.audioInputDeviceId);
      return;
    }

    if (!speechToTextProvider || settings.speechToTextProvider === "disabled") {
      setRecognitionStatus("stopped");
      setRecognitionMessage(t("providerDisabledMessage"));
      return;
    }

    speechToTextProvider.start({
      onResult: (result) => {
        if (!result.isFinal) return;
        processRecognizedFragment(result.text, "mock");
      },
      onStatusChange: setRecognitionStatus
    });
  }

  function stopListening() {
    speechToTextProvider?.stop();
    chunkTranscription.stopSession();
    microphoneRecorder.stop();
    pendingMicrophoneFragmentsRef.current = [];
    utteranceBufferRef.current.clear();
    utteranceNetworkingContextUsedRef.current = false;
    utteranceTranscriptEventIdRef.current = undefined;
    setUtteranceDiagnostics((current) => ({ ...current, pendingText: "" }));
    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
      utteranceTimerRef.current = undefined;
    }
    transitionLiveProcessing("reset");
    answerRequestGateRef.current.reset();
    liveAnswerQueueRef.current.clear();
    setQueuedLiveRequestCount(0);
    if (processingSettleTimerRef.current !== undefined) {
      window.clearTimeout(processingSettleTimerRef.current);
      processingSettleTimerRef.current = undefined;
    }
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = undefined;
    }
  }

  function clearRecognizedText() {
    setRecognizedText("");
    setAnswer("");
    setAnswerSource(undefined);
    setLocalAnswerCards([]);
    setError("");
    setIsAsking(false);
    setIsSearchingLocal(false);
    setRecognitionMessage("");
    setSttCleanupStatus("idle");
    pendingMicrophoneFragmentsRef.current = [];
    transcriptDuplicateTrackerRef.current.clear();
    setTranscriptDecisionDiagnostics(undefined);
    setNormalizedTerms([]);
    setLiveDecisionDiagnostics(undefined);
    setUtteranceDiagnostics({ pendingText: "", flushedText: "" });
    utteranceBufferRef.current.clear();
    utteranceTranscriptEventIdRef.current = undefined;
    conversationContextRef.current.clear();
    networkingContextRef.current.clear();
    utteranceNetworkingContextUsedRef.current = false;
    lastRenderedLiveAnswerRef.current = undefined;
    liveRequestSequenceRef.current = 0;
    setLiveContextStatus({ currentTopic: null, fragmentCount: 0 });
    lastLiveAnswerAtRef.current = 0;
    answerRequestGateRef.current.reset();
    liveAnswerQueueRef.current.clear();
    setQueuedLiveRequestCount(0);
    liveEventTraceRef.current.clear();
    setLastLiveEventTrace(undefined);
    transcriptEventSequenceRef.current = 0;
    answerRevisionRef.current = 0;
    setAnswerRenderRevision(0);
    transitionLiveProcessing("reset");
    liveTimingRef.current = {};
    lastAudioChunkCreatedAtRef.current = undefined;
    setLiveTimingDiagnostics({});
    setFocusedLocalAnswer("");
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = undefined;
    }
    if (utteranceTimerRef.current !== undefined) {
      window.clearTimeout(utteranceTimerRef.current);
      utteranceTimerRef.current = undefined;
    }
    if (processingSettleTimerRef.current !== undefined) {
      window.clearTimeout(processingSettleTimerRef.current);
      processingSettleTimerRef.current = undefined;
    }
  }

  async function askManually() {
    const sanitizedManualText = sanitizeTranscript(recognizedText, settings.answerLanguage).text;
    if (!sanitizedManualText) {
      setError(t("manualTextRequired"));
      return;
    }

    const normalizedManualText = normalizeTechnicalTerms(sanitizedManualText);
    const manualText = normalizedManualText.text;
    if (manualText !== recognizedText) {
      setRecognizedText(manualText);
    }
    setNormalizedTerms(getNormalizedTermTargets(normalizedManualText.replacements));

    setError("");
    let knowledgeMatches: KnowledgeCard[] = [];
    if (shouldSearchLocalKnowledge(settings.answerSourceMode)) {
      setIsSearchingLocal(true);
      await showLocalSearchFeedback();
      knowledgeMatches = lookupLocalKnowledge(manualText).matches;
      setIsSearchingLocal(false);
    }

    const resolution = resolveAnswerSource({
      mode: settings.answerSourceMode,
      hasLocalMatch: knowledgeMatches.length > 0,
      hasApiKey: settings.apiKey.trim().length > 0,
      answerMode: settings.answerMode
    });

    if (resolution === "local" || resolution === "local-and-gpt") {
      showLocalAnswer(knowledgeMatches, getNetworkingFocusedResponse(manualText, settings.answerLanguage)?.text);
    }

    if (resolution === "local") {
      return;
    }

    if (resolution === "local-not-found" || resolution === "gpt-key-required" || resolution === "hybrid-key-required") {
      setAnswer("");
      setLocalAnswerCards([]);
      setFocusedLocalAnswer("");
      setAnswerSource(undefined);
      setError(t(resolution === "local-not-found"
        ? "localKnowledgeNotFound"
        : resolution === "gpt-key-required"
          ? "gptModeRequiresApiKey"
          : "localKnowledgeMissApiKey"));
      return;
    }

    await requestAnswer(manualText, "manual", resolution === "local-and-gpt");
  }

  async function requestMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState("error");
      setPermissionMessage("unavailable");
      return;
    }

    setPermissionState("requesting");
    setPermissionMessage(undefined);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionState("success");
      setPermissionMessage("granted");
      await refreshAudioDevices();
    } catch (permissionError) {
      setPermissionState("error");
      setPermissionMessage(getMicrophonePermissionMessage(permissionError));
    }
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
    setIsSettingsOpen(false);
  }

  const deviceMessage = getDeviceMessage(deviceStatus, audioInputDevices.length, t);
  const permissionText = permissionState === "requesting"
    ? t("requestingPermission")
    : permissionMessage
      ? t(permissionMessage === "not_found" ? "microphoneNotFound" : permissionMessage === "unavailable"
        ? "permissionUnavailable"
        : permissionMessage === "granted"
          ? "permissionGranted"
          : permissionMessage === "denied"
            ? "permissionDenied"
            : "permissionError")
      : "";

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div><h1>VoiceAssistant</h1><p>{t("subtitle")}</p></div>
        <div className="toolbar">
          <span className={isListening ? "status status-active" : "status"}>{statusText}</span>
          <button className="icon-button" type="button" onClick={() => setIsSettingsOpen(true)} title={t("settings")}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      <div className="assist-status-line">
        <span className={settings.workMode === "live" ? "mode-badge live-badge" : "mode-badge"}>
          {settings.workMode === "live" ? t("liveMode") : t("manualMode")}
        </span>
        {settings.workMode === "live" ? (
          <span className={`live-processing-state live-processing-${liveProcessingState}`} aria-live="polite">
            <span aria-hidden="true" />
            {getLiveProcessingStateText(liveProcessingState, t)}
          </span>
        ) : null}
        {settings.workMode === "live" ? (
          <span className="mode-badge live-queue-badge">{t("liveQueueLabel")}: {queuedLiveRequestCount}</span>
        ) : null}
        {settings.speechToTextProvider === "mock" ? <span className="mode-badge simulated-badge">{t("mockStt")} · {t("simulatedMode")}</span> : null}
        {settings.speechToTextProvider === "microphone" ? <span className="mode-badge recording-badge">{t("microphoneCapture")}</span> : null}
        {settings.answerSourceMode === "local-only" ? <span className="mode-badge">{t("localOnlyModeStatus")}</span> : null}
        {settings.workMode === "live" ? (
          <span className="mode-badge">
            {t("sensitivityStatus")}: {getSensitivityLabel(settings.liveAssistSensitivity, t).toLowerCase()}
          </span>
        ) : null}
        {normalizedTerms.length > 0 ? (
          <span className="status-note normalized-terms-note">{t("termsNormalized")}: {normalizedTerms.join(", ")}</span>
        ) : null}
        {settings.workMode === "live" ? (
          <>
            <span className="status-note live-context-note">
              {liveContextStatus.currentTopic
                ? `${t("topicLabel")}: ${getTopicDisplayName(liveContextStatus.currentTopic, settings.interfaceLanguage)}`
                : t("noTopicDetected")}
            </span>
            <span className="status-note live-context-note">
              {formatContextFragmentCount(liveContextStatus.fragmentCount, settings.interfaceLanguage, t)}
            </span>
          </>
        ) : null}
        <span className="status-note">{settings.speechToTextProvider === "microphone" ? t("experimentalStt") : t("microphoneSttAvailable")}</span>
      </div>

      <section
        className={`workspace layout-${settings.layoutMode}`}
        ref={panelSplitter.containerRef}
        style={panelSplitter.splitterStyle}
      >
        <div className="panel recognized-panel">
          <div className="panel-header recognized-panel-header">
            <div className="recognized-toolbar-row">
              <h2>{t("recognizedPanel")}</h2>
              <div className="recognition-controls">
                <button className="control-button" type="button" onClick={() => void startListening()} disabled={isListening || settings.speechToTextProvider === "disabled"}>
                  <Play size={18} />{t("start")}
                </button>
                <button className="control-button stop" type="button" onClick={stopListening} disabled={!isListening}>
                  <Square size={18} />{t("stop")}
                </button>
                <button className="secondary-button" type="button" onClick={clearRecognizedText} disabled={!recognizedText}>
                  <Trash2 size={18} />{t("clear")}
                </button>
                {settings.workMode === "manual" ? (
                  <button className="ask-button" type="button" onClick={() => void askManually()} disabled={isAsking || isSearchingLocal}>
                    <Send size={18} />{isAsking ? t("asking") : t("ask")}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="recognized-panel-hint">{getRecognitionHint(settings.speechToTextProvider, t)}</p>
          </div>
          <textarea value={recognizedText} onChange={(event) => setRecognizedText(event.target.value)} placeholder={t("recognizedPlaceholder")} />
          {recognitionMessage ? <div className="recognition-message">{recognitionMessage}</div> : null}
          {import.meta.env.DEV && (settings.workMode === "live" || settings.speechToTextProvider === "microphone") ? (
            <div className="diagnostics-toggle-row">
              <button
                className="diagnostics-toggle"
                type="button"
                aria-expanded={showDiagnostics}
                onClick={() => setShowDiagnostics((visible) => !visible)}
              >
                {showDiagnostics ? t("hideDiagnostics") : t("showDiagnostics")}
              </button>
            </div>
          ) : null}
          {import.meta.env.DEV && showDiagnostics && settings.workMode === "live" && (transcriptDecisionDiagnostics || liveDecisionDiagnostics || utteranceDiagnostics.pendingText || utteranceDiagnostics.flushedText) ? (
            <div className="stt-diagnostics live-decision-diagnostics" id="recognized-panel-diagnostics">
              <strong>Диагностика Live Assist</strong>
              <div className="stt-diagnostics-grid">
                <span>transcript event id</span><code>{lastLiveEventTrace?.transcriptEventId ?? "—"}</code>
                <span>queue decision</span><code>{lastLiveEventTrace?.queueDecision ?? "—"}</code>
                <span>queue pending before/after</span><code>{lastLiveEventTrace ? `${lastLiveEventTrace.queuePendingBefore ?? "—"} / ${lastLiveEventTrace.queuePendingAfter ?? "—"}` : "—"}</code>
                <span>sanitizer decision</span><code>{lastLiveEventTrace?.sanitizerDecision ?? "—"}</code>
                <span>utterance decision</span><code>{lastLiveEventTrace?.utteranceDecision ?? "—"}</code>
                <span>lookup started/finished</span><code>{lastLiveEventTrace ? `${String(lastLiveEventTrace.lookupStarted)} / ${String(lastLiveEventTrace.lookupFinished)}` : "—"}</code>
                <span>selected card</span><code>{lastLiveEventTrace?.selectedCardId ?? "—"}</code>
                <span>focused answer type</span><code>{lastLiveEventTrace?.focusedAnswerType ?? "—"}</code>
                <span>setAnswer called</span><code>{String(lastLiveEventTrace?.setAnswerCalled ?? false)}</code>
                <span>answer revision before/after</span><code>{lastLiveEventTrace ? `${lastLiveEventTrace.answerRevisionBefore ?? "—"} / ${lastLiveEventTrace.answerRevisionAfter ?? "—"}` : "—"}</code>
                <span>trace rejection</span><code>{lastLiveEventTrace?.rejectionReason ?? "—"}</code>
                <span>sanitizer: сырой текст</span><code>{transcriptDecisionDiagnostics?.rawTranscript || "—"}</code>
                <span>sanitizer: нормализованный</span><code>{transcriptDecisionDiagnostics?.normalizedTranscript || "—"}</code>
                <span>sanitizer: решение</span><code>{transcriptDecisionDiagnostics?.sanitizerDecision || "—"}</code>
                <span>sanitizer: причина</span><code>{transcriptDecisionDiagnostics?.sanitizerReason || "—"}</code>
                <span>защита тех. вопроса</span><code>{String(transcriptDecisionDiagnostics?.technicalProtectionApplied ?? false)}</code>
                <span>networking normalization</span><code>{String(transcriptDecisionDiagnostics?.networkingNormalizationApplied ?? false)}</code>
                <span>контекст сохранен после шума</span><code>{String(transcriptDecisionDiagnostics?.contextPreservedAfterNoise ?? false)}</code>
                <span>точный повтор</span><code>{String(transcriptDecisionDiagnostics?.duplicateDetected ?? false)}</code>
                <span>собираемая фраза</span><code>{utteranceDiagnostics.pendingText || "—"}</code>
                <span>собранная фраза</span><code>{utteranceDiagnostics.flushedText || "—"}</code>
                <span>причина flush</span><code>{utteranceDiagnostics.flushReason ?? "—"}</code>
                <span>сырой фрагмент</span><code>{liveDecisionDiagnostics?.rawFragment || "—"}</code>
                <span>нормализованный</span><code>{liveDecisionDiagnostics?.normalizedFragment || "—"}</code>
                <span>агрегированный</span><code>{liveDecisionDiagnostics?.aggregatedFragment || "—"}</code>
                <span>тема</span><code>{liveDecisionDiagnostics?.topic ?? "—"}</code>
                <span>классификация</span><code>{liveDecisionDiagnostics?.classification ?? "—"}</code>
                <span>намерение</span><code>{liveDecisionDiagnostics?.intent ?? "—"}</code>
                <span>broad topic</span><code>{liveDecisionDiagnostics?.broadTopic ?? "—"}</code>
                <span>предыдущая подтема</span><code>{liveDecisionDiagnostics?.previousSubtopic ?? "—"}</code>
                <span>обнаруженная подтема</span><code>{liveDecisionDiagnostics?.detectedSubtopic ?? "—"}</code>
                <span>активная подтема</span><code>{liveDecisionDiagnostics?.effectiveSubtopic ?? "—"}</code>
                <span>предыдущая сущность</span><code>{liveDecisionDiagnostics?.previousFocusedEntity ?? "—"}</code>
                <span>обнаруженная сущность</span><code>{liveDecisionDiagnostics?.detectedFocusedEntity ?? "—"}</code>
                <span>активная сущность</span><code>{liveDecisionDiagnostics?.effectiveFocusedEntity ?? "—"}</code>
                <span>возраст контекста</span><code>{liveDecisionDiagnostics?.contextAgeMs !== undefined ? `${liveDecisionDiagnostics.contextAgeMs} мс` : "—"}</code>
                <span>контекст follow-up</span><code>{String(liveDecisionDiagnostics?.contextUsedForFollowUp ?? false)}</code>
                <span>focused response</span><code>{liveDecisionDiagnostics?.focusedResponseType ?? "—"}</code>
                <span>intentRescue</span><code>{String(liveDecisionDiagnostics?.intentRescue ?? false)}</code>
                <span>шаблон вопроса</span><code>{liveDecisionDiagnostics?.matchedQuestionPattern ?? "—"}</code>
                <span>технический термин</span><code>{liveDecisionDiagnostics?.matchedTechnicalTerm ?? "—"}</code>
                <span>источник ответа</span><code>{liveDecisionDiagnostics?.answerSourceMode ?? "—"}</code>
                <span>чувствительность</span><code>{liveDecisionDiagnostics?.sensitivity ?? "—"}</code>
                <span>локальное совпадение</span><code>{String(liveDecisionDiagnostics?.localMatchFound ?? false)}</code>
                <span>карточка</span><code>{liveDecisionDiagnostics?.matchedCardId ? `${liveDecisionDiagnostics.matchedCardId} — ${liveDecisionDiagnostics.matchedCardTitle}` : "—"}</code>
                <span>нормализованный запрос</span><code>{liveDecisionDiagnostics?.localNormalizedQuery || "—"}</code>
                <span>порог совпадения</span><code>{liveDecisionDiagnostics?.localScoreThreshold ?? "—"}</code>
                <span>контекст темы добавлен</span><code>{String(liveDecisionDiagnostics?.localTopicContextAdded ?? false)}</code>
                <span>источник local lookup</span><code>{liveDecisionDiagnostics?.localQuerySource ?? "—"}</code>
                <span>причина выбора карточки</span><code>{liveDecisionDiagnostics?.localSelectionReason ?? "—"}</code>
                <span>кандидаты local lookup</span><code>{formatLocalDebugCandidates(liveDecisionDiagnostics?.localDebugCandidates ?? [])}</code>
                <span>ответ показан</span><code>{String(liveDecisionDiagnostics?.answerRendered ?? false)}</code>
                <span>причина рендера</span><code>{liveDecisionDiagnostics?.renderReason ?? "—"}</code>
                <span>время рендера</span><code>{liveDecisionDiagnostics?.renderedAt ? formatDiagnosticTimestamp(liveDecisionDiagnostics.renderedAt) : "—"}</code>
                <span>решение</span><code>{liveDecisionDiagnostics?.decision ?? "—"}</code>
                <span>источник решения</span><code>{liveDecisionDiagnostics?.decisionSource ?? "—"}</code>
                <span>request id</span><code>{liveDecisionDiagnostics?.requestId ?? "—"}</code>
                <span>предыдущий вопрос</span><code>{liveDecisionDiagnostics?.previousQuestion ?? "—"}</code>
                <span>processing state до</span><code>{liveDecisionDiagnostics?.processingStateBefore ?? "—"}</code>
                <span>processing state после</span><code>{liveDecisionDiagnostics?.processingStateAfter ?? "—"}</code>
                <span>answer in flight до</span><code>{String(liveDecisionDiagnostics?.answerInFlightBefore ?? false)}</code>
                <span>answer in flight после</span><code>{String(liveDecisionDiagnostics?.answerInFlightAfter ?? false)}</code>
                <span>duplicate key</span><code>{liveDecisionDiagnostics?.duplicateKey ?? "—"}</code>
                <span>duplicate reason</span><code>{liveDecisionDiagnostics?.duplicateReason ?? "—"}</code>
                <span>exact duplicate</span><code>{String(liveDecisionDiagnostics?.exactDuplicate ?? false)}</code>
                <span>выбранная карточка</span><code>{liveDecisionDiagnostics?.selectedCardId ?? "—"}</code>
                <span>предыдущая карточка</span><code>{liveDecisionDiagnostics?.previousSelectedCardId ?? "—"}</code>
                <span>та же карточка</span><code>{String(liveDecisionDiagnostics?.sameCardAsPrevious ?? false)}</code>
                <span>тип cooldown</span><code>{liveDecisionDiagnostics?.cooldownType ?? "none"}</code>
                <span>cooldown blocked</span><code>{String(liveDecisionDiagnostics?.cooldownBlocked ?? false)}</code>
                <span>pending request до</span><code>{liveDecisionDiagnostics?.pendingRequestBefore ?? "—"}</code>
                <span>pending request после</span><code>{liveDecisionDiagnostics?.pendingRequestAfter ?? "—"}</code>
                <span>вернулся к listening</span><code>{String(liveDecisionDiagnostics?.returnedToListening ?? false)}</code>
                <span>ожидающий запрос</span><code>{liveDecisionDiagnostics?.pendingRequestText ?? "—"}</code>
                <span>причина</span><code>{liveDecisionDiagnostics?.reason ?? "—"}</code>
                <span>осталось паузы</span><code>{formatCooldown(liveDecisionDiagnostics?.cooldownRemainingMs ?? 0)}</code>
                <span>аудиочанк создан</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.audioChunkCreatedAt)}</code>
                <span>транскрипция начата</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.transcriptionStartedAt)}</code>
                <span>транскрипция завершена</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.transcriptionCompletedAt)}</code>
                <span>фраза собрана</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.utteranceFlushedAt)}</code>
                <span>local lookup начат</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.localLookupStartedAt)}</code>
                <span>local lookup завершен</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.localLookupCompletedAt)}</code>
                <span>GPT запрос начат</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.gptRequestStartedAt)}</code>
                <span>GPT запрос завершен</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.gptRequestCompletedAt)}</code>
                <span>ответ показан в</span><code>{formatLiveTimingTimestamp(liveTimingDiagnostics.answerRenderedAt)}</code>
                <span>от последнего чанка до ответа</span><code>{liveTimingDiagnostics.totalFromLastChunkMs !== undefined ? `${liveTimingDiagnostics.totalFromLastChunkMs} мс` : "—"}</code>
              </div>
            </div>
          ) : null}
          {settings.speechToTextProvider === "microphone" ? (
            <div className="recorder-debug">
              <div className="recorder-summary-line">
                <strong>{t("recordingDebug")}</strong>
                <span>{t("chunksCaptured")}: {microphoneRecorder.debug.chunksCaptured}</span>
                <span>{t("lastChunkSize")}: {microphoneRecorder.debug.lastChunkSize > 0 ? `${microphoneRecorder.debug.lastChunkSize} ${t("bytes")}` : t("noChunksYet")}</span>
                <span>{t("lastChunkMimeType")}: {microphoneRecorder.debug.lastChunkMimeType || "—"}</span>
                <span className={chunkTranscription.status === "error" || chunkTranscription.status === "missing_api_key" ? "recorder-warning" : "transcription-status"}>
                  {t("transcriptionStatus")}: {getTranscriptionStatusText(chunkTranscription.status, t)}
                </span>
                <span className={sttCleanupStatus === "skipped" || sttCleanupStatus === "duplicate" ? "recorder-warning" : "transcription-status"}>
                  {t("sttCleanupStatus")}: {getSttCleanupStatusText(sttCleanupStatus, t)}
                </span>
              </div>
              {showDiagnostics ? (
                <div className="recorder-details">
                  <div className="recorder-debug-header">
                    {enableMicrophoneVisualizer ? (
                      <MicrophoneLevelMeter
                        active={microphoneRecorder.status === "recording"}
                        audioLevel={microphoneRecorder.audioLevel}
                        activeLabel={t("microphoneActive")}
                        stoppedLabel={t("microphoneStopped")}
                      />
                    ) : null}
                    <span>{t("audioPrivacyNote")}</span>
                  </div>
                  {import.meta.env.DEV && chunkTranscription.diagnostics ? (
                    <div className="stt-diagnostics">
                      <strong>Диагностика STT</strong>
                      <div className="stt-diagnostics-grid">
                        <span>размер чанка</span><code>{chunkTranscription.diagnostics.chunkSize} байт</code>
                        <span>тип чанка</span><code>{chunkTranscription.diagnostics.chunkMimeType}</code>
                        <span>ключ передан</span><code>{String(chunkTranscription.diagnostics.apiKeyPresent)}</code>
                        <span>запрос начат</span><code>{formatDiagnosticTimestamp(chunkTranscription.diagnostics.requestStartedAt)}</code>
                        <span>запрос завершен</span><code>{chunkTranscription.diagnostics.requestCompletedAt ? formatDiagnosticTimestamp(chunkTranscription.diagnostics.requestCompletedAt) : "—"}</code>
                        <span>статус ответа</span><code>{chunkTranscription.diagnostics.responseStatus ?? "—"}</code>
                        <span>ошибка</span><code>{chunkTranscription.diagnostics.error ?? "—"}</code>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {microphoneRecorder.usedDefaultDevice ? <div className="recorder-warning">{t("defaultDeviceFallback")}</div> : null}
            </div>
          ) : null}
          <div className="actions-row">
            <div className="input-device"><Mic size={16} /><span>{selectedAudioDeviceLabel}</span></div>
            {settings.workMode === "live" ? <span className="live-ready">{t("liveReady")}</span> : null}
          </div>
        </div>

        <div
          className="panel-splitter"
          role="separator"
          aria-label={t("resizePanels")}
          aria-orientation={settings.layoutMode === "vertical" ? "horizontal" : "vertical"}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(splitterRatio * 100)}
          tabIndex={0}
          title={t("splitterHint")}
          onPointerDown={panelSplitter.onPointerDown}
          onDoubleClick={panelSplitter.onDoubleClick}
          onKeyDown={panelSplitter.onKeyDown}
        >
          <span />
        </div>

        <div className="panel answer-panel" data-answer-render-revision={answerRenderRevision}>
          <div className="panel-header">
            <div>
              <h2>{t("answerPanel")}</h2>
              <p className="answer-meta">
                <span>{t("modeLabel")}: {t(settings.answerMode)}</span>
                {answerSource ? <span className={`answer-source source-${answerSource}`}>{answerSource === "local" ? t("sourceLocalKnowledge") : t("sourceGpt")}</span> : null}
              </p>
            </div>
          </div>
          {error ? <div className="error-message">{error}</div> : null}
          {isSearchingLocal ? <div className="local-search-status">{t("searchingLocalKnowledge")}</div> : null}
          {answerSource === "local" && localAnswerCards.length > 0 ? (
            <div className="local-knowledge-answer">
              {focusedLocalAnswer ? <div className="focused-local-answer">{focusedLocalAnswer}</div> : null}
              {localAnswerCards.map((knowledgeCard) => (
                <article className="knowledge-card" key={knowledgeCard.id}>
                  <h3>{knowledgeCard.title}</h3>
                  <p>{knowledgeCard.shortExplanation}</p>
                  <ul>{knowledgeCard.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                  {knowledgeCard.commands.length > 0 ? (
                    <div className="knowledge-commands">
                      <strong>{settings.answerLanguage === "ru" ? "Полезные команды" : "Useful commands"}</strong>
                      {knowledgeCard.commands.map((command) => <code key={command}>{command}</code>)}
                    </div>
                  ) : null}
                </article>
              ))}
              {isAsking ? <div className="knowledge-enrichment-status">{t("enrichingWithGpt")}</div> : null}
            </div>
          ) : (
            <pre className={answer ? "answer-text" : "answer-text answer-empty"}>
              {isAsking ? t("loadingAnswer") : answer || (settings.workMode === "live" ? t("emptyAnswerLive") : t("emptyAnswerManual"))}
            </pre>
          )}
        </div>
      </section>

      {isSettingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="settings-dialog" onSubmit={saveSettings}>
            <div className="settings-header">
              <h2>{t("settings")}</h2>
              <button className="icon-button" type="button" onClick={() => setIsSettingsOpen(false)} title={t("close")}><X size={20} /></button>
            </div>

            <label>{t("openAiApiKey")}<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder={t("apiKeyPlaceholder")} /></label>
            <label>{t("answerModel")}<input type="text" value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label>
            <div className="settings-field"><label htmlFor="answer-source-mode">{t("answerSource")}</label><select id="answer-source-mode" value={settings.answerSourceMode} onChange={(event) => setSettings({ ...settings, answerSourceMode: event.target.value as AnswerSourceMode })}><option value="local-only">{t("localOnly")}</option><option value="local-plus-gpt">{t("localPlusGpt")}</option><option value="gpt-only">{t("gptOnly")}</option></select></div>

            <div className="settings-field">
              <label htmlFor="audio-input-device">{t("audioInputDevice")}</label>
              <select id="audio-input-device" value={settings.audioInputDeviceId} onChange={(event) => setSettings({ ...settings, audioInputDeviceId: event.target.value })}>
                <option value="">{t("systemDefaultMicrophone")}</option>
                {settings.audioInputDeviceId && !audioInputDevices.some((device) => device.deviceId === settings.audioInputDeviceId) ? <option value={settings.audioInputDeviceId}>{t("previousMicrophone")}</option> : null}
                {audioInputDevices.map((device, index) => <option key={device.deviceId || `${device.groupId}-${index}`} value={device.deviceId}>{getAudioDeviceLabel(device, index)}</option>)}
              </select>
              <div className="device-actions">
                <button className="secondary-button settings-action-button" type="button" onClick={() => void refreshAudioDevices()} disabled={isRefreshingDevices}><RefreshCw size={17} />{isRefreshingDevices ? t("refreshingDevices") : t("refreshDevices")}</button>
                <button className="secondary-button settings-action-button" type="button" onClick={() => void requestMicrophonePermission()} disabled={permissionState === "requesting"}><ShieldCheck size={17} />{t("requestMicrophonePermission")}</button>
              </div>
              <p className="device-message">{deviceMessage}</p>
              {permissionText ? <p className={`permission-message permission-${permissionState}`}>{permissionText}</p> : null}
            </div>

            <div className="settings-field"><label htmlFor="work-mode">{t("workMode")}</label><select id="work-mode" value={settings.workMode} onChange={(event) => setSettings({ ...settings, workMode: event.target.value as WorkMode })}><option value="manual">{t("manual")}</option><option value="live">{t("live")}</option></select></div>
            <div className="settings-field"><label htmlFor="live-assist-sensitivity">{t("liveAssistSensitivity")}</label><select id="live-assist-sensitivity" value={settings.liveAssistSensitivity} onChange={(event) => setSettings({ ...settings, liveAssistSensitivity: event.target.value as LiveAssistSensitivity })}><option value="conservative">{t("sensitivityConservative")}</option><option value="balanced">{t("sensitivityBalanced")}</option><option value="active">{t("sensitivityActive")}</option></select></div>
            <div className="settings-field"><label htmlFor="layout-mode">{t("layoutMode")}</label><select id="layout-mode" value={settings.layoutMode} onChange={(event) => setSettings({ ...settings, layoutMode: event.target.value as LayoutMode })}><option value="vertical">{t("verticalLayout")}</option><option value="horizontal">{t("horizontalLayout")}</option></select></div>
            <div className="settings-field"><label htmlFor="speech-provider">{t("speechProvider")}</label><select id="speech-provider" value={settings.speechToTextProvider} onChange={(event) => setSettings({ ...settings, speechToTextProvider: event.target.value as SpeechToTextProviderId })}><option value="disabled">{t("disabled")}</option><option value="mock">{t("mockSimulated")}</option><option value="microphone">{t("microphoneProvider")}</option></select></div>
            <div className="settings-field"><label htmlFor="interface-language">{t("interfaceLanguage")}</label><select id="interface-language" value={settings.interfaceLanguage} onChange={(event) => setSettings({ ...settings, interfaceLanguage: event.target.value as AppLanguage })}><option value="ru">{t("russian")}</option><option value="en">{t("english")}</option></select></div>
            <div className="settings-field"><label htmlFor="answer-language">{t("answerLanguage")}</label><select id="answer-language" value={settings.answerLanguage} onChange={(event) => setSettings({ ...settings, answerLanguage: event.target.value as AppLanguage })}><option value="ru">{t("russian")}</option><option value="en">{t("english")}</option></select></div>
            <div className="settings-field"><label htmlFor="answer-mode">{t("answerMode")}</label><select id="answer-mode" value={settings.answerMode} onChange={(event) => setSettings({ ...settings, answerMode: event.target.value as AnswerMode })}><option value="short">{t("short")}</option><option value="interview">{t("interview")}</option><option value="learning">{t("learning")}</option></select></div>
            <button className="save-button" type="submit">{t("save")}</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function createLiveDecisionDiagnostics(
  rawFragment: string,
  normalizedFragment: string,
  contextDecision: LiveContextDecision,
  answerSourceMode: AnswerSourceMode,
  decision: LiveAssistAction,
  reason: string,
  knowledgeMatches: KnowledgeCard[],
  localLookup: ReturnType<typeof lookupLocalKnowledge> | undefined,
  lifecycle: Pick<LiveDecisionDiagnostics,
    | "requestId"
    | "previousQuestion"
    | "processingStateBefore"
    | "processingStateAfter"
    | "answerInFlightBefore"
    | "answerInFlightAfter"
    | "duplicateKey"
    | "duplicateReason"
    | "exactDuplicate"
    | "selectedCardId"
    | "previousSelectedCardId"
    | "sameCardAsPrevious"
    | "cooldownType"
    | "cooldownBlocked"
    | "pendingRequestBefore"
    | "pendingRequestAfter"
    | "returnedToListening"
    | "broadTopic"
    | "previousSubtopic"
    | "detectedSubtopic"
    | "effectiveSubtopic"
    | "previousFocusedEntity"
    | "detectedFocusedEntity"
    | "effectiveFocusedEntity"
    | "contextAgeMs"
    | "contextUsedForFollowUp"
    | "contextPreservedAfterNoise"
    | "focusedResponseType">
): LiveDecisionDiagnostics {
  const matchedCard = knowledgeMatches[0];
  return {
    rawFragment,
    normalizedFragment,
    aggregatedFragment: contextDecision.aggregatedText,
    topic: contextDecision.currentTopic,
    classification: contextDecision.classification,
    intent: contextDecision.intent,
    answerSourceMode,
    sensitivity: contextDecision.sensitivity,
    decisionSource: contextDecision.decisionSource,
    pendingRequestText: contextDecision.pendingRequestText,
    intentRescue: contextDecision.intentRescue,
    matchedQuestionPattern: contextDecision.matchedQuestionPattern,
    matchedTechnicalTerm: contextDecision.matchedTechnicalTerm,
    decision,
    reason,
    cooldownRemainingMs: contextDecision.cooldownRemainingMs,
    localMatchFound: knowledgeMatches.length > 0,
    matchedCardId: matchedCard?.id,
    matchedCardTitle: matchedCard?.title,
    answerRendered: false,
    localNormalizedQuery: localLookup?.normalizedQuery ?? "",
    localDebugCandidates: localLookup?.debugCandidates ?? [],
    localScoreThreshold: localLookup?.scoreThreshold ?? 0,
    localTopicContextAdded: localLookup?.topicContextAdded ?? false,
    localQuerySource: localLookup?.querySource,
    localSelectionReason: localLookup?.selectionReason,
    ...lifecycle
  };
}

function formatLocalDebugCandidates(candidates: KnowledgeCandidateDebug[]): string {
  if (candidates.length === 0) return "—";
  return candidates
    .slice(0, 5)
    .map((candidate) => {
      const bonus = candidate.specificityBonus > 0 ? `, specificity +${candidate.specificityBonus}` : "";
      const selected = candidate.selected ? `, selected: ${candidate.selectionReason ?? "alias"}` : "";
      return `${candidate.title}: ${candidate.score}${bonus} (${candidate.rejectionReason}${selected})`;
    })
    .join("\n");
}

function getSensitivityLabel(
  sensitivity: LiveAssistSensitivity,
  t: ReturnType<typeof createTranslator>
): string {
  if (sensitivity === "conservative") return t("sensitivityConservative");
  if (sensitivity === "active") return t("sensitivityActive");
  return t("sensitivityBalanced");
}

function formatCooldown(cooldownRemainingMs: number): string {
  return cooldownRemainingMs > 0 ? `${(cooldownRemainingMs / 1000).toFixed(1)} с` : "0 с";
}

function loadSettings(): DesktopSettings {
  const rawSettings = localStorage.getItem(settingsStorageKey);
  if (!rawSettings) return defaultSettings;

  try {
    return migrateDesktopSettings(JSON.parse(rawSettings), defaultSettings);
  } catch {
    return defaultSettings;
  }
}

function loadSplitterRatio(): number {
  const storedRatio = localStorage.getItem(splitterRatioStorageKey);
  return storedRatio === null ? normalizeSplitterRatio(undefined) : normalizeSplitterRatio(Number(storedRatio));
}

function appendRecognizedText(currentText: string, phrase: string): string {
  const trimmed = currentText.trim();
  const cleanedPhrase = phrase.trim();
  if (!cleanedPhrase) return trimmed;

  const normalizedPhrase = normalizeTranscriptForComparison(cleanedPhrase);
  const lastLine = trimmed.split("\n").at(-1) ?? "";
  const normalizedLastLine = normalizeTranscriptForComparison(lastLine);
  if (normalizedLastLine === normalizedPhrase || normalizedLastLine.endsWith(normalizedPhrase)) return trimmed;

  return trimmed ? `${trimmed}\n${cleanedPhrase}` : cleanedPhrase;
}

function normalizeTranscriptForComparison(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getNormalizedTermTargets(replacements: Array<{ to: string }>): string[] {
  return [...new Set(replacements.map((replacement) => replacement.to))];
}

async function showLocalSearchFeedback(): Promise<void> {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
}

function getAudioDeviceLabel(device: MediaDeviceInfo, index: number): string {
  return device.label.trim() || `Microphone ${index + 1}`;
}

function getDeviceMessage(status: DeviceStatus, count: number, t: ReturnType<typeof createTranslator>): string {
  if (status === "unavailable") return t("deviceDiscoveryUnavailable");
  if (status === "none") return t("noDevices");
  if (status === "error") return t("deviceListError");
  if (status === "found") return count === 1 ? t("oneMicrophoneFound") : `${t("microphonesFound")} ${count}`;
  return t("permissionMayBeRequired");
}

function getMicrophonePermissionMessage(error: unknown): PermissionMessage {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "denied";
  if (error instanceof DOMException && error.name === "NotFoundError") return "not_found";
  return "error";
}

function getMainStatusText(
  provider: SpeechToTextProviderId,
  recognitionStatus: RecognitionStatus,
  recorderStatus: MicrophoneRecorderStatus,
  t: ReturnType<typeof createTranslator>
): string {
  if (provider === "disabled") return t("disabled");
  if (provider === "mock") return recognitionStatus === "listening" ? t("listening") : t("stopped");
  if (recorderStatus === "requesting_permission") return t("requestingMicrophone");
  if (recorderStatus === "recording") return t("recordingChunks");
  if (recorderStatus === "permission_denied") return t("microphonePermissionDeniedStatus");
  if (recorderStatus === "device_unavailable") return t("selectedDeviceUnavailableStatus");
  if (recorderStatus === "error") return t("recorderErrorStatus");
  return t("stopped");
}

function getRecognitionHint(
  provider: SpeechToTextProviderId,
  t: ReturnType<typeof createTranslator>
): string {
  if (provider === "mock") return t("recognizedHintMock");
  if (provider === "microphone") return t("recognizedHintMicrophone");
  return t("recognizedHintDisabled");
}

function getTranscriptionStatusText(
  status: TranscriptionStatus,
  t: ReturnType<typeof createTranslator>
): string {
  if (status === "waiting_for_audio") return t("waitingForAudio");
  if (status === "transcribing") return t("transcribing");
  if (status === "received") return t("lastTranscriptionReceived");
  if (status === "missing_api_key") return t("apiKeyRequiredForSpeechRecognition");
  if (status === "error") return t("transcriptionError");
  return t("stopped");
}

function getSttCleanupStatusText(
  status: SttCleanupStatus,
  t: ReturnType<typeof createTranslator>
): string {
  if (status === "accepted") return t("sttCleanupAccepted");
  if (status === "skipped") return t("sttCleanupSkipped");
  if (status === "duplicate") return t("sttCleanupDuplicate");
  if (status === "waiting") return t("sttCleanupWaiting");
  return t("sttCleanupIdle");
}

function formatDiagnosticTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString("ru-RU");
}

function formatLiveTimingTimestamp(timestamp: number | undefined): string {
  return timestamp === undefined ? "—" : new Date(timestamp).toLocaleTimeString("ru-RU", { hour12: false });
}

function getLiveProcessingStateText(
  state: LiveProcessingState,
  t: ReturnType<typeof createTranslator>
): string {
  if (state === "listening") return t("liveStateListening");
  if (state === "transcribing") return t("liveStateTranscribing");
  if (state === "collecting") return t("liveStateCollecting");
  if (state === "deciding") return t("liveStateDeciding");
  if (state === "searching_local") return t("liveStateSearchingLocal");
  if (state === "requesting_gpt") return t("liveStateRequestingGpt");
  if (state === "answered") return t("liveStateAnswered");
  if (state === "duplicate") return t("sttDuplicate");
  if (state === "no_match") return t("liveStateNoMatch");
  if (state === "error") return t("liveStateError");
  return t("liveStateIdle");
}

function getTopicDisplayName(topic: TechnicalTopic, language: AppLanguage): string {
  if (language === "ru" && topic === "Networking") return "Сети";
  return topic;
}

function formatContextFragmentCount(
  count: number,
  language: AppLanguage,
  t: ReturnType<typeof createTranslator>
): string {
  if (language === "en") {
    return `${t("contextLabel")}: ${count} ${count === 1 ? t("contextFragmentOne") : t("contextFragmentMany")}`;
  }

  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word = remainder100 >= 11 && remainder100 <= 14
    ? t("contextFragmentMany")
    : remainder10 === 1
      ? t("contextFragmentOne")
      : remainder10 >= 2 && remainder10 <= 4
        ? t("contextFragmentFew")
        : t("contextFragmentMany");
  return `${t("contextLabel")}: ${count} ${word}`;
}

function formatKnowledgeCards(cards: KnowledgeCard[], language: AppLanguage): string {
  const commandsLabel = language === "ru" ? "Полезные команды" : "Useful commands";
  return cards.map((knowledgeCard) => [
    knowledgeCard.title,
    knowledgeCard.shortExplanation,
    ...knowledgeCard.bullets.map((bullet) => `• ${bullet}`),
    ...(knowledgeCard.commands.length > 0
      ? [commandsLabel, ...knowledgeCard.commands.map((command) => `  ${command}`)]
      : [])
  ].join("\n")).join("\n\n");
}
