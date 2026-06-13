import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
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
import { OpenAiSpeechToTextProvider } from "./speech/OpenAiSpeechToTextProvider.js";

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
  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 10 * 1024 * 1024,
      fields: 2
    }
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

  app.post("/api/speech/transcribe", async (request, reply) => {
    let audio: Buffer | undefined;
    let filename = "audio.webm";
    let mimeType = "audio/webm";
    let apiKey: string | undefined;
    let language: string | undefined;

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname === "audio") {
            audio = await part.toBuffer();
            filename = part.filename || filename;
            mimeType = part.mimetype || mimeType;
          } else {
            part.file.resume();
          }
          continue;
        }

        if (part.fieldname === "apiKey") {
          apiKey = normalizeOptionalString(part.value);
        } else if (part.fieldname === "language") {
          language = normalizeOptionalString(part.value);
        }
      }
    } catch (error) {
      request.log.warn({ err: sanitizeErrorForLogs(error) }, "invalid transcription upload");
      return reply.status(400).send({ error: "Invalid or oversized multipart audio upload." });
    }

    if (!audio || audio.length === 0) {
      return reply.status(400).send({ error: "Field 'audio' is required." });
    }

    if (!apiKey) {
      return reply.status(400).send({ error: "Field 'apiKey' is required." });
    }

    try {
      const provider = new OpenAiSpeechToTextProvider(apiKey);
      const text = await provider.transcribe({ audio, filename, mimeType, language });
      return { text };
    } catch (error) {
      request.log.warn({ err: sanitizeErrorForLogs(error) }, "speech transcription provider failed");
      return reply.status(502).send({
        error: error instanceof Error ? error.message : "Speech transcription failed."
      });
    }
  });

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
