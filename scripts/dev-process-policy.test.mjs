import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyRunningMessage, classifyProcessExit } from "./dev-process-policy.mjs";

test("normal Electron window shutdown is successful", () => {
  assert.deepEqual(classifyProcessExit({ role: "electron", code: 0, signal: null, shutdownRequested: false }), {
    kind: "normal_shutdown",
    exitCode: 0,
    reportFailure: false
  });
});

test("existing Electron instance is reported without failing siblings", () => {
  assert.deepEqual(classifyProcessExit({
    role: "electron",
    code: 0,
    signal: null,
    shutdownRequested: false,
    output: alreadyRunningMessage
  }), {
    kind: "already_running",
    exitCode: 0,
    reportFailure: false
  });
});

test("unexpected Electron crash preserves its non-zero exit code", () => {
  const result = classifyProcessExit({ role: "electron", code: 23, signal: null, shutdownRequested: false });
  assert.equal(result.kind, "unexpected_exit");
  assert.equal(result.exitCode, 23);
  assert.equal(result.reportFailure, true);
});

test("Vite and backend termination during requested cleanup is not a failure", () => {
  for (const role of ["vite", "backend"]) {
    const result = classifyProcessExit({ role, code: 1, signal: "SIGTERM", shutdownRequested: true });
    assert.equal(result.kind, "cleanup");
    assert.equal(result.exitCode, 0);
    assert.equal(result.reportFailure, false);
  }
});

test("unexpected dev-server exit remains a failure", () => {
  const result = classifyProcessExit({ role: "backend", code: 7, signal: null, shutdownRequested: false });
  assert.equal(result.kind, "unexpected_exit");
  assert.equal(result.exitCode, 7);
  assert.equal(result.reportFailure, true);
});
