import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";

test("GET /health returns service status", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "voiceassistant-backend"
  });

  await app.close();
});

test("POST /api/assistant/answer uses mock mode when apiKey is missing", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/assistant/answer",
      payload: {
        text: "Что такое Kubernetes?",
        mode: "interview",
        model: "gpt-4.1-mini"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.json().answer, /Интервью-ответ/);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    await app.close();
  }
});

test("POST /api/assistant/answer accepts a technical term in live mode", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/assistant/answer",
      payload: {
        text: "Docker image хранится в registry",
        mode: "short",
        workMode: "live",
        answerLanguage: "ru"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.json().answer, /Live Assist/);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    await app.close();
  }
});

test("POST /api/assistant/answer rejects empty text", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/assistant/answer",
    payload: {
      text: "   ",
      mode: "interview"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "Field 'text' is required."
  });

  await app.close();
});

test("POST /api/speech/transcribe rejects a request without audio", async () => {
  const app = buildApp();
  const multipart = createMultipartPayload([
    { name: "apiKey", value: "test-key" },
    { name: "language", value: "ru" }
  ]);

  const response = await app.inject({
    method: "POST",
    url: "/api/speech/transcribe",
    headers: { "content-type": `multipart/form-data; boundary=${multipart.boundary}` },
    payload: multipart.body
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "Field 'audio' is required." });
  await app.close();
});

test("POST /api/speech/transcribe rejects a request without apiKey", async () => {
  const app = buildApp();
  const multipart = createMultipartPayload([
    {
      name: "audio",
      value: Buffer.from("test audio"),
      filename: "chunk.webm",
      contentType: "audio/webm"
    },
    { name: "language", value: "ru" }
  ]);

  const response = await app.inject({
    method: "POST",
    url: "/api/speech/transcribe",
    headers: { "content-type": `multipart/form-data; boundary=${multipart.boundary}` },
    payload: multipart.body
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "Field 'apiKey' is required." });
  await app.close();
});

interface MultipartPart {
  name: string;
  value: string | Buffer;
  filename?: string;
  contentType?: string;
}

function createMultipartPayload(parts: MultipartPart[]) {
  const boundary = "voiceassistant-test-boundary";
  const buffers: Buffer[] = [];

  for (const part of parts) {
    buffers.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename) {
      buffers.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
        `Content-Type: ${part.contentType ?? "application/octet-stream"}\r\n\r\n`
      ));
    } else {
      buffers.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
    }
    buffers.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    buffers.push(Buffer.from("\r\n"));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(buffers) };
}
