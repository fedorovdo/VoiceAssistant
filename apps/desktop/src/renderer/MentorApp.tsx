import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import type { AppLanguage } from "@voiceassistant/shared";
import { useMentorRealtimeTranscription } from "./speech/useMentorRealtimeTranscription.js";
import type { MentorRealtimeStatus } from "./speech/useMentorRealtimeTranscription.js";
import "./mentor.css";
import "./mentorHistory.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";
const settingsStorageKey = "voiceassistant.settings";
const mentorSkipToken = "[[SKIP]]";

interface StoredSettings {
  apiKey?: string;
  model?: string;
  answerLanguage?: AppLanguage;
  audioInputDeviceId?: string;
}

interface MentorTranscriptEntry {
  id: number;
  text: string;
  receivedAt: number;
}

type MentorAnswerStatus = "idle" | "loading" | "ready" | "skipped" | "error";

interface MentorAnswerHistoryEntry {
  id: number;
  question: string;
  answer: string;
  receivedAt: number;
  latencyMs: number;
  isError?: boolean;
}

interface AssistantApiResponse {
  answer?: string;
  error?: string;
}

export function MentorApp() {
  const storedSettings = useMemo(readStoredSettings, []);
  const [apiKey] = useState(storedSettings.apiKey ?? "");
  const [model] = useState(storedSettings.model ?? "gpt-4.1-mini");
  const [language] = useState<AppLanguage>(storedSettings.answerLanguage === "en" ? "en" : "ru");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(storedSettings.audioInputDeviceId ?? "");
  const [entries, setEntries] = useState<MentorTranscriptEntry[]>([]);
  const entriesRef = useRef<MentorTranscriptEntry[]>([]);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const autoFollowTranscriptRef = useRef(true);
  const quickScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const autoFollowQuickRef = useRef(true);
  const autoFollowDetailRef = useRef(true);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [deviceMessage, setDeviceMessage] = useState("");
  const [error, setError] = useState("");
  const [quickAnswers, setQuickAnswers] = useState<MentorAnswerHistoryEntry[]>([]);
  const [detailAnswers, setDetailAnswers] = useState<MentorAnswerHistoryEntry[]>([]);
  const [quickStatus, setQuickStatus] = useState<MentorAnswerStatus>("idle");
  const [detailStatus, setDetailStatus] = useState<MentorAnswerStatus>("idle");
  const answerEpochRef = useRef(0);
  const answerSequenceRef = useRef(0);
  const lastAnswerTriggerRef = useRef<{ text: string; at: number }>();

  const requestMentorAnswers = useCallback((latestText: string, previousEntries: MentorTranscriptEntry[]) => {
    const recentContext = previousEntries.slice(-5).map((entry) => entry.text);
    if (!looksLikeMentorPrompt(latestText, recentContext)) {
      return;
    }

    const normalizedTrigger = latestText.replace(/\s+/g, " ").trim().toLowerCase();
    const now = Date.now();
    const previousTrigger = lastAnswerTriggerRef.current;
    if (
      previousTrigger
      && now - previousTrigger.at < 1800
      && (previousTrigger.text.includes(normalizedTrigger) || normalizedTrigger.includes(previousTrigger.text))
    ) {
      return;
    }
    lastAnswerTriggerRef.current = { text: normalizedTrigger, at: now };

    const epoch = answerEpochRef.current;
    const requestId = ++answerSequenceRef.current;
    const question = buildQuestionPreview(latestText, recentContext);

    setQuickStatus("loading");
    setDetailStatus("loading");

    const quickStartedAt = performance.now();
    void requestMentorAnswer({
      apiKey,
      model,
      language,
      latestText,
      recentContext,
      mode: "short"
    }).then((answer) => {
      if (epoch !== answerEpochRef.current) return;
      if (isSkipAnswer(answer)) {
        setQuickStatus("skipped");
        return;
      }
      setQuickAnswers((current) => [
        ...current,
        {
          id: requestId,
          question,
          answer,
          receivedAt: Date.now(),
          latencyMs: Math.round(performance.now() - quickStartedAt)
        }
      ].slice(-40));
      setQuickStatus("ready");
    }).catch((requestError) => {
      if (epoch !== answerEpochRef.current) return;
      setQuickAnswers((current) => [
        ...current,
        {
          id: requestId,
          question,
          answer: toVisibleError(requestError, language),
          receivedAt: Date.now(),
          latencyMs: Math.round(performance.now() - quickStartedAt),
          isError: true
        }
      ].slice(-40));
      setQuickStatus("error");
    });

    const detailStartedAt = performance.now();
    void requestMentorAnswer({
      apiKey,
      model,
      language,
      latestText,
      recentContext,
      mode: "learning"
    }).then((answer) => {
      if (epoch !== answerEpochRef.current) return;
      if (isSkipAnswer(answer)) {
        setDetailStatus("skipped");
        return;
      }
      setDetailAnswers((current) => [
        ...current,
        {
          id: requestId,
          question,
          answer,
          receivedAt: Date.now(),
          latencyMs: Math.round(performance.now() - detailStartedAt)
        }
      ].slice(-40));
      setDetailStatus("ready");
    }).catch((requestError) => {
      if (epoch !== answerEpochRef.current) return;
      setDetailAnswers((current) => [
        ...current,
        {
          id: requestId,
          question,
          answer: toVisibleError(requestError, language),
          receivedAt: Date.now(),
          latencyMs: Math.round(performance.now() - detailStartedAt),
          isError: true
        }
      ].slice(-40));
      setDetailStatus("error");
    });
  }, [apiKey, language, model]);

  const appendTranscript = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    const previousEntries = entriesRef.current;
    const nextEntries = [
      ...previousEntries,
      { id: Date.now() + previousEntries.length, text: cleaned, receivedAt: Date.now() }
    ].slice(-200);

    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    setPartialTranscript("");
    requestMentorAnswers(cleaned, previousEntries);
  }, [requestMentorAnswers]);

  const realtime = useMentorRealtimeTranscription({
    backendUrl,
    apiKey,
    language,
    onTranscript: appendTranscript,
    onPartialTranscript: setPartialTranscript,
    onError: setError
  });

  const isListening = isRealtimeActive(realtime.status);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceMessage(language === "ru" ? "Список аудиоустройств недоступен." : "Audio device discovery is unavailable.");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      setAudioDevices(inputs);
      setDeviceMessage(inputs.length > 0
        ? language === "ru" ? `Найдено аудиовходов: ${inputs.length}` : `Audio inputs found: ${inputs.length}`
        : language === "ru" ? "Аудиовходы не найдены." : "No audio inputs found.");
    } catch {
      setDeviceMessage(language === "ru" ? "Не удалось получить список аудиоустройств." : "Could not enumerate audio devices.");
    }
  }, [language]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    scrollToBottomIfFollowing(transcriptScrollRef.current, autoFollowTranscriptRef.current);
  }, [entries]);

  useEffect(() => {
    scrollToBottomIfFollowing(quickScrollRef.current, autoFollowQuickRef.current);
  }, [quickAnswers]);

  useEffect(() => {
    scrollToBottomIfFollowing(detailScrollRef.current, autoFollowDetailRef.current);
  }, [detailAnswers]);

  async function startMentor() {
    setError("");
    if (!apiKey.trim()) {
      setError(language === "ru"
        ? "Для Realtime-распознавания нужен API-ключ OpenAI из основных настроек VoiceAssistant."
        : "Realtime transcription requires the OpenAI API key from the main VoiceAssistant settings.");
      return;
    }

    await realtime.start(selectedDeviceId);
  }

  function stopMentor() {
    realtime.stop();
    setPartialTranscript("");
  }

  function clearMentor() {
    answerEpochRef.current += 1;
    entriesRef.current = [];
    setEntries([]);
    setPartialTranscript("");
    setQuickAnswers([]);
    setDetailAnswers([]);
    setQuickStatus("idle");
    setDetailStatus("idle");
    lastAnswerTriggerRef.current = undefined;
    autoFollowTranscriptRef.current = true;
    autoFollowQuickRef.current = true;
    autoFollowDetailRef.current = true;
  }

  async function requestPermissionAndRefresh() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refreshDevices();
    } catch {
      setDeviceMessage(language === "ru"
        ? "Windows не предоставил доступ к аудиоустройству."
        : "Windows did not grant access to the audio device.");
    }
  }

  function changeAudioDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    persistAudioDevice(deviceId);
  }

  const selectedDeviceLabel = getSelectedDeviceLabel(audioDevices, selectedDeviceId, language);
  const statusLabel = getMentorStatusLabel(realtime.status, language);
  const hasTranscript = entries.length > 0 || partialTranscript.trim().length > 0;
  const hasAnswers = quickAnswers.length > 0 || detailAnswers.length > 0;
  const activeTranscript = partialTranscript.trim()
    || (isListening
      ? language === "ru" ? "Слушаю следующую реплику…" : "Listening for the next turn…"
      : language === "ru" ? "Распознавание остановлено." : "Transcription stopped.");

  return (
    <main className="mentor-shell mentor-shell-history">
      <header className="mentor-header mentor-header-compact">
        <div>
          <div className="mentor-eyebrow">MENTOR MODE · REALTIME</div>
          <h1>{language === "ru" ? "Технический собеседник" : "Technical Mentor"}</h1>
          <p>{language === "ru"
            ? "Живой технический контекст, быстрый ответ и подробное объяснение."
            : "Live technical context, a quick answer, and a detailed explanation."}</p>
        </div>
        <div className={`mentor-listening-pill ${isListening ? "active" : ""}`}>
          <span />{statusLabel}
        </div>
      </header>

      <section className="mentor-device-bar mentor-device-bar-compact">
        <div className="mentor-device-select">
          <label htmlFor="mentor-audio-device">{language === "ru" ? "Источник звука" : "Audio source"}</label>
          <select
            id="mentor-audio-device"
            value={selectedDeviceId}
            onChange={(event) => changeAudioDevice(event.target.value)}
            disabled={isListening}
          >
            <option value="">{language === "ru" ? "Системный аудиовход по умолчанию" : "System default audio input"}</option>
            {selectedDeviceId && !audioDevices.some((device) => device.deviceId === selectedDeviceId)
              ? <option value={selectedDeviceId}>{language === "ru" ? "Ранее выбранное устройство" : "Previously selected device"}</option>
              : null}
            {audioDevices.map((device, index) => (
              <option key={device.deviceId || `${device.groupId}-${index}`} value={device.deviceId}>
                {device.label.trim() || `${language === "ru" ? "Аудиовход" : "Audio input"} ${index + 1}`}
              </option>
            ))}
          </select>
          <small><Mic size={14} />{selectedDeviceLabel}</small>
        </div>

        <div className="mentor-controls">
          <button type="button" className="mentor-secondary" onClick={() => void requestPermissionAndRefresh()} disabled={isListening}>
            <RefreshCw size={17} />{language === "ru" ? "Обновить" : "Refresh"}
          </button>
          <button type="button" className="mentor-primary" onClick={() => void startMentor()} disabled={isListening}>
            <Play size={18} />{language === "ru" ? "Старт" : "Start"}
          </button>
          <button type="button" className="mentor-stop" onClick={stopMentor} disabled={!isListening}>
            <Square size={17} />{language === "ru" ? "Стоп" : "Stop"}
          </button>
          <button type="button" className="mentor-secondary" onClick={clearMentor} disabled={!hasTranscript && !hasAnswers}>
            <Trash2 size={17} />{language === "ru" ? "Очистить" : "Clear"}
          </button>
        </div>
      </section>

      {deviceMessage ? <div className="mentor-device-message">{deviceMessage}</div> : null}
      {error ? <div className="mentor-error">{error}</div> : null}

      <section className="mentor-stack">
        <article className="mentor-panel mentor-transcript-panel mentor-resizable-panel">
          <div className="mentor-panel-title">
            <div>
              <span>{language === "ru" ? "ЖИВОЙ ДИАЛОГ · FAST VAD" : "LIVE TRANSCRIPT · FAST VAD"}</span>
              <h2>{language === "ru" ? "Что сейчас звучит" : "What is being said"}</h2>
            </div>
            <div className="mentor-counter">{entries.length}</div>
          </div>

          <div
            ref={transcriptScrollRef}
            className="mentor-transcript"
            aria-live="polite"
            onScroll={() => updateAutoFollow(transcriptScrollRef.current, autoFollowTranscriptRef)}
          >
            {entries.length === 0 ? (
              <div className="mentor-empty mentor-empty-compact">
                <Mic size={24} />
                <strong>{language === "ru" ? "Диалог появится здесь" : "Transcript will appear here"}</strong>
                <span>{language === "ru"
                  ? "Выбери CABLE Output, нажми «Старт» и включи YouTube или созвон."
                  : "Choose CABLE Output, click Start, then play YouTube or join a call."}</span>
              </div>
            ) : entries.map((entry) => (
              <div className="mentor-transcript-entry" key={entry.id}>
                <time>{formatTime(entry.receivedAt)}</time>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>

          <div className={`mentor-live-line ${partialTranscript.trim() ? "active" : ""}`} aria-live="polite">
            <span>{language === "ru" ? "СЕЙЧАС" : "NOW"}</span>
            <p>{activeTranscript}{partialTranscript.trim() ? " ▌" : ""}</p>
          </div>

          <footer className="mentor-diagnostics">
            <span>{language === "ru" ? "Реплик" : "Turns"}: <strong>{realtime.diagnostics.completedTurns}</strong></span>
            <span>VAD: <strong>{realtime.diagnostics.speechStarts}/{realtime.diagnostics.speechStops}</strong></span>
            {realtime.diagnostics.lastTranscriptMs !== undefined
              ? <span>{language === "ru" ? "После паузы" : "After pause"}: <strong>{realtime.diagnostics.lastTranscriptMs} ms</strong></span>
              : null}
            <span>WebRTC: <strong>{realtime.diagnostics.connectionState}</strong></span>
            <span className="mentor-resize-label">↕ {language === "ru" ? "размер меняется мышкой" : "drag to resize"}</span>
          </footer>
        </article>

        <article className="mentor-panel mentor-answer-panel mentor-quick-panel mentor-resizable-panel mentor-answer-history-panel">
          <div className="mentor-answer-heading">
            <div>
              <div className="mentor-answer-kicker">⚡ {language === "ru" ? "БЫСТРО" : "QUICK"}</div>
              <h2>{language === "ru" ? "Краткие ответы" : "Quick answers"}</h2>
            </div>
            <span className="mentor-resize-label">↕</span>
          </div>
          <div
            ref={quickScrollRef}
            className="mentor-answer-history"
            onScroll={() => updateAutoFollow(quickScrollRef.current, autoFollowQuickRef)}
          >
            {quickAnswers.length === 0 ? (
              <div className="mentor-answer-empty">
                {renderAnswerPanel({
                  status: quickStatus,
                  answer: "",
                  language,
                  loadingRu: "Понял вопрос. Готовлю короткую подсказку…",
                  loadingEn: "Question detected. Preparing a quick hint…",
                  idleRu: "Краткие ответы будут сохраняться здесь. Новые не удаляют предыдущие.",
                  idleEn: "Quick answers are kept here. New answers do not remove previous ones."
                })}
              </div>
            ) : quickAnswers.map((item) => (
              <AnswerHistoryItem key={`quick-${item.id}`} item={item} language={language} />
            ))}
            {quickStatus === "loading" && quickAnswers.length > 0
              ? <div className="mentor-answer-loading">{language === "ru" ? "Готовлю следующий краткий ответ…" : "Preparing the next quick answer…"}</div>
              : null}
          </div>
        </article>

        <article className="mentor-panel mentor-answer-panel mentor-detail-panel mentor-resizable-panel mentor-answer-history-panel">
          <div className="mentor-answer-heading">
            <div>
              <div className="mentor-answer-kicker">{language === "ru" ? "ПОДРОБНЕЕ" : "DETAIL"}</div>
              <h2>{language === "ru" ? "Развёрнутые ответы" : "Detailed answers"}</h2>
            </div>
            <span className="mentor-resize-label">↕</span>
          </div>
          <div
            ref={detailScrollRef}
            className="mentor-answer-history"
            onScroll={() => updateAutoFollow(detailScrollRef.current, autoFollowDetailRef)}
          >
            {detailAnswers.length === 0 ? (
              <div className="mentor-answer-empty">
                {renderAnswerPanel({
                  status: detailStatus,
                  answer: "",
                  language,
                  loadingRu: "Параллельно собираю более полный ответ с контекстом и примером…",
                  loadingEn: "Building a fuller contextual answer in parallel…",
                  idleRu: "Подробные ответы будут накапливаться здесь и останутся доступны для прокрутки.",
                  idleEn: "Detailed answers accumulate here and remain available for scrolling."
                })}
              </div>
            ) : detailAnswers.map((item) => (
              <AnswerHistoryItem key={`detail-${item.id}`} item={item} language={language} />
            ))}
            {detailStatus === "loading" && detailAnswers.length > 0
              ? <div className="mentor-answer-loading">{language === "ru" ? "Готовлю следующий подробный ответ…" : "Preparing the next detailed answer…"}</div>
              : null}
          </div>
        </article>
      </section>

      <div className="mentor-prototype-note mentor-prototype-note-compact">
        {language === "ru"
          ? `Fast VAD ≈ 300 мс · контекст последних реплик · ответы сохраняются в истории · модель ${model}.`
          : `Fast VAD ≈ 300 ms · recent-turn context · answer history is preserved · model ${model}.`}
      </div>
    </main>
  );
}

function AnswerHistoryItem({ item, language }: { item: MentorAnswerHistoryEntry; language: AppLanguage }) {
  return (
    <section className={`mentor-answer-item ${item.isError ? "error" : ""}`}>
      <div className="mentor-answer-item-meta">
        <time>{formatTime(item.receivedAt)}</time>
        <span>{item.latencyMs} ms</span>
      </div>
      <div className="mentor-answer-question">{item.question}</div>
      <div className="mentor-answer-text">{item.answer}</div>
      <div className="mentor-answer-item-footer">
        {language === "ru" ? "Ответ сохранён в истории" : "Saved in answer history"}
      </div>
    </section>
  );
}

async function requestMentorAnswer(options: {
  apiKey: string;
  model: string;
  language: AppLanguage;
  latestText: string;
  recentContext: string[];
  mode: "short" | "learning";
}): Promise<string> {
  const prompt = buildMentorAnswerPrompt(options.latestText, options.recentContext, options.language);
  const response = await fetch(`${backendUrl}/api/assistant/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: prompt,
      mode: options.mode,
      workMode: "manual",
      answerLanguage: options.language,
      model: options.model,
      apiKey: options.apiKey
    })
  });

  const payload = await response.json() as AssistantApiResponse;
  if (!response.ok || !payload.answer) {
    throw new Error(payload.error || `Assistant request failed with status ${response.status}.`);
  }

  return payload.answer.trim();
}

function buildMentorAnswerPrompt(latestText: string, recentContext: string[], language: AppLanguage): string {
  const context = recentContext.length > 0
    ? recentContext.map((text, index) => `${index + 1}. ${trimContext(text)}`).join("\n")
    : language === "ru" ? "нет предыдущего контекста" : "no previous context";

  if (language === "en") {
    return [
      "You are the silent technical mentor following a live conversation.",
      "Use the recent transcript to reconstruct a question if the VAD split it across neighboring fragments.",
      "Answer the latest unresolved technical question, request for explanation, troubleshooting task, or interview question.",
      `If there is nothing that should be answered now, return exactly ${mentorSkipToken} and nothing else.`,
      "Do not discuss the transcription process. Prefer practical, interview-ready technical wording.",
      "RECENT CONTEXT:",
      context,
      "LATEST FRAGMENT:",
      trimContext(latestText)
    ].join("\n");
  }

  return [
    "Ты тихий технический ментор, который следит за живым разговором.",
    "Используй последние реплики, чтобы восстановить вопрос, если быстрый VAD разрезал его на соседние фрагменты.",
    "Ответь на последний незакрытый технический вопрос, просьбу объяснить, задачу по диагностике или вопрос собеседования.",
    `Если сейчас отвечать не на что, верни ровно ${mentorSkipToken} и больше ничего.`,
    "Не обсуждай процесс транскрипции. Ответ должен быть практичным и пригодным для собеседования или рабочего разговора.",
    "ПРЕДЫДУЩИЙ КОНТЕКСТ:",
    context,
    "ПОСЛЕДНИЙ ФРАГМЕНТ:",
    trimContext(latestText)
  ].join("\n");
}

function looksLikeMentorPrompt(latestText: string, recentContext: string[]): boolean {
  const combined = [...recentContext.slice(-2), latestText].join(" ").toLowerCase();
  const questionCues = [
    "?", "что такое", "что знаете", "что вы знаете", "как ", "каким ", "какая ", "какие ",
    "почему", "зачем", "для чего", "чем отличается", "расскаж", "объясн", "опиш", "назов",
    "покажи", "как бы вы", "что будете", "что произойдет", "что произойдёт", "можно ли",
    "what ", "how ", "why ", "explain", "tell me", "describe", "difference between"
  ];

  if (questionCues.some((cue) => combined.includes(cue))) {
    return true;
  }

  const shortTechnicalPhrase = latestText.trim().split(/\s+/).length <= 8;
  return shortTechnicalPhrase && /\b(proxmox|pbs|linux|docker|kubernetes|zabbix|dns|dhcp|vlan|gpo|samba|systemd|selinux|tcp|udp|osi|active directory|powershell|bash|chmod|chown|acl)\b/i.test(latestText);
}

function renderAnswerPanel(options: {
  status: MentorAnswerStatus;
  answer: string;
  language: AppLanguage;
  loadingRu: string;
  loadingEn: string;
  idleRu: string;
  idleEn: string;
}): string {
  if (options.status === "loading") return options.language === "ru" ? options.loadingRu : options.loadingEn;
  if (options.status === "ready" || options.status === "error") return options.answer;
  if (options.status === "skipped") return options.language === "ru" ? "Слушаю дальше. Отдельного вопроса для ответа пока нет." : "Listening on. No separate question needs an answer yet.";
  return options.language === "ru" ? options.idleRu : options.idleEn;
}

function buildQuestionPreview(latestText: string, recentContext: string[]): string {
  const latest = latestText.replace(/\s+/g, " ").trim();
  if (latest.length >= 28 || recentContext.length === 0) {
    return latest.length > 240 ? `${latest.slice(0, 240)}…` : latest;
  }

  const combined = [...recentContext.slice(-1), latest].join(" ").replace(/\s+/g, " ").trim();
  return combined.length > 240 ? `${combined.slice(0, 240)}…` : combined;
}

function scrollToBottomIfFollowing(node: HTMLDivElement | null, shouldFollow: boolean) {
  if (!node || !shouldFollow) return;
  node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
}

function updateAutoFollow(node: HTMLDivElement | null, followRef: { current: boolean }) {
  if (!node) return;
  const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
  followRef.current = distanceFromBottom < 70;
}

function isSkipAnswer(answer: string): boolean {
  return answer.replace(/\s+/g, " ").trim().toUpperCase().includes(mentorSkipToken);
}

function trimContext(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? `${normalized.slice(0, 500)}…` : normalized;
}

function toVisibleError(error: unknown, language: AppLanguage): string {
  if (error instanceof Error && error.message) return error.message;
  return language === "ru" ? "Не удалось получить ответ." : "Could not get an answer.";
}

function readStoredSettings(): StoredSettings {
  const raw = localStorage.getItem(settingsStorageKey);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as StoredSettings;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function persistAudioDevice(deviceId: string) {
  const current = readStoredSettings();
  localStorage.setItem(settingsStorageKey, JSON.stringify({ ...current, audioInputDeviceId: deviceId }));
}

function getSelectedDeviceLabel(devices: MediaDeviceInfo[], selectedDeviceId: string, language: AppLanguage): string {
  if (!selectedDeviceId) return language === "ru" ? "Используется системный аудиовход" : "Using system default audio input";
  const selected = devices.find((device) => device.deviceId === selectedDeviceId);
  return selected?.label || (language === "ru" ? "Выбрано сохранённое устройство" : "Using saved device");
}

function isRealtimeActive(status: MentorRealtimeStatus): boolean {
  return status === "requesting_device"
    || status === "connecting"
    || status === "listening"
    || status === "speech_detected"
    || status === "transcribing";
}

function getMentorStatusLabel(status: MentorRealtimeStatus, language: AppLanguage): string {
  if (status === "requesting_device") return language === "ru" ? "Открываю аудиовход..." : "Opening audio input...";
  if (status === "connecting") return language === "ru" ? "Подключаю Realtime..." : "Connecting Realtime...";
  if (status === "listening") return language === "ru" ? "Слушаю" : "Listening";
  if (status === "speech_detected") return language === "ru" ? "Слышу речь" : "Speech detected";
  if (status === "transcribing") return language === "ru" ? "Распознаю..." : "Transcribing...";
  if (status === "missing_api_key") return language === "ru" ? "Нужен API-ключ" : "API key required";
  if (status === "error") return language === "ru" ? "Ошибка" : "Error";
  return language === "ru" ? "Остановлено" : "Stopped";
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
