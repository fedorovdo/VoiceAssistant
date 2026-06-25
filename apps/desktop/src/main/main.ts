import { app, BrowserWindow, Menu, ipcMain } from "electron";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendHealthUrl = "http://127.0.0.1:8787/health";
let backendProcess: ChildProcess | undefined;
let rendererReadyReceived = false;
let packagedRendererPathForSmoke = "";
let packagedPreloadPathForSmoke = "";
const packagedSmokeMode = process.env.VOICEASSISTANT_PACKAGED_SMOKE === "1";
const packagedDiagnosticsEnabled = packagedSmokeMode || process.env.VOICEASSISTANT_PACKAGED_DIAGNOSTICS === "1";
const packagedSmokeResultPath = process.env.VOICEASSISTANT_PACKAGED_SMOKE_RESULT;

function logPackagedDiagnostic(label: string, value: unknown) {
  if (!packagedDiagnosticsEnabled) return;
  console.log(`[VoiceAssistant packaged] ${label}: ${String(value).replace(/sk-(?:proj-)?[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]")}`);
}

function writePackagedSmokeResult(result: Record<string, unknown>) {
  if (!packagedSmokeResultPath) return;
  try {
    writeFileSync(packagedSmokeResultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  } catch (error) {
    logPackagedDiagnostic("smoke-result-write-error", error instanceof Error ? error.message : String(error));
  }
}

async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const rendererIndexPath = path.join(__dirname, "../renderer/index.html");
  packagedRendererPathForSmoke = rendererIndexPath;
  packagedPreloadPathForSmoke = preloadPath;
  const preloadExists = existsSync(preloadPath);
  const rendererIndexExists = existsSync(rendererIndexPath);

  logPackagedDiagnostic("app.isPackaged", app.isPackaged);
  logPackagedDiagnostic("process.resourcesPath", process.resourcesPath);
  logPackagedDiagnostic("resolved renderer path", rendererIndexPath);
  logPackagedDiagnostic("renderer file exists", rendererIndexExists);
  logPackagedDiagnostic("resolved preload path", preloadPath);
  logPackagedDiagnostic("preload file exists", preloadExists);

  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    title: "VoiceAssistant",
    backgroundColor: "#f6f7f9",
    show: !packagedSmokeMode,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      ...(preloadExists ? { preload: preloadPath } : {})
    }
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logPackagedDiagnostic("did-fail-load", `${errorCode} ${errorDescription} ${validatedURL}`);
  });

  window.webContents.on("preload-error", (_event, preload, error) => {
    logPackagedDiagnostic("preload-error", `${preload}: ${error.message}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    logPackagedDiagnostic("render-process-gone", `${details.reason} ${details.exitCode}`);
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logPackagedDiagnostic("console-message", `${level} ${sourceId}:${line} ${message}`);
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

  if (!rendererIndexExists) {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createStartupFallbackHtml("renderer index was not found"))}`);
    return;
  }

  await window.loadFile(rendererIndexPath);
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
  console.log("VoiceAssistant is already running.");
  app.exit(0);
} else {
  ipcMain.on("renderer-ready", async () => {
    rendererReadyReceived = true;
    logPackagedDiagnostic("renderer-ready", true);
    if (packagedSmokeMode) {
      const backendReady = await isVoiceAssistantBackendRunning();
      logPackagedDiagnostic("backend health after renderer-ready", backendReady);
      writePackagedSmokeResult({
        rendererReady: true,
        backendReady,
        rendererPath: packagedRendererPathForSmoke,
        preloadPath: packagedPreloadPathForSmoke,
        exitCode: backendReady ? 0 : 1
      });
      process.exitCode = backendReady ? 0 : 1;
      app.quit();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await startPackagedBackend();
    await createWindow();

    if (packagedSmokeMode) {
      setTimeout(() => {
        if (!rendererReadyReceived) {
          console.error("VoiceAssistant packaged smoke test failed: renderer-ready was not received.");
          writePackagedSmokeResult({
            rendererReady: false,
            backendReady: false,
            rendererPath: packagedRendererPathForSmoke,
            preloadPath: packagedPreloadPathForSmoke,
            error: "renderer-ready timeout",
            exitCode: 1
          });
          process.exitCode = 1;
          app.quit();
        }
      }, 12_000);
    }
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

function createStartupFallbackHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>VoiceAssistant</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-content: center;
        gap: 12px;
        padding: 32px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1d1d1f;
        background: #f5f5f7;
        text-align: center;
      }
      h1 { margin: 0; font-size: 22px; }
      p { margin: 0; color: #687080; }
    </style>
  </head>
  <body>
    <h1>VoiceAssistant could not start the interface.</h1>
    <p>${message.replace(/[<>&"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[character] ?? character))}</p>
  </body>
</html>`;
}
