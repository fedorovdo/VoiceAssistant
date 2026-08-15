import { useState } from "react";
import type { CSSProperties } from "react";
import { App } from "./App.js";
import { MentorApp } from "./MentorApp.js";
import "./mentorToolbar.css";

type Workspace = "assistant" | "mentor";

const workspaceStorageKey = "voiceassistant.workspace";
const mentorTextScaleStorageKey = "voiceassistant.mentorTextScale";
const defaultMentorTextScale = 90;

export function RootApp() {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    return localStorage.getItem(workspaceStorageKey) === "mentor" ? "mentor" : "assistant";
  });
  const [mentorTextScale, setMentorTextScale] = useState(readMentorTextScale);

  function switchWorkspace(next: Workspace) {
    localStorage.setItem(workspaceStorageKey, next);
    setWorkspace(next);
  }

  function changeMentorTextScale(value: number) {
    const normalized = Math.min(110, Math.max(80, value));
    localStorage.setItem(mentorTextScaleStorageKey, String(normalized));
    setMentorTextScale(normalized);
  }

  if (workspace === "mentor") {
    const mentorScaleStyle = {
      "--mentor-text-scale": mentorTextScale / 100
    } as CSSProperties;

    return (
      <>
        <div className="mentor-scale-surface" style={mentorScaleStyle}>
          <MentorApp />
        </div>

        <div className="mentor-top-tools">
          <label className="mentor-text-scale-control" title="Масштаб текста Mentor Mode">
            <span className="mentor-scale-a">A−</span>
            <input
              type="range"
              min="80"
              max="110"
              step="5"
              value={mentorTextScale}
              onChange={(event) => changeMentorTextScale(Number(event.target.value))}
              aria-label="Масштаб текста Mentor Mode"
            />
            <span className="mentor-scale-value">{mentorTextScale}%</span>
          </label>

          <button
            className="mentor-header-switch"
            type="button"
            onClick={() => switchWorkspace("assistant")}
            title="Вернуться в основной VoiceAssistant"
          >
            ← VoiceAssistant
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <App />
      <button
        className="mentor-workspace-switch"
        type="button"
        onClick={() => switchWorkspace("mentor")}
        title="Открыть прототип режима Собеседник"
      >
        Собеседник · prototype
      </button>
    </>
  );
}

function readMentorTextScale(): number {
  const raw = Number(localStorage.getItem(mentorTextScaleStorageKey));
  if (!Number.isFinite(raw) || raw < 80 || raw > 110) {
    return defaultMentorTextScale;
  }
  return raw;
}
