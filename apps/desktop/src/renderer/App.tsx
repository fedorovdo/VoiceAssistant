import { FormEvent, useMemo, useState } from "react";
import { Mic, Settings, Square, Play, Send, X } from "lucide-react";
import type {
  AnswerMode,
  AssistantAnswerResponse,
  DesktopSettings
} from "@voiceassistant/shared";

const defaultSettings: DesktopSettings = {
  apiKey: "",
  model: "gpt-4.1-mini",
  language: "ru",
  audioInputDevice: "Default microphone",
  answerMode: "interview"
};

const settingsStorageKey = "voiceassistant.settings";
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8787";

export function App() {
  const [recognizedText, setRecognizedText] = useState("Из чего состоит Kubernetes?");
  const [answer, setAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<DesktopSettings>(loadSettings);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");

  const statusText = useMemo(() => {
    if (isListening) {
      return "Listening";
    }

    return "Stopped";
  }, [isListening]);

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
            <button
              className={isListening ? "control-button stop" : "control-button"}
              type="button"
              onClick={() => setIsListening((value) => !value)}
            >
              {isListening ? <Square size={18} /> : <Play size={18} />}
              {isListening ? "Stop" : "Start"}
            </button>
          </div>
          <textarea
            value={recognizedText}
            onChange={(event) => setRecognizedText(event.target.value)}
            placeholder="Введите или вставьте распознанный технический вопрос"
          />
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
            {isAsking ? "Жду ответ от ассистента..." : answer || "Ответ появится здесь после нажатия Ask."}
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
      language: parsed.language === "en" || parsed.language === "ru" ? parsed.language : defaultSettings.language
    };
  } catch {
    return defaultSettings;
  }
}

function isAnswerMode(value: unknown): value is AnswerMode {
  return value === "short" || value === "interview" || value === "learning";
}
