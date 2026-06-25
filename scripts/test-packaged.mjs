import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const version = packageJson.version;
const desktopDirectory = path.join(repositoryRoot, "apps", "desktop");
const rendererDirectory = path.join(desktopDirectory, "dist", "renderer");
const rendererIndexPath = path.join(rendererDirectory, "index.html");
const rendererAssetsDirectory = path.join(rendererDirectory, "assets");
const preloadPath = path.join(desktopDirectory, "dist", "main", "preload.cjs");
const mainPath = path.join(desktopDirectory, "dist", "main", "main.js");
const releaseDirectory = path.join(desktopDirectory, "release");
const appAsarPath = path.join(releaseDirectory, "win-unpacked", "resources", "app.asar");
const unpackedExePath = path.join(releaseDirectory, "win-unpacked", "VoiceAssistant.exe");
const portableExePath = path.join(releaseDirectory, `VoiceAssistant-${version}-x64.exe`);

await assertRendererBuild();
await assertPreloadBuild();
await assertPackagedFiles();
await assertPackagedSmoke();

console.log("Packaged verification passed.");

async function assertRendererBuild() {
  assert.ok(existsSync(rendererIndexPath), `Renderer index is missing: ${rendererIndexPath}`);
  const indexHtml = await readFile(rendererIndexPath, "utf8");
  assert.equal(indexHtml.includes('src="/assets'), false, "Renderer index contains root-absolute JS assets.");
  assert.equal(indexHtml.includes('href="/assets'), false, "Renderer index contains root-absolute CSS assets.");
  assert.match(indexHtml, /(?:src|href)="\.\/assets\//, "Renderer index should reference ./assets files.");

  const assets = await readdir(rendererAssetsDirectory);
  assert.ok(assets.some((asset) => asset.endsWith(".js")), "Renderer JS asset is missing.");
  assert.ok(assets.some((asset) => asset.endsWith(".css")), "Renderer CSS asset is missing.");
}

async function assertPreloadBuild() {
  assert.ok(existsSync(preloadPath), `Preload CJS file is missing: ${preloadPath}`);
  assert.ok(existsSync(mainPath), `Main process file is missing: ${mainPath}`);

  const preloadSource = await readFile(preloadPath, "utf8");
  assert.equal(/^\s*import\s/m.test(preloadSource), false, "Preload output contains a top-level ESM import.");
  assert.match(preloadSource, /require\("electron"\)|require\('electron'\)/, "Preload output should require electron as CommonJS.");
}

async function assertPackagedFiles() {
  assert.ok(existsSync(appAsarPath), `app.asar is missing: ${appAsarPath}`);
  assert.ok(existsSync(unpackedExePath), `Unpacked EXE is missing: ${unpackedExePath}`);
  assert.ok(existsSync(portableExePath), `Portable EXE is missing: ${portableExePath}`);

  const portable = await stat(portableExePath);
  assert.ok(portable.size > 50 * 1024 * 1024, `Portable EXE is unexpectedly small: ${portable.size} bytes.`);

  const asarFiles = asar.listPackage(appAsarPath).map((entry) => entry.replace(/\\/g, "/"));
  assert.ok(asarFiles.includes("/dist/renderer/index.html"), "app.asar does not contain renderer index.html.");
  assert.ok(asarFiles.some((entry) => /^\/dist\/renderer\/assets\/.+\.js$/.test(entry)), "app.asar does not contain renderer JS assets.");
  assert.ok(asarFiles.some((entry) => /^\/dist\/renderer\/assets\/.+\.css$/.test(entry)), "app.asar does not contain renderer CSS assets.");
  assert.ok(asarFiles.includes("/dist/main/preload.cjs"), "app.asar does not contain preload.cjs.");
  assert.ok(asarFiles.includes("/dist/main/main.js"), "app.asar does not contain main.js.");
}

async function assertPackagedSmoke() {
  await waitForPortReleased(8787, 2_000);

  const result = await runPackagedSmoke();
  assert.equal(result.code, 0, `Packaged smoke exited with ${result.code}.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.equal(result.smokeResult.rendererReady, true, "Packaged smoke did not report renderer-ready.");
  assert.equal(result.smokeResult.backendReady, true, "Packaged smoke did not confirm backend health.");
  assert.match(String(result.smokeResult.rendererPath), /dist[\\/]renderer[\\/]index\.html$/, "Packaged smoke reported an unexpected renderer path.");
  assert.match(String(result.smokeResult.preloadPath), /dist[\\/]main[\\/]preload\.cjs$/, "Packaged smoke reported an unexpected preload path.");
  assert.equal(/Unable to load preload script|Cannot use import statement outside a module|file:\/\/\/C:\/assets\//.test(result.stdout + result.stderr), false, "Packaged smoke reported a known release-blocker error.");

  await waitForPortReleased(8787, 10_000);
}

async function runPackagedSmoke() {
  const smokeDirectory = path.join(os.tmpdir(), "voiceassistant-packaged-smoke");
  await mkdir(smokeDirectory, { recursive: true });
  const smokeResultPath = path.join(smokeDirectory, `result-${Date.now()}-${process.pid}.json`);

  return new Promise((resolve, reject) => {
    const child = spawn(unpackedExePath, [], {
      cwd: path.dirname(unpackedExePath),
      env: {
        ...process.env,
        VOICEASSISTANT_PACKAGED_SMOKE: "1",
        VOICEASSISTANT_PACKAGED_DIAGNOSTICS: "1",
        VOICEASSISTANT_PACKAGED_SMOKE_RESULT: smokeResultPath
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Packaged smoke timed out.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 30_000);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", async (code) => {
      clearTimeout(timeout);
      try {
        const smokeResult = JSON.parse(await readFile(smokeResultPath, "utf8"));
        await rm(smokeResultPath, { force: true });
        resolve({ code, stdout, stderr, smokeResult });
      } catch (error) {
        reject(new Error(`Packaged smoke result was not written or could not be read: ${error instanceof Error ? error.message : String(error)}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    });
  });
}

async function waitForPortReleased(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(await isPortOpen(port), false, `Port ${port} is still occupied.`);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}
