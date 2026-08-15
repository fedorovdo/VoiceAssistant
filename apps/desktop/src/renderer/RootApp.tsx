import { useState } from "react";
import { App } from "./App.js";
import { MentorApp } from "./MentorApp.js";

type Workspace = "assistant" | "mentor";

const workspaceStorageKey = "voiceassistant.workspace";

export function RootApp() {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    return localStorage.getItem(workspaceStorageKey) === "mentor" ? "mentor" : "assistant";
  });

  function switchWorkspace(next: Workspace) {
    localStorage.setItem(workspaceStorageKey, next);
    setWorkspace(next);
  }

  return (
    <>
      {workspace === "mentor" ? <MentorApp /> : <App />}
      <button
        className="mentor-workspace-switch"
        type="button"
        onClick={() => switchWorkspace(workspace === "mentor" ? "assistant" : "mentor")}
        title={workspace === "mentor" ? "Вернуться в основной VoiceAssistant" : "Открыть прототип режима Собеседник"}
      >
        {workspace === "mentor" ? "← VoiceAssistant" : "Собеседник · prototype"}
      </button>
    </>
  );
}
