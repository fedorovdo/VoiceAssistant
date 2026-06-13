import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "apps", "desktop", "dist", "backend");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  absWorkingDir: repositoryRoot,
  entryPoints: ["scripts/packaged-backend-entry.ts"],
  outfile: path.join(outputDirectory, "server.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  minify: false,
  packages: "bundle"
});

console.log(`Packaged backend bundle: ${path.relative(repositoryRoot, path.join(outputDirectory, "server.cjs"))}`);
