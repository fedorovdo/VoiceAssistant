import assert from "node:assert/strict";
import { test } from "node:test";
import { SequentialRequestQueue, TranscriptDuplicateTracker } from "@voiceassistant/shared";

test("sequential request queue executes FIFO with one active request", () => {
  const queue = new SequentialRequestQueue<string>({ maxPending: 5 });
  for (const item of ["one", "two", "three"]) assert.equal(queue.enqueue(item), "queued");
  assert.equal(queue.startNext(), "one");
  assert.equal(queue.startNext(), undefined);
  assert.equal(queue.finishActive(), "one");
  assert.equal(queue.startNext(), "two");
  assert.equal(queue.finishActive(), "two");
  assert.equal(queue.startNext(), "three");
});

test("request arriving while another is active waits and runs afterward", () => {
  const queue = new SequentialRequestQueue<number>();
  queue.enqueue(1);
  assert.equal(queue.startNext(), 1);
  queue.enqueue(2);
  assert.deepEqual(queue.getSnapshot(), { active: 1, pending: [2] });
  queue.finishActive();
  assert.equal(queue.startNext(), 2);
});

test("queue reports capacity instead of silently discarding a request", () => {
  const queue = new SequentialRequestQueue<number>({ maxPending: 2 });
  assert.equal(queue.enqueue(1), "queued");
  assert.equal(queue.enqueue(2), "queued");
  assert.equal(queue.enqueue(3), "queue_full");
  assert.deepEqual(queue.getSnapshot().pending, [1, 2]);
});

test("error or no-match completion cannot block the next request", () => {
  const queue = new SequentialRequestQueue<string>();
  queue.enqueue("error");
  queue.enqueue("next");
  assert.equal(queue.startNext(), "error");
  queue.finishActive();
  assert.equal(queue.startNext(), "next");
  queue.finishActive();
  assert.equal(queue.getActive(), undefined);
});

test("Clear removes active and pending requests", () => {
  const queue = new SequentialRequestQueue<number>();
  queue.enqueue(1);
  queue.enqueue(2);
  queue.startNext();
  queue.clear();
  assert.deepEqual(queue.getSnapshot(), { active: undefined, pending: [] });
  assert.equal(queue.startNext(), undefined);
});

test("five sequential transactions each render and return to listening", () => {
  const queue = new SequentialRequestQueue<{ id: string; cardId: string }>();
  const requests = [
    { id: "one", cardId: "network-tcp-ip-model" },
    { id: "two", cardId: "network-protocol-layers" },
    { id: "three", cardId: "network-osi-model" },
    { id: "four", cardId: "network-osi-model" },
    { id: "five", cardId: "network-tcp-ip-model" }
  ];
  requests.forEach((request) => queue.enqueue(request));

  let revision = 0;
  const events: Array<{ id: string; revision: number; state: string }> = [];
  for (let request = queue.startNext(); request; request = queue.startNext()) {
    revision += 1;
    events.push({ id: request.id, revision, state: "answered" });
    queue.finishActive(request);
    events.push({ id: request.id, revision, state: "listening" });
  }

  assert.deepEqual(events.filter((event) => event.state === "answered").map((event) => event.id), requests.map((request) => request.id));
  assert.deepEqual(events.filter((event) => event.state === "answered").map((event) => event.revision), [1, 2, 3, 4, 5]);
  assert.equal(events.at(-1)?.state, "listening");
  assert.equal(queue.getActive(), undefined);
});

test("distinct same-card requests are queued while only exact transcript duplicates are filtered", () => {
  const queue = new SequentialRequestQueue<{ text: string; cardId: string }>();
  const duplicates = new TranscriptDuplicateTracker({ duplicateWindowMs: 30_000 });
  const inputs = [
    { text: "Расскажи про модель OSI.", cardId: "network-osi-model", at: 1_000 },
    { text: "Сколько уровней OSI?", cardId: "network-osi-model", at: 2_000 },
    { text: "Сколько уровней OSI?", cardId: "network-osi-model", at: 3_000 }
  ];

  for (const input of inputs) {
    if (!duplicates.checkAndRemember(input.text, input.at)) queue.enqueue(input);
  }

  assert.deepEqual(queue.getSnapshot().pending.map((request) => request.text), inputs.slice(0, 2).map((request) => request.text));
});

test("a stale completion after Clear cannot finish a newer active request", () => {
  const queue = new SequentialRequestQueue<{ id: string }>();
  const stale = { id: "stale" };
  const current = { id: "current" };
  queue.enqueue(stale);
  assert.equal(queue.startNext(), stale);
  queue.clear();
  queue.enqueue(current);
  assert.equal(queue.startNext(), current);

  assert.equal(queue.finishActive(stale), undefined);
  assert.equal(queue.getActive(), current);
  assert.equal(queue.finishActive(current), current);
});
