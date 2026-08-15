import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import type { AppLanguage } from "@voiceassistant/shared";
import { useMentorTranscriptionQueue } from "./speech/useMentorTranscriptionQueue.js";
import { useMicrophoneRecorder } from "./speech/useMicrophoneRecorder.js";
import "./mentor.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";
const settingsStorageKey = "voiceassistant.settings";

interface StoredSettings {
  apiKey?: string;
  answerLanguage?: AppLanguage;
  audioInputDeviceId?: string;
}

interface MentorTranscriptEntry {
  id: number;
  text: string;
  receivedAt: number;
}

export function MentorApp() {
  const storedSettings = useMemo(readStoredSettings, []);
  const [apiKey] = useState(storedSettings.apiKey ?? "");
  const [language] = useState<AppLanguage>(storedSettings.answerLanguage === "en" ? "en" : "ru");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(storedSettings.audioInputDeviceId ?? "");
  const [entries, setEntries] = useState<MentorTranscriptEntry[]>([]);
  const [deviceMessage, setDeviceMessage] = useState("");
  const [error, setError] = useState("");

  const appendTranscript = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    setEntries((current) => [
      ...current,
      { id: Date.now() + current.length, text: cleaned, receivedAt: Date.now() }
    ].slice(-200));
  }, []);

  const transcription = useMentorTranscriptionQueue({
    backendUrl,
    apiKey,
    language,
    onTranscript: appendTranscript,
    maxPendingChunks: 10
  });

  const recorder = useMicrophoneRecorder({
    onChunk: transcription.enqueueChunk,
    enableAudioLevel: false
  });

  const isListening = recorder.status === "recording" || recorder.status === "requesting_permission";

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

  async function startMentor() {
    setError("");
    if (!apiKey.trim()) {
      setError(language === "ru"
        ? "Для первого прототипа Собеседника нужен API-ключ OpenAI для распознавания речи."
        : "The first Mentor prototype requires an OpenAI API key for speech transcription.");
      return;
    }

    transcription.startSession();
    await recorder.start(selectedDeviceId);
  }

  function stopMentor() {
    recorder.stop();
    transcription.stopSession();
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
  const statusLabel = getMentorStatusLabel(recorder.status, transcription.status, language);

  return (
    <main className="mentor-shell">
      <header className="mentor-header">
        <div>
          <div className="mentor-eyebrow">MENTOR MODE · PROTOTYPE 1</div>
          <h1>{language === "ru" ? "Технический собеседник" : "Technical Mentor"}</h1>
          <p>{language === "ru"
            ? "Слушает выбранный аудиовход и автоматически ведёт живую расшифровку без кнопки «Отправить»."
            : "Listens to the selected audio input and continuously transcribes the conversation without a Send button."}</p>
        </div>
        <div className={`mentor-listening-pill ${isListening ? "active" : ""}`}>
          <span />{statusLabel}
        </div>
      </header>

      <section className="mentor-device-bar">
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
            <RefreshCw size={17} />{language === "ru" ? "Обновить устройства" : "Refresh devices"}
          </button>
          <button type="button" className="mentor-primary" onClick={() => void startMentor()} disabled={isListening}>
            <Play size={18} />{language === "ru" ? "Старт" : "Start"}
          </button>
          <button type="button" className="mentor-stop" onClick={stopMentor} disabled={!isListening}>
            <Square size={17} />{language === "ru" ? "Стоп" : "Stop"}
          </button>
          <button type="button" className="mentor-secondary" onClick={() => setEntries([])} disabled={entries.length === 0}>
            <Trash2 size={17} />{language === "ru" ? "Очистить" : "Clear"}
          </button>
        </div>
      </section>

      {deviceMessage ? <div className="mentor-device-message">{deviceMessage}</div> : null}
      {error ? <div className="mentor-error">{error}</div> : null}

      <section className="mentor-grid">
        <article className="mentor-panel mentor-transcript-panel">
          <div className="mentor-panel-title">
            <div>
              <span>{language === "ru" ? "ЖИВОЙ ДИАЛОГ" : "LIVE TRANSCRIPT"}</span>
              <h2>{language === "ru" ? "Что сейчас звучит" : "What is being said"}</h2>
            </div>
            <div className="mentor-counter">{entries.length}</div>
          </div>

          <div className="mentor-transcript" aria-live="polite">
            {entries.length === 0 ? (
              <div className="mentor-empty">
                <Mic size={28} />
                <strong>{language === "ru" ? "Диалог появится здесь" : "Transcript will appear here"}</strong>
                <span>{language === "ru"
                  ? "Выбери CABLE Output (VB-Audio Virtual Cable), нажми «Старт» и включи YouTube или созвон."
                  : "Choose CABLE Output (VB-Audio Virtual Cable), click Start, then play YouTube or join a call."}</span>
              </div>
            ) : entries.map((entry) => (
              <div className="mentor-transcript-entry" key={entry.id}>
                <time>{formatTime(entry.receivedAt)}</time>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>

          <footer className="mentor-diagnostics">
            <span>{language === "ru" ? "Очередь" : "Queue"}: <strong>{transcription.diagnostics.pendingChunks}</strong></span>
            <span>{language === "ru" ? "Обработано" : "Processed"}: <strong>{transcription.diagnostics.processedChunks}</strong></span>
            <span>{language === "ru" ? "Пропущено" : "Dropped"}: <strong>{transcription.diagnostics.droppedChunks}</strong></span>
            {transcription.diagnostics.lastResponseMs !== undefined
              ? <span>STT: <strong>{transcription.diagnostics.lastResponseMs} ms</strong></span>
              : null}
          </footer>
        </article>

        <div className="mentor-answer-stack">
          <article className="mentor-panel mentor-answer-panel mentor-quick-panel">
            <div className="mentor-answer-kicker">⚡ {language === "ru" ? "БЫСТРО" : "QUICK"}</div>
            <h2>{language === "ru" ? "Краткий ответ" : "Quick answer"}</h2>
            <p className="mentor-answer-placeholder">{language === "ru"
              ? "На следующем этапе сюда подключим мгновенный локальный ответ или короткий GPT-ответ. Распознавание при этом продолжит работать."
              : "Next we will connect instant local knowledge or a short GPT response here while transcription continues."}</p>
          </article>

          <article className="mentor-panel mentor-answer-panel mentor-detail-panel">
            <div className="mentor-answer-kicker">{language === "ru" ? "ПОДРОБНЕЕ" : "DETAIL"}</div>
            <h2>{language === "ru" ? "Развёрнутое объяснение" : "Detailed explanation"}</h2>
            <p className="mentor-answer-placeholder">{language === "ru"
              ? "Здесь будет второй независимый ответ: больше контекста, примеры и объяснение терминов. Он не будет блокировать следующий вопрос."
              : "A second independent answer will appear here with more context, examples, and terminology without blocking the next question."}</p>
          </article>
        </div>
      </section>

      <div className="mentor-prototype-note">
        {language === "ru"
          ? "Этап 1: пока используется существующий 4-секундный аудиофрагмент, но теперь фрагменты идут через FIFO-очередь и не выбрасываются, пока предыдущая транскрипция обрабатывается. После проверки перейдём на настоящий streaming/realtime STT."
          : "Stage 1: the existing 4-second audio chunks are still used, but they now pass through a FIFO queue instead of being discarded while a previous transcription is running. Realtime streaming STT comes next."}
      </div>
    </main>
  );
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

function getMentorStatusLabel(
  recorderStatus: ReturnType<typeof useMicrophoneRecorder>["status"],
  transcriptionStatus: ReturnType<typeof useMentorTranscriptionQueue>["status"],
  language: AppLanguage
): string {
  if (recorderStatus === "requesting_permission") return language === "ru" ? "Запрашиваю доступ..." : "Requesting access...";
  if (recorderStatus === "permission_denied") return language === "ru" ? "Доступ запрещён" : "Permission denied";
  if (recorderStatus === "device_unavailable") return language === "ru" ? "Устройство недоступно" : "Device unavailable";
  if (recorderStatus === "error" || transcriptionStatus === "error") return language === "ru" ? "Ошибка" : "Error";
  if (transcriptionStatus === "missing_api_key") return language === "ru" ? "Нужен API-ключ" : "API key required";
  if (recorderStatus === "recording" && transcriptionStatus === "transcribing") return language === "ru" ? "Слушаю · распознаю" : "Listening · transcribing";
  if (recorderStatus === "recording") return language === "ru" ? "Слушаю" : "Listening";
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
