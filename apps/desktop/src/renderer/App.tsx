import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Play, RefreshCw, Send, Settings, ShieldCheck, Square, Trash2, X } from "lucide-react";
import type {
  AnswerMode,
  AppLanguage,
  AssistantAnswerResponse,
  DesktopSettings,
  KnowledgeCard,
  LayoutMode,
  SanitizedTranscript,
  SpeechToTextProviderId,
  WorkMode
} from "@voiceassistant/shared";
import { classifyTechnicalFragment, findKnowledgeCards, sanitizeTranscript } from "@voiceassistant/shared";
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
  workMode: "manual",
  layoutMode: "vertical",
  speechToTextProvider: "mock"
};

const settingsStorageKey = "voiceassistant.settings";
const splitterRatioStorageKey = "voiceassistant.splitterRatio";
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";
const liveDebounceMs = 650;
const liveThrottleMs = 2000;
const enableMicrophoneVisualizer = false;

type DeviceStatus = "permission_hint" | "unavailable" | "none" | "found" | "error";
type PermissionState = "idle" | "requesting" | "success" | "error";
type PermissionMessage = "unavailable" | "granted" | "denied" | "not_found" | "error" | undefined;
type LiveFragmentSource = "mock" | "microphone";
type AnswerSource = "local" | "gpt" | undefined;
type SttCleanupStatus = "idle" | "accepted" | "skipped" | "waiting";

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
  const [answerSource, setAnswerSource] = useState<AnswerSource>();
  const [localAnswerCards, setLocalAnswerCards] = useState<KnowledgeCard[]>([]);
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus>("stopped");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isSearchingLocal, setIsSearchingLocal] = useState(false);
  const [error, setError] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [sttCleanupStatus, setSttCleanupStatus] = useState<SttCleanupStatus>("idle");
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("permission_hint");
  const [permissionState, setPermissionState] = useState<PermissionState>("idle");
  const [permissionMessage, setPermissionMessage] = useState<PermissionMessage>();
  const liveFragmentHandlerRef = useRef<(fragment: string, source: LiveFragmentSource) => void>(() => undefined);
  const pendingMicrophoneFragmentsRef = useRef<string[]>([]);
  const lastAcceptedTranscriptRef = useRef("");
  const processRecognizedFragment = useCallback((rawText: string, source: LiveFragmentSource) => {
    const sanitized = sanitizeTranscript(rawText, settings.answerLanguage);

    if (!sanitized.shouldUse && sanitized.reason !== "incomplete") {
      setSttCleanupStatus("skipped");
      setRecognitionMessage(t("sttNoiseSkipped"));
      return;
    }

    let candidate: SanitizedTranscript = sanitized;
    if (source === "microphone") {
      const pendingFragments = pendingMicrophoneFragmentsRef.current;
      if (sanitized.reason === "incomplete") {
        const nextFragments = [...pendingFragments, sanitized.text].slice(-2);
        candidate = sanitizeTranscript(nextFragments.join(" "), settings.answerLanguage);
        if (!candidate.shouldUse) {
          pendingMicrophoneFragmentsRef.current = nextFragments;
          setSttCleanupStatus("waiting");
          setRecognitionMessage(t("sttWaitingMoreContext"));
          return;
        }
      } else if (pendingFragments.length > 0) {
        candidate = sanitizeTranscript([...pendingFragments, sanitized.text].join(" "), settings.answerLanguage);
        if (!candidate.shouldUse) {
          pendingMicrophoneFragmentsRef.current = [...pendingFragments, sanitized.text].slice(-2);
          setSttCleanupStatus(candidate.reason === "incomplete" ? "waiting" : "skipped");
          setRecognitionMessage(candidate.reason === "incomplete" ? t("sttWaitingMoreContext") : t("sttNoiseSkipped"));
          return;
        }
      }

      pendingMicrophoneFragmentsRef.current = [];
    }

    const normalizedCandidate = normalizeTranscriptForComparison(candidate.text);
    const previousTranscript = lastAcceptedTranscriptRef.current;
    if (!normalizedCandidate || normalizedCandidate === previousTranscript || previousTranscript.endsWith(normalizedCandidate)) {
      setSttCleanupStatus("skipped");
      setRecognitionMessage(t("sttNoiseSkipped"));
      return;
    }

    lastAcceptedTranscriptRef.current = normalizedCandidate;
    setRecognizedText((currentText) => appendRecognizedText(currentText, candidate.text));
    setSttCleanupStatus("accepted");
    setRecognitionMessage("");
    liveFragmentHandlerRef.current(candidate.text, source);
  }, [settings.answerLanguage, t]);
  const handleTranscript = useCallback((text: string) => {
    processRecognizedFragment(text, "microphone");
  }, [processRecognizedFragment]);
  const chunkTranscription = useChunkTranscription({
    backendUrl,
    apiKey: settings.apiKey,
    language: settings.answerLanguage,
    onTranscript: handleTranscript
  });
  const microphoneRecorder = useMicrophoneRecorder({ onChunk: chunkTranscription.transcribeChunk });
  const liveTimerRef = useRef<number>();
  const answeredFragmentsRef = useRef(new Set<string>());
  const lastLiveAnswerAtRef = useRef(0);
  const requestInFlightRef = useRef(false);
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

  const showLocalAnswer = useCallback((cards: KnowledgeCard[]) => {
    setAnswer(formatKnowledgeCards(cards, settings.answerLanguage));
    setLocalAnswerCards(cards);
    setAnswerSource("local");
    setError("");
  }, [settings.answerLanguage]);

  const requestAnswer = useCallback(async (
    text: string,
    workMode: WorkMode,
    preserveLocalAnswer = false
  ): Promise<boolean> => {
    const trimmedText = text.trim();
    if (!trimmedText || requestInFlightRef.current) {
      return false;
    }

    requestInFlightRef.current = true;
    setIsAsking(true);
    setError("");
    if (!preserveLocalAnswer) {
      setLocalAnswerCards([]);
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

      setAnswer("answer" in data ? data.answer : "");
      setLocalAnswerCards([]);
      setAnswerSource(settings.apiKey.trim() ? "gpt" : undefined);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("permissionError"));
      return false;
    } finally {
      requestInFlightRef.current = false;
      setIsAsking(false);
    }
  }, [settings.answerLanguage, settings.answerMode, settings.apiKey, settings.model, t]);

  const queueLiveAnswer = useCallback((fragment: string, source: LiveFragmentSource) => {
    if (settings.workMode !== "live") {
      return;
    }

    const detection = classifyTechnicalFragment(fragment);
    if (detection.classification === "ignore") {
      if (source === "microphone") {
        setRecognitionMessage(t("liveFragmentIgnored"));
      }
      return;
    }

    if (answeredFragmentsRef.current.has(detection.normalizedText)) {
      return;
    }

    const knowledgeMatches = findKnowledgeCards(fragment);

    if (source === "microphone") {
      setRecognitionMessage(t("livePreparingAnswer"));
    }

    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
    }

    const throttleDelay = Math.max(0, liveThrottleMs - (Date.now() - lastLiveAnswerAtRef.current));
    liveTimerRef.current = window.setTimeout(async () => {
      answeredFragmentsRef.current.add(detection.normalizedText);
      lastLiveAnswerAtRef.current = Date.now();

      if (knowledgeMatches.length > 0) {
        showLocalAnswer(knowledgeMatches);
        const shouldEnrich = settings.apiKey.trim().length > 0 && settings.answerMode !== "short";
        if (!shouldEnrich) {
          if (source === "microphone") setRecognitionMessage("");
          return;
        }
      }

      if (!settings.apiKey.trim()) {
        setError(t("localKnowledgeMissApiKey"));
        if (source === "microphone") setRecognitionMessage("");
        return;
      }

      const sent = await requestAnswer(fragment, "live", knowledgeMatches.length > 0);
      if (!sent) {
        answeredFragmentsRef.current.delete(detection.normalizedText);
      }
      if (source === "microphone") {
        setRecognitionMessage("");
      }
    }, Math.max(liveDebounceMs, throttleDelay));
  }, [requestAnswer, settings.answerMode, settings.apiKey, settings.workMode, showLocalAnswer, t]);

  liveFragmentHandlerRef.current = queueLiveAnswer;

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
    lastAcceptedTranscriptRef.current = "";
  }, [settings.answerLanguage, settings.speechToTextProvider, speechToTextProvider, microphoneRecorder.stop, chunkTranscription.stopSession]);
  useEffect(() => () => {
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
    }
  }, []);

  async function startListening() {
    setError("");
    setRecognitionMessage("");
    setSttCleanupStatus("idle");
    pendingMicrophoneFragmentsRef.current = [];

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
  }

  function clearRecognizedText() {
    setRecognizedText("");
    setRecognitionMessage("");
    setSttCleanupStatus("idle");
    pendingMicrophoneFragmentsRef.current = [];
    lastAcceptedTranscriptRef.current = "";
    answeredFragmentsRef.current.clear();
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = undefined;
    }
  }

  async function askManually() {
    const sanitizedManualText = sanitizeTranscript(recognizedText, settings.answerLanguage).text;
    if (!sanitizedManualText) {
      setError(t("manualTextRequired"));
      return;
    }

    setError("");
    setIsSearchingLocal(true);
    await showLocalSearchFeedback();
    const knowledgeMatches = findKnowledgeCards(sanitizedManualText);
    setIsSearchingLocal(false);

    if (knowledgeMatches.length > 0) {
      showLocalAnswer(knowledgeMatches);
      const shouldEnrich = settings.apiKey.trim().length > 0 && settings.answerMode !== "short";
      if (!shouldEnrich) {
        return;
      }
    }

    if (!settings.apiKey.trim()) {
      setAnswer("");
      setLocalAnswerCards([]);
      setAnswerSource(undefined);
      setError(t("localKnowledgeMissApiKey"));
      return;
    }

    await requestAnswer(sanitizedManualText, "manual", knowledgeMatches.length > 0);
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
        {settings.speechToTextProvider === "mock" ? <span className="mode-badge simulated-badge">{t("mockStt")} · {t("simulatedMode")}</span> : null}
        {settings.speechToTextProvider === "microphone" ? <span className="mode-badge recording-badge">{t("microphoneCapture")}</span> : null}
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
          {settings.speechToTextProvider === "microphone" ? (
            <div className="recorder-debug">
              <div className="recorder-debug-header">
                <span>{t("recordingDebug")}</span>
                {enableMicrophoneVisualizer ? (
                  <MicrophoneLevelMeter
                    active={microphoneRecorder.status === "recording"}
                    stream={microphoneRecorder.getMediaStream()}
                    activeLabel={t("microphoneActive")}
                    stoppedLabel={t("microphoneStopped")}
                  />
                ) : null}
                <span>{t("audioPrivacyNote")}</span>
              </div>
              <div className="recorder-debug-values">
                <span>{t("chunksCaptured")}: {microphoneRecorder.debug.chunksCaptured}</span>
                <span>{t("lastChunkSize")}: {microphoneRecorder.debug.lastChunkSize > 0 ? `${microphoneRecorder.debug.lastChunkSize} ${t("bytes")}` : t("noChunksYet")}</span>
                <span>{t("lastChunkMimeType")}: {microphoneRecorder.debug.lastChunkMimeType || "—"}</span>
              </div>
              <div className={chunkTranscription.status === "error" || chunkTranscription.status === "missing_api_key" ? "recorder-warning" : "transcription-status"}>
                {t("transcriptionStatus")}: {getTranscriptionStatusText(chunkTranscription.status, t)}
              </div>
              <div className={sttCleanupStatus === "skipped" ? "recorder-warning" : "transcription-status"}>
                {t("sttCleanupStatus")}: {getSttCleanupStatusText(sttCleanupStatus, t)}
              </div>
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

        <div className="panel answer-panel">
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

function loadSettings(): DesktopSettings {
  const rawSettings = localStorage.getItem(settingsStorageKey);
  if (!rawSettings) return defaultSettings;

  try {
    const parsed = JSON.parse(rawSettings) as Partial<DesktopSettings> & { language?: AppLanguage };
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : defaultSettings.apiKey,
      model: typeof parsed.model === "string" ? parsed.model : defaultSettings.model,
      interfaceLanguage: isLanguage(parsed.interfaceLanguage) ? parsed.interfaceLanguage : defaultSettings.interfaceLanguage,
      answerLanguage: isLanguage(parsed.answerLanguage) ? parsed.answerLanguage : isLanguage(parsed.language) ? parsed.language : defaultSettings.answerLanguage,
      audioInputDeviceId: typeof parsed.audioInputDeviceId === "string" ? parsed.audioInputDeviceId : "",
      answerMode: isAnswerMode(parsed.answerMode) ? parsed.answerMode : defaultSettings.answerMode,
      workMode: isWorkMode(parsed.workMode) ? parsed.workMode : defaultSettings.workMode,
      layoutMode: isLayoutMode(parsed.layoutMode) ? parsed.layoutMode : defaultSettings.layoutMode,
      speechToTextProvider: isSpeechProvider(parsed.speechToTextProvider) ? parsed.speechToTextProvider : defaultSettings.speechToTextProvider
    };
  } catch {
    return defaultSettings;
  }
}

function isLanguage(value: unknown): value is AppLanguage { return value === "ru" || value === "en"; }
function isAnswerMode(value: unknown): value is AnswerMode { return value === "short" || value === "interview" || value === "learning"; }
function isWorkMode(value: unknown): value is WorkMode { return value === "manual" || value === "live"; }
function isLayoutMode(value: unknown): value is LayoutMode { return value === "vertical" || value === "horizontal"; }
function isSpeechProvider(value: unknown): value is SpeechToTextProviderId { return value === "disabled" || value === "mock" || value === "microphone"; }

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
  if (status === "waiting") return t("sttCleanupWaiting");
  return t("sttCleanupIdle");
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
