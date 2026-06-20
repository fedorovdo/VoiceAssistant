import assert from "node:assert/strict";
import { test } from "node:test";
import {
  knowledgeCards,
  knowledgeTopicPacks,
  validateKnowledgeTopicPacks
} from "@voiceassistant/shared";
import type { KnowledgeTopicPack } from "@voiceassistant/shared";

const expectedTopicCounts = {
  linux: 48,
  docker: 41,
  kubernetes: 31,
  networking: 20,
  "active-directory": 27,
  git: 12,
  proxmox: 10
} as const;

const representativeCards = {
  linux: "linux-open-ports",
  docker: "docker-overview",
  kubernetes: "kubernetes-overview",
  networking: "network-nat",
  "active-directory": "active-directory",
  git: "git-status",
  proxmox: "proxmox-version"
} as const;

test("knowledge registry contains seven complete topic packs and 189 cards", () => {
  assert.equal(knowledgeTopicPacks.length, 7);
  assert.equal(knowledgeCards.length, 189);
  assert.deepEqual(
    Object.fromEntries(knowledgeTopicPacks.map((pack) => [pack.id, pack.cards.length])),
    expectedTopicCounts
  );

  for (const pack of knowledgeTopicPacks) {
    assert.ok(pack.cards.some((card) => card.id === representativeCards[pack.id]), pack.id);
  }
});

test("knowledge registry has unique ids and complete card metadata", () => {
  assert.deepEqual(validateKnowledgeTopicPacks(knowledgeTopicPacks), []);

  const ids = knowledgeCards.map((card) => card.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const card of knowledgeCards) {
    assert.ok(card.title.trim(), card.id);
    assert.ok(card.category, card.id);
    assert.ok(card.aliases.length > 0, card.id);
    assert.ok(card.aliases.every((alias) => alias.trim().length > 0), card.id);
  }
});

test("knowledge registry validation reports duplicate ids and empty metadata", () => {
  const invalidPacks: KnowledgeTopicPack[] = [
    {
      id: "linux",
      displayName: "Linux",
      cards: [
        {
          id: "duplicate",
          title: "Valid title",
          aliases: ["valid alias"],
          category: "linux",
          shortExplanation: "",
          bullets: [],
          commands: [],
          relatedTerms: []
        },
        {
          id: "duplicate",
          title: "",
          aliases: [],
          category: "docker",
          shortExplanation: "",
          bullets: [],
          commands: [],
          relatedTerms: []
        }
      ]
    }
  ];

  const errors = validateKnowledgeTopicPacks(invalidPacks);
  assert.ok(errors.some((error) => error.includes("Duplicate knowledge card id")));
  assert.ok(errors.some((error) => error.includes("empty title")));
  assert.ok(errors.some((error) => error.includes("empty aliases")));
  assert.ok(errors.some((error) => error.includes("registered in linux")));
});
