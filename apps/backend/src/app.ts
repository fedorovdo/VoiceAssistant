import cors from "@fastify/cors";
import Fastify from "fastify";
import type {
  AssistantAnswerRequest,
  AssistantAnswerResponse,
  AnswerMode,
  AppLanguage,
  WorkMode
} from "@voiceassistant/shared";
import { classifyTechnicalFragment } from "@voiceassistant/shared";
import { createAiProvider } from "./providers/createAiProvider.js";
import { detectTechnicalQuestion } from "./questionDetector.js";

const answerModes: AnswerMode[] = ["short", "interview", "learning"];
const workModes: WorkMode[] = ["manual", "live"];
const answerLanguages: AppLanguage[] = ["ru", "en"];

export function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "voiceassistant-backend"
  }));

  app.post<{ Body: AssistantAnswerRequest; Reply: AssistantAnswerResponse | { error: string } }>(
    "/api/assistant/answer",
    async (request, reply) => {
      const { text, mode } = request.body ?? {};
      const model = normalizeOptionalString(request.body?.model);
      const apiKey = normalizeOptionalString(request.body?.apiKey);
      const workMode = request.body?.workMode ?? "manual";
      const answerLanguage = request.body?.answerLanguage ?? "ru";

      if (typeof text !== "string" || text.trim().length === 0) {
        return reply.status(400).send({ error: "Field 'text' is required." });
      }

      if (!answerModes.includes(mode)) {
        return reply.status(400).send({ error: "Field 'mode' must be short, interview, or learning." });
      }

      if (!workModes.includes(workMode)) {
        return reply.status(400).send({ error: "Field 'workMode' must be manual or live." });
      }

      if (!answerLanguages.includes(answerLanguage)) {
        return reply.status(400).send({ error: "Field 'answerLanguage' must be ru or en." });
      }

      const detection = detectTechnicalQuestion(text);
      const liveDetection = classifyTechnicalFragment(text);
      const isUseful = workMode === "live"
        ? liveDetection.classification !== "ignore"
        : detection.isUseful;

      if (!isUseful) {
        return {
          answer: answerLanguage === "en"
            ? "This does not look like a technical question, or the fragment was filtered as non-useful text."
            : "Похоже, это не технический вопрос или фрагмент отфильтрован как служебный текст."
        };
      }

      try {
        const aiProvider = createAiProvider({ apiKey, model });
        const answer = await aiProvider.answer({
          text: workMode === "live" ? liveDetection.normalizedText : detection.normalizedText,
          mode,
          workMode,
          answerLanguage
        });

        return { answer };
      } catch (error) {
        request.log.warn({ err: sanitizeErrorForLogs(error) }, "assistant provider failed");
        return reply.status(502).send({
          error: error instanceof Error ? error.message : "Assistant provider failed."
        });
      }
    }
  );

  return app;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeErrorForLogs(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown provider error" };
  }

  return {
    name: error.name,
    message: error.message
  };
}
