import { app, BrowserWindow, Menu } from "electron";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendHealthUrl = "http://127.0.0.1:8787/health";
let backendProcess: ChildProcess | undefined;

async function createWindow() {
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    title: "VoiceAssistant",
    backgroundColor: "#f6f7f9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (!app.isPackaged) {
    window.webContents.on("before-input-event", (event, input) => {
      const opensDevTools = input.key === "F12"
        || (input.control && input.shift && input.key.toLowerCase() === "i");
      if (opensDevTools) {
        event.preventDefault();
        window.webContents.toggleDevTools();
      }
    });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  if (!app.isPackaged) {
    await window.loadURL("http://127.0.0.1:5173");
    return;
  }

  await window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

async function isVoiceAssistantBackendRunning(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);

  try {
    const response = await fetch(backendHealthUrl, { signal: controller.signal });
    if (!response.ok) return false;
    const body = await response.json() as { service?: string };
    return body.service === "voiceassistant-backend";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function startPackagedBackend() {
  if (!app.isPackaged || await isVoiceAssistantBackendRunning()) {
    return;
  }

  const backendEntry = path.join(process.resourcesPath, "backend", "server.cjs");
  const child = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      BACKEND_HOST: "127.0.0.1",
      BACKEND_PORT: "8787"
    },
    windowsHide: true,
    stdio: "ignore"
  });
  backendProcess = child;
  child.once("exit", () => {
    if (backendProcess === child) {
      backendProcess = undefined;
    }
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isVoiceAssistantBackendRunning()) {
      return;
    }
    if (child.exitCode !== null) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.error("VoiceAssistant backend did not become ready on port 8787.");
}

function stopPackagedBackend() {
  if (backendProcess && backendProcess.exitCode === null) {
    backendProcess.kill();
  }
  backendProcess = undefined;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await startPackagedBackend();
    await createWindow();
  });

  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
}

app.on("before-quit", stopPackagedBackend);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
