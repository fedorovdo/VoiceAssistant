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

  const aiProvider = createAiProvider();

  app.get("/health", async () => ({
    status: "ok",
    service: "voiceassistant-backend"
  }));

  app.post<{ Body: AssistantAnswerRequest; Reply: AssistantAnswerResponse | { error: string } }>(
    "/api/assistant/answer",
    async (request, reply) => {
      const { text, mode } = request.body ?? {};

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

      const answer = await aiProvider.answer({
        text: detection.normalizedText,
        mode
      });

      return { answer };
    }
  );

  return app;
}
