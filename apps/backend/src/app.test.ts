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
