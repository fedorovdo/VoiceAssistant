import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import type { AppLanguage } from "@voiceassistant/shared";
import { useMentorRealtimeTranscription } from "./speech/useMentorRealtimeTranscription.js";
import type { MentorRealtimeStatus } from "./speech/useMentorRealtimeTranscription.js";
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

  const realtime = useMentorRealtimeTranscription({
    backendUrl,
    apiKey,
    language,
    onTranscript: appendTranscript,
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

  return (
    <main className="mentor-shell">
      <header className="mentor-header">
        <div>
          <div className="mentor-eyebrow">MENTOR MODE · REALTIME PROTOTYPE</div>
          <h1>{language === "ru" ? "Технический собеседник" : "Technical Mentor"}</h1>
          <p>{language === "ru"
            ? "Непрерывно слушает выбранный аудиовход. OpenAI Realtime определяет границы реплик по паузам и возвращает готовые фразы без кнопки «Отправить»."
            : "Continuously listens to the selected audio input. OpenAI Realtime detects speech turns and returns complete phrases without a Send button."}</p>
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
              <span>{language === "ru" ? "ЖИВОЙ ДИАЛОГ · REALTIME VAD" : "LIVE TRANSCRIPT · REALTIME VAD"}</span>
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
                  ? "Выбери CABLE Output (VB-Audio Virtual Cable), нажми «Старт» и включи YouTube или созвон. Реплика появится после короткой паузы в речи."
                  : "Choose CABLE Output (VB-Audio Virtual Cable), click Start, then play YouTube or join a call. A turn appears after a short speech pause."}</span>
              </div>
            ) : entries.map((entry) => (
              <div className="mentor-transcript-entry" key={entry.id}>
                <time>{formatTime(entry.receivedAt)}</time>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>

          <footer className="mentor-diagnostics">
            <span>{language === "ru" ? "Реплик" : "Turns"}: <strong>{realtime.diagnostics.completedTurns}</strong></span>
            <span>VAD start: <strong>{realtime.diagnostics.speechStarts}</strong></span>
            <span>VAD stop: <strong>{realtime.diagnostics.speechStops}</strong></span>
            {realtime.diagnostics.lastTranscriptMs !== undefined
              ? <span>{language === "ru" ? "После паузы" : "After pause"}: <strong>{realtime.diagnostics.lastTranscriptMs} ms</strong></span>
              : null}
            <span>WebRTC: <strong>{realtime.diagnostics.connectionState}</strong></span>
          </footer>
        </article>

        <div className="mentor-answer-stack">
          <article className="mentor-panel mentor-answer-panel mentor-quick-panel">
            <div className="mentor-answer-kicker">⚡ {language === "ru" ? "БЫСТРО" : "QUICK"}</div>
            <h2>{language === "ru" ? "Краткий ответ" : "Quick answer"}</h2>
            <p className="mentor-answer-placeholder">{language === "ru"
              ? "Следующим шагом сюда подключим мгновенный локальный ответ или короткий GPT-ответ. Realtime-распознавание продолжит слушать параллельно."
              : "Next we will connect instant local knowledge or a short GPT response while Realtime transcription keeps listening in parallel."}</p>
          </article>

          <article className="mentor-panel mentor-answer-panel mentor-detail-panel">
            <div className="mentor-answer-kicker">{language === "ru" ? "ПОДРОБНЕЕ" : "DETAIL"}</div>
            <h2>{language === "ru" ? "Развёрнутое объяснение" : "Detailed explanation"}</h2>
            <p className="mentor-answer-placeholder">{language === "ru"
              ? "Здесь будет второй независимый ответ: больше контекста, примеры и объяснение терминов. Он не будет блокировать следующую реплику."
              : "A second independent answer will appear here with more context, examples, and terminology without blocking the next turn."}</p>
          </article>
        </div>
      </section>

      <div className="mentor-prototype-note">
        {language === "ru"
          ? "Этап 2: 4-секундная нарезка отключена. Аудиотрек CABLE Output идёт в OpenAI по WebRTC непрерывно. Server VAD завершает реплику после примерно 800 мс тишины, а технический prompt помогает сохранять названия продуктов, протоколов и команд."
          : "Stage 2: fixed 4-second slicing is gone. The CABLE Output audio track streams continuously to OpenAI over WebRTC. Server VAD closes a turn after about 800 ms of silence, with a technical prompt guiding terminology."}
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
  if (status === "transcribing") return language === "ru" ? "Завершаю реплику..." : "Finalizing turn...";
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
