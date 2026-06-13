import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Play, RefreshCw, Send, Settings, ShieldCheck, Square, Trash2, X } from "lucide-react";
import type {
  AnswerMode,
  AppLanguage,
  AssistantAnswerResponse,
  DesktopSettings,
  SpeechToTextProviderId,
  WorkMode
} from "@voiceassistant/shared";
import { classifyTechnicalFragment } from "@voiceassistant/shared";
import { createTranslator } from "./i18n.js";
import { createSpeechToTextProvider } from "./speech/createSpeechToTextProvider.js";
import type { RecognitionStatus } from "./speech/SpeechToTextProvider.js";

const defaultSettings: DesktopSettings = {
  apiKey: "",
  model: "gpt-4.1-mini",
  interfaceLanguage: "ru",
  answerLanguage: "ru",
  audioInputDeviceId: "",
  answerMode: "short",
  workMode: "manual",
  speechToTextProvider: "mock"
};

const settingsStorageKey = "voiceassistant.settings";
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";
const liveDebounceMs = 650;
const liveThrottleMs = 2000;

type DeviceStatus = "permission_hint" | "unavailable" | "none" | "found" | "error";
type PermissionState = "idle" | "requesting" | "success" | "error";
type PermissionMessage = "unavailable" | "granted" | "denied" | "not_found" | "error" | undefined;

export function App() {
  const [settings, setSettings] = useState<DesktopSettings>(loadSettings);
  const t = useMemo(() => createTranslator(settings.interfaceLanguage), [settings.interfaceLanguage]);
  const speechToTextProvider = useMemo(
    () => createSpeechToTextProvider(settings.speechToTextProvider),
    [settings.speechToTextProvider]
  );
  const [recognizedText, setRecognizedText] = useState("");
  const [answer, setAnswer] = useState("");
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus>("stopped");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>("permission_hint");
  const [permissionState, setPermissionState] = useState<PermissionState>("idle");
  const [permissionMessage, setPermissionMessage] = useState<PermissionMessage>();
  const liveTimerRef = useRef<number>();
  const answeredFragmentsRef = useRef(new Set<string>());
  const lastLiveAnswerAtRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const isListening = recognitionStatus === "listening";

  const statusText = settings.speechToTextProvider === "disabled"
    ? t("disabled")
    : isListening
      ? t("listening")
      : t("stopped");

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

  const requestAnswer = useCallback(async (text: string, workMode: WorkMode): Promise<boolean> => {
    const trimmedText = text.trim();
    if (!trimmedText || requestInFlightRef.current) {
      return false;
    }

    requestInFlightRef.current = true;
    setIsAsking(true);
    setError("");

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
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("permissionError"));
      return false;
    } finally {
      requestInFlightRef.current = false;
      setIsAsking(false);
    }
  }, [settings.answerLanguage, settings.answerMode, settings.apiKey, settings.model, t]);

  const queueLiveAnswer = useCallback((fragment: string) => {
    if (settings.workMode !== "live" || settings.speechToTextProvider !== "mock") {
      return;
    }

    const detection = classifyTechnicalFragment(fragment);
    if (detection.classification === "ignore" || answeredFragmentsRef.current.has(detection.normalizedText)) {
      return;
    }

    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
    }

    const throttleDelay = Math.max(0, liveThrottleMs - (Date.now() - lastLiveAnswerAtRef.current));
    liveTimerRef.current = window.setTimeout(async () => {
      answeredFragmentsRef.current.add(detection.normalizedText);
      lastLiveAnswerAtRef.current = Date.now();
      const sent = await requestAnswer(fragment, "live");
      if (!sent) {
        answeredFragmentsRef.current.delete(detection.normalizedText);
      }
    }, Math.max(liveDebounceMs, throttleDelay));
  }, [requestAnswer, settings.speechToTextProvider, settings.workMode]);

  useEffect(() => () => speechToTextProvider?.stop(), [speechToTextProvider]);
  useEffect(() => { void refreshAudioDevices(); }, [refreshAudioDevices]);
  useEffect(() => {
    if (settings.speechToTextProvider === "disabled") {
      speechToTextProvider?.stop();
      setRecognitionStatus("stopped");
    }
    setRecognitionMessage("");
  }, [settings.speechToTextProvider, speechToTextProvider]);
  useEffect(() => () => {
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
    }
  }, []);

  function startListening() {
    setError("");
    if (!speechToTextProvider || settings.speechToTextProvider === "disabled") {
      setRecognitionStatus("stopped");
      setRecognitionMessage(t("providerDisabledMessage"));
      return;
    }

    setRecognitionMessage("");
    speechToTextProvider.start({
      onResult: (result) => {
        if (!result.isFinal) return;
        setRecognizedText((currentText) => appendRecognizedText(currentText, result.text));
        queueLiveAnswer(result.text);
      },
      onStatusChange: setRecognitionStatus
    });
  }

  function stopListening() {
    speechToTextProvider?.stop();
  }

  function clearRecognizedText() {
    setRecognizedText("");
    setRecognitionMessage("");
    answeredFragmentsRef.current.clear();
    if (liveTimerRef.current !== undefined) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = undefined;
    }
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
        <span className="status-note">{t("realSttUnavailable")}</span>
      </div>

      <section className="workspace">
        <div className="panel recognized-panel">
          <div className="panel-header">
            <div>
              <h2>{t("recognizedPanel")}</h2>
              <p>{settings.speechToTextProvider === "mock" ? t("recognizedHintMock") : t("recognizedHintDisabled")}</p>
            </div>
            <div className="recognition-controls">
              <button className="control-button" type="button" onClick={startListening} disabled={isListening || settings.speechToTextProvider === "disabled"}>
                <Play size={18} />{t("start")}
              </button>
              <button className="control-button stop" type="button" onClick={stopListening} disabled={!isListening}>
                <Square size={18} />{t("stop")}
              </button>
              <button className="secondary-button" type="button" onClick={clearRecognizedText} disabled={!recognizedText}>
                <Trash2 size={18} />{t("clear")}
              </button>
            </div>
          </div>
          <textarea value={recognizedText} onChange={(event) => setRecognizedText(event.target.value)} placeholder={t("recognizedPlaceholder")} />
          {recognitionMessage ? <div className="recognition-message">{recognitionMessage}</div> : null}
          <div className="actions-row">
            <div className="input-device"><Mic size={16} /><span>{selectedAudioDeviceLabel}</span></div>
            {settings.workMode === "manual" ? (
              <button className="ask-button" type="button" onClick={() => void requestAnswer(recognizedText, "manual")} disabled={isAsking || !recognizedText.trim()}>
                <Send size={18} />{isAsking ? t("asking") : t("ask")}
              </button>
            ) : <span className="live-ready">{settings.speechToTextProvider === "mock" ? t("liveReady") : t("realSttUnavailable")}</span>}
          </div>
        </div>

        <div className="panel answer-panel">
          <div className="panel-header"><div><h2>{t("answerPanel")}</h2><p>{t("modeLabel")}: {t(settings.answerMode)}</p></div></div>
          {error ? <div className="error-message">{error}</div> : null}
          <pre className={answer ? "answer-text" : "answer-text answer-empty"}>
            {isAsking ? t("loadingAnswer") : answer || (settings.workMode === "live" ? t("emptyAnswerLive") : t("emptyAnswerManual"))}
          </pre>
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
            <div className="settings-field"><label htmlFor="speech-provider">{t("speechProvider")}</label><select id="speech-provider" value={settings.speechToTextProvider} onChange={(event) => setSettings({ ...settings, speechToTextProvider: event.target.value as SpeechToTextProviderId })}><option value="disabled">{t("disabled")}</option><option value="mock">{t("mockSimulated")}</option></select></div>
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
      speechToTextProvider: isSpeechProvider(parsed.speechToTextProvider) ? parsed.speechToTextProvider : defaultSettings.speechToTextProvider
    };
  } catch {
    return defaultSettings;
  }
}

function isLanguage(value: unknown): value is AppLanguage { return value === "ru" || value === "en"; }
function isAnswerMode(value: unknown): value is AnswerMode { return value === "short" || value === "interview" || value === "learning"; }
function isWorkMode(value: unknown): value is WorkMode { return value === "manual" || value === "live"; }
function isSpeechProvider(value: unknown): value is SpeechToTextProviderId { return value === "disabled" || value === "mock"; }

function appendRecognizedText(currentText: string, phrase: string): string {
  const trimmed = currentText.trim();
  return trimmed ? `${trimmed}\n${phrase}` : phrase;
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
