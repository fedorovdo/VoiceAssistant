import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { alreadyRunningMessage, classifyProcessExit } from "./dev-process-policy.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const desktopRoot = path.join(repositoryRoot, "apps", "desktop");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = new Map();
const smokeMode = process.argv.includes("--smoke");
let shutdownRequested = false;
let finalExitCode = 0;
let outputAvailable = true;

function writeLabelled(label, stream, chunk) {
  if (!outputAvailable || stream.destroyed) return;
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line) {
      try {
        stream.write(`[${label}] ${line}\n`);
      } catch (error) {
        if (error?.code !== "EPIPE") throw error;
        outputAvailable = false;
      }
    }
  }
}

function startChild(role, args, cwd = repositoryRoot, extraEnv = {}, monitorExit = true) {
  const executable = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : npmCommand;
  const spawnArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [npmCommand, ...args].map(quoteWindowsArgument).join(" ")]
    : args;
  const child = spawn(executable, spawnArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
    stdio: ["inherit", "pipe", "pipe"]
  });
  const output = [];
  child.stdout.on("data", (chunk) => {
    output.push(chunk.toString());
    writeLabelled(role, process.stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    output.push(chunk.toString());
    writeLabelled(role, process.stderr, chunk);
  });
  children.set(role, { child, output });
  if (monitorExit) child.once("exit", (code, signal) => void handleExit(role, code, signal));
  child.once("error", (error) => {
    output.push(error.message);
    if (!shutdownRequested) {
      console.error(`[${role}] Failed to start: ${error.message}`);
      finalExitCode = 1;
      void shutdown();
    }
  });
  return child;
}

function quoteWindowsArgument(value) {
  return /^[a-zA-Z0-9_@./:-]+$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`;
}

async function handleExit(role, code, signal) {
  const record = children.get(role);
  const result = classifyProcessExit({
    role,
    code,
    signal,
    shutdownRequested,
    output: record?.output.join("") ?? ""
  });

  if (result.kind === "already_running") {
    console.log(alreadyRunningMessage);
  } else if (result.kind === "normal_shutdown") {
    console.log("[desktop] Electron closed normally. Stopping development services...");
  } else if (result.reportFailure) {
    console.error(`[${role}] Unexpected process exit (${result.detail}).`);
  }

  if (!shutdownRequested) {
    finalExitCode = result.exitCode;
    await shutdown();
  }
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !shutdownRequested) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(role, record) {
  const { child } = record;
  if (!child.pid || child.exitCode !== null) return;
  console.log(`[${role}] stopping PID ${child.pid}`);

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T"], { windowsHide: true, stdio: "ignore" });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (child.exitCode === null) {
      await new Promise((resolve) => {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("exit", resolve);
        killer.once("error", resolve);
      });
    }
    return;
  }

  child.kill("SIGTERM");
}

async function shutdown() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  await Promise.all([...children.entries()].map(([role, record]) => stopProcessTree(role, record)));
  setTimeout(() => process.exit(finalExitCode), 50).unref();
}

process.on("SIGINT", () => {
  console.log("\nVoiceAssistant development shutdown requested.");
  finalExitCode = 0;
  void shutdown();
});
process.on("SIGTERM", () => {
  finalExitCode = 0;
  void shutdown();
});
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error.code !== "EPIPE") throw error;
    outputAvailable = false;
    finalExitCode = 0;
    void shutdown();
  });
}

console.log("VoiceAssistant development supervisor");
console.log("[backend] Fastify API: http://127.0.0.1:8787");
console.log("[vite] Renderer: http://127.0.0.1:5173");
console.log("[desktop] Electron application");
console.log("Press Ctrl+C or close the Electron window to stop all development processes.");

try {
  const build = startChild("build", ["run", "build:main", "-w", "@voiceassistant/desktop"], repositoryRoot, {}, false);
  const buildCode = await new Promise((resolve) => build.once("exit", resolve));
  children.delete("build");
  if (buildCode !== 0) throw new Error(`Electron main build failed with code ${buildCode}.`);

  if (smokeMode) {
    console.log("Development supervisor Windows spawn smoke check passed.");
  } else {
    startChild("backend", ["run", "dev:backend"]);
    startChild("vite", ["exec", "vite", "--", "--host", "127.0.0.1"], desktopRoot);
    await Promise.all([
      waitForUrl("http://127.0.0.1:8787/health", 20_000),
      waitForUrl("http://127.0.0.1:5173", 20_000)
    ]);
    if (!shutdownRequested) {
      startChild("electron", ["exec", "electron", "--", "."], desktopRoot, {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
      });
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  finalExitCode = 1;
  await shutdown();
}
