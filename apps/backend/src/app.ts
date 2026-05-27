import cors from "@fastify/cors";
import Fastify from "fastify";
import type {
  AssistantAnswerRequest,
  AssistantAnswerResponse,
  AnswerMode
} from "@voiceassistant/shared";
import { createAiProvider } from "./providers/createAiProvider.js";
import { detectTechnicalQuestion } from "./questionDetector.js";

const answerModes: AnswerMode[] = ["short", "interview", "learning"];

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

      if (typeof text !== "string" || text.trim().length === 0) {
        return reply.status(400).send({ error: "Field 'text' is required." });
      }

      if (!answerModes.includes(mode)) {
        return reply.status(400).send({ error: "Field 'mode' must be short, interview, or learning." });
      }

      const detection = detectTechnicalQuestion(text);
      if (!detection.isUseful) {
        return {
          answer: "Похоже, это не технический вопрос или фрагмент отфильтрован как служебный текст."
        };
      }

      try {
        const aiProvider = createAiProvider({ apiKey, model });
        const answer = await aiProvider.answer({
          text: detection.normalizedText,
          mode
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
