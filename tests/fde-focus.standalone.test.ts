import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { noiseFiltered } from "@aihot/backend/sources/filters";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";

const config = { ingestNoiseFilter: {
  requireAny: ["case study", "Agent", "RAG", "落地", "教程"],
  dropMarkersTitleOnly: ["招聘", "we are hiring"],
  keepIfMatches: ["FDE 客户案例"],
} };
const src = { kind: "rss", config } as never;
const item = (title: string, excerpt = "") => ({ title, excerpt, categories: [] }) as never;

test("FDE prescreen admits real implementation articles in title or excerpt", () => {
  assert.equal(noiseFiltered(item("How an Agent was deployed for customer support"), src), false);
  assert.equal(noiseFiltered(item("Enterprise migration", "A step-by-step RAG rollout guide"), src), false);
  assert.equal(noiseFiltered(item("制造业知识库落地经验"), src), false);
});
test("FDE prescreen excludes unrelated and explicit noise before model calls", () => {
  assert.equal(noiseFiltered(item("New pricing round and executive hires"), src), true);
  assert.equal(noiseFiltered(item("招聘 Agent 开发工程师"), src), true);
});
test("FDE keepIfMatches preserves hand-curated relevant article", () => {
  assert.equal(noiseFiltered(item("FDE 客户案例：招聘助手如何上线"), src), false);
});
test("FDE prescreen is opt-in, compatible with other sources", () => {
  assert.equal(noiseFiltered(item("Unrelated story"), { kind:"rss",config:{} } as never), false);
  assert.deepEqual(unsupportedConfig("rss", config as never), []);
});
