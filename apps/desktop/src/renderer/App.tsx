import { FormEvent, useEffect, useMemo, useState } from "react";
import { Mic, Settings, Square, Play, Send, X, Trash2 } from "lucide-react";
import type {
  AnswerMode,
  AssistantAnswerResponse,
  DesktopSettings,
  SpeechToTextProviderId
} from "@voiceassistant/shared";
import { createSpeechToTextProvider } from "./speech/createSpeechToTextProvider.js";
import type { RecognitionStatus } from "./speech/SpeechToTextProvider.js";

const defaultSettings: DesktopSettings = {
  apiKey: "",
  model: "gpt-4.1-mini",
  language: "ru",
  audioInputDevice: "Default microphone",
  answerMode: "interview",
  speechToTextProvider: "mock"
};

const settingsStorageKey = "voiceassistant.settings";
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";

export function App() {
  const [settings, setSettings] = useState<DesktopSettings>(loadSettings);
  const speechToTextProvider = useMemo(
    () => createSpeechToTextProvider(settings.speechToTextProvider),
    [settings.speechToTextProvider]
  );
  const [recognizedText, setRecognizedText] = useState("\u0418\u0437 \u0447\u0435\u0433\u043e \u0441\u043e\u0441\u0442\u043e\u0438\u0442 Kubernetes?");
  const [answer, setAnswer] = useState("");
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus>("stopped");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const isListening = recognitionStatus === "listening";

  const statusText = useMemo(() => {
    if (settings.speechToTextProvider === "disabled") {
      return "Disabled";
    }

    if (isListening) {
      return "Listening";
    }

    return "Stopped";
  }, [isListening, settings.speechToTextProvider]);

  useEffect(() => {
    return () => {
      speechToTextProvider?.stop();
    };
  }, [speechToTextProvider]);

  useEffect(() => {
    if (settings.speechToTextProvider === "disabled") {
      speechToTextProvider?.stop();
      setRecognitionStatus("stopped");
    } else {
      setRecognitionMessage("");
    }
  }, [settings.speechToTextProvider, speechToTextProvider]);

  async function askAssistant() {
    setIsAsking(true);
    setError("");

    try {
      setAnswer("");
      const response = await fetch(`${backendUrl}/api/assistant/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: recognizedText,
          mode: settings.answerMode,
          model: settings.model,
          apiKey: settings.apiKey
        })
      });

      const data = (await response.json()) as AssistantAnswerResponse | { error: string };

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Assistant request failed.");
      }

      setAnswer("answer" in data ? data.answer : "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Assistant request failed.");
    } finally {
      setIsAsking(false);
    }
  }

  function startListening() {
    setError("");
    if (!speechToTextProvider) {
      setRecognitionStatus("stopped");
      setRecognitionMessage("Speech-to-text provider is disabled in settings.");
      return;
    }

    setRecognitionMessage("");
    speechToTextProvider.start({
      onResult: (result) => {
        if (!result.isFinal) {
          return;
        }

        setRecognizedText((currentText) => appendRecognizedText(currentText, result.text));
      },
      onStatusChange: setRecognitionStatus
    });
  }

  function stopListening() {
    speechToTextProvider?.stop();
  }

  function clearRecognizedText() {
    setRecognizedText("");
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
    setIsSettingsOpen(false);
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>VoiceAssistant</h1>
          <p>Local technical helper</p>
        </div>
        <div className="toolbar">
          <span className={isListening ? "status status-active" : "status"}>{statusText}</span>
          <button className="icon-button" type="button" onClick={() => setIsSettingsOpen(true)} title="Settings">
            <Settings size={20} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="panel recognized-panel">
          <div className="panel-header">
            <div>
              <h2>Recognized question</h2>
              <p>Microphone input is simulated for the MVP.</p>
            </div>
            <div className="recognition-controls">
              <button
                className="control-button"
                type="button"
                onClick={startListening}
                disabled={isListening}
              >
                <Play size={18} />
                Start
              </button>
              <button
                className="control-button stop"
                type="button"
                onClick={stopListening}
                disabled={!isListening}
              >
                <Square size={18} />
                Stop
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={clearRecognizedText}
                disabled={recognizedText.length === 0}
              >
                <Trash2 size={18} />
                Clear
              </button>
            </div>
          </div>
          <textarea
            value={recognizedText}
            onChange={(event) => setRecognizedText(event.target.value)}
            placeholder="\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043b\u0438 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u043d\u043d\u044b\u0439 \u0442\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0432\u043e\u043f\u0440\u043e\u0441"
          />
          {recognitionMessage ? <div className="recognition-message">{recognitionMessage}</div> : null}
          <div className="actions-row">
            <div className="input-device">
              <Mic size={16} />
              <span>{settings.audioInputDevice}</span>
            </div>
            <button className="ask-button" type="button" onClick={askAssistant} disabled={isAsking}>
              <Send size={18} />
              {isAsking ? "Asking..." : "Ask"}
            </button>
          </div>
        </div>

        <div className="panel answer-panel">
          <div className="panel-header">
            <div>
              <h2>Assistant answer</h2>
              <p>Mode: {settings.answerMode}</p>
            </div>
          </div>
          {error ? <div className="error-message">{error}</div> : null}
          <pre className={answer ? "answer-text" : "answer-text answer-empty"}>
            {isAsking ? "\u0416\u0434\u0443 \u043e\u0442\u0432\u0435\u0442 \u043e\u0442 \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442\u0430..." : answer || "\u041e\u0442\u0432\u0435\u0442 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0437\u0434\u0435\u0441\u044c \u043f\u043e\u0441\u043b\u0435 \u043d\u0430\u0436\u0430\u0442\u0438\u044f Ask."}
          </pre>
        </div>
      </section>

      {isSettingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="settings-dialog" onSubmit={saveSettings}>
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="icon-button" type="button" onClick={() => setIsSettingsOpen(false)} title="Close">
                <X size={20} />
              </button>
            </div>

            <label>
              OpenAI API key
              <input
                type="password"
                value={settings.apiKey}
                onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                placeholder="Stored locally later"
              />
            </label>

            <label>
              Answer model
              <input
                type="text"
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              />
            </label>

            <label>
              Audio input device
              <input
                type="text"
                value={settings.audioInputDevice}
                onChange={(event) => setSettings({ ...settings, audioInputDevice: event.target.value })}
                placeholder="Microphone selection placeholder"
              />
            </label>

            <label>
              Speech-to-text provider
              <select
                value={settings.speechToTextProvider}
                onChange={(event) => setSettings({ ...settings, speechToTextProvider: event.target.value as SpeechToTextProviderId })}
              >
                <option value="disabled">Disabled</option>
                <option value="mock">Mock</option>
              </select>
            </label>

            <label>
              Language
              <select
                value={settings.language}
                onChange={(event) => setSettings({ ...settings, language: event.target.value as DesktopSettings["language"] })}
              >
                <option value="ru">Russian</option>
                <option value="en">English</option>
              </select>
            </label>

            <label>
              Answer mode
              <select
                value={settings.answerMode}
                onChange={(event) => setSettings({ ...settings, answerMode: event.target.value as AnswerMode })}
              >
                <option value="short">Short</option>
                <option value="interview">Interview</option>
                <option value="learning">Learning</option>
              </select>
            </label>

            <button className="save-button" type="submit">Save</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function loadSettings(): DesktopSettings {
  const rawSettings = localStorage.getItem(settingsStorageKey);
  if (!rawSettings) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<DesktopSettings>;

    return {
      ...defaultSettings,
      ...parsed,
      answerMode: isAnswerMode(parsed.answerMode) ? parsed.answerMode : defaultSettings.answerMode,
      language: parsed.language === "en" || parsed.language === "ru" ? parsed.language : defaultSettings.language,
      speechToTextProvider: isSpeechToTextProvider(parsed.speechToTextProvider)
        ? parsed.speechToTextProvider
        : defaultSettings.speechToTextProvider
    };
  } catch {
    return defaultSettings;
  }
}

function isAnswerMode(value: unknown): value is AnswerMode {
  return value === "short" || value === "interview" || value === "learning";
}

function isSpeechToTextProvider(value: unknown): value is SpeechToTextProviderId {
  return value === "disabled" || value === "mock";
}

function appendRecognizedText(currentText: string, recognizedPhrase: string): string {
  const trimmedText = currentText.trim();
  return trimmedText.length > 0 ? `${trimmedText}\n${recognizedPhrase}` : recognizedPhrase;
}
