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
import { OpenAiSpeechToTextProvider } from "./speech/OpenAiSpeechToTextProvider.js";

const answerModes: AnswerMode[] = ["short", "interview", "learning"];
const workModes: WorkMode[] = ["manual", "live"];
const answerLanguages: AppLanguage[] = ["ru", "en"];

interface RealtimeConnectRequest {
  sdp?: string;
  apiKey?: string;
  language?: AppLanguage;
}

interface RealtimeConnectResponse {
  sdp: string;
  callId?: string;
}

const mentorTranscriptionPrompt = [
  "Technical discussion in Russian with possible English IT terminology.",
  "Expect terms from Linux, Windows Server, Active Directory, networking, Docker, Kubernetes, Proxmox, Zabbix, Samba and DevOps.",
  "Common terms include TCP/IP, OSI, DNS, DHCP, VLAN, GPO, systemd, SELinux, Dockerfile, Deployment, ReplicaSet, Pod, Service and Ingress.",
  "Preserve technical product names, commands, acronyms and numbers accurately."
].join(" ");

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

      const normalizedManualText = text.replace(/\s+/g, " ").trim();
      const liveDetection = workMode === "live" ? classifyTechnicalFragment(text) : undefined;

      if (workMode === "live" && liveDetection?.classification === "ignore") {
        return {
          answer: answerLanguage === "en"
            ? "This does not look like a technical question, or the fragment was filtered as non-useful text."
            : "Похоже, это не технический вопрос или фрагмент отфильтрован как служебный текст."
        };
      }

      try {
        const aiProvider = createAiProvider({ apiKey, model });
        const answer = await aiProvider.answer({
          text: workMode === "live" ? liveDetection?.normalizedText ?? normalizedManualText : normalizedManualText,
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

  app.post<{ Body: RealtimeConnectRequest; Reply: RealtimeConnectResponse | { error: string } }>(
    "/api/realtime/connect",
    async (request, reply) => {
      const sdp = normalizeOptionalString(request.body?.sdp);
      const apiKey = normalizeOptionalString(request.body?.apiKey);
      const language = request.body?.language === "en" ? "en" : "ru";

      if (!sdp) {
        return reply.status(400).send({ error: "Field 'sdp' is required." });
      }

      if (!apiKey) {
        return reply.status(400).send({ error: "Field 'apiKey' is required." });
      }

      const session = {
        type: "realtime",
        model: "gpt-realtime-mini",
        output_modalities: ["text"],
        audio: {
          input: {
            noise_reduction: null,
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language,
              prompt: mentorTranscriptionPrompt
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
              create_response: false,
              interrupt_response: false
            }
          }
        }
      };

      try {
        const multipartBody = buildRealtimeMultipartBody(sdp, session);
        const response = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": multipartBody.contentType
          },
          body: multipartBody.body
        });

        const responseBody = await response.text();
        if (!response.ok) {
          request.log.warn(
            { status: response.status, body: sanitizeOpenAiResponse(responseBody) },
            "realtime WebRTC handshake failed"
          );
          return reply.status(502).send({
            error: response.status === 401
              ? "OpenAI rejected the API key. Check the key in settings."
              : `OpenAI Realtime connection failed with status ${response.status}.`
          });
        }

        const location = response.headers.get("location") ?? undefined;
        const callId = location?.split("/").filter(Boolean).at(-1);
        return { sdp: responseBody, callId };
      } catch (error) {
        request.log.warn({ err: sanitizeErrorForLogs(error) }, "realtime WebRTC handshake failed");
        return reply.status(502).send({
          error: "Could not establish an OpenAI Realtime connection."
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

function buildRealtimeMultipartBody(sdp: string, session: unknown): { body: string; contentType: string } {
  const boundary = `----voiceassistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const body = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="sdp"\r\n`,
    `Content-Type: application/sdp\r\n\r\n`,
    sdp,
    `\r\n--${boundary}\r\n`,
    `Content-Disposition: form-data; name="session"\r\n`,
    `Content-Type: application/json\r\n\r\n`,
    JSON.stringify(session),
    `\r\n--${boundary}--\r\n`
  ].join("");

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeOpenAiResponse(body: string): string {
  return body.replace(/sk-(?:proj-)?[A-Za-z0-9_-]{8,}/g, "[redacted-api-key]").slice(0, 500);
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