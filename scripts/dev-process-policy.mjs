export const alreadyRunningMessage = "VoiceAssistant is already running.";

export function classifyProcessExit({ role, code, signal, shutdownRequested, output = "" }) {
  if (shutdownRequested) {
    return { kind: "cleanup", exitCode: 0, reportFailure: false };
  }

  if (role === "electron" && output.includes(alreadyRunningMessage)) {
    return { kind: "already_running", exitCode: 0, reportFailure: false };
  }

  if (role === "electron" && code === 0) {
    return { kind: "normal_shutdown", exitCode: 0, reportFailure: false };
  }

  const exitCode = typeof code === "number" && code !== 0 ? code : 1;
  return {
    kind: "unexpected_exit",
    exitCode,
    reportFailure: true,
    detail: signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`
  };
}
