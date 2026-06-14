export type AnswerSourceMode = "local-only" | "local-plus-gpt" | "gpt-only";

export type AnswerSourceResolution =
  | "local"
  | "local-and-gpt"
  | "gpt"
  | "local-not-found"
  | "gpt-key-required"
  | "hybrid-key-required";

export interface AnswerSourceContext {
  mode: AnswerSourceMode;
  hasLocalMatch: boolean;
  hasApiKey: boolean;
  answerMode: "short" | "interview" | "learning";
}

export function shouldSearchLocalKnowledge(mode: AnswerSourceMode): boolean {
  return mode !== "gpt-only";
}

export function resolveAnswerSource(context: AnswerSourceContext): AnswerSourceResolution {
  const { mode, hasLocalMatch, hasApiKey, answerMode } = context;

  if (mode === "local-only") {
    return hasLocalMatch ? "local" : "local-not-found";
  }

  if (mode === "gpt-only") {
    return hasApiKey ? "gpt" : "gpt-key-required";
  }

  if (hasLocalMatch) {
    return hasApiKey && answerMode !== "short" ? "local-and-gpt" : "local";
  }

  return hasApiKey ? "gpt" : "hybrid-key-required";
}
