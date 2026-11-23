import assert from "node:assert/strict";
import test from "node:test";
import { PROVIDER, modelEntry, providerKeys } from "../lib/provider.js";
import { ALL_MODELS, GATEWAY, MAGPIE_MODELS } from "./helpers.mjs";

const BLOCK = "providers.magpie";
const KEY = "providers.magpie.apiKey";
const { glm, claude, gpt, kimi } = MAGPIE_MODELS;

test("a provider named magpie on the gateway's /v1, with the key magpie issued Kinex", () => {
  const keys = providerKeys(GATEWAY, [glm]);
  assert.deepEqual(Object.keys(keys), [BLOCK, KEY]);
  assert.equal(keys[KEY], GATEWAY.key);
  assert.equal(keys[BLOCK].name, PROVIDER);
  assert.equal(keys[BLOCK].baseUrl, GATEWAY.v1);
  assert.equal(keys[BLOCK].api, "openai-completions");
  assert.deepEqual(keys[BLOCK].compat, { sendSessionAffinityHeaders: true });
  assert.deepEqual(keys[BLOCK].models, [modelEntry(glm, GATEWAY)]);
});

test("the block is written whole and the key by its own path, so magpie keeps a mark of its wiring", () => {
  const keys = providerKeys(GATEWAY, ALL_MODELS);
  // whole: an empty provider object left behind is one Pi refuses to load
  assert.equal(typeof keys[BLOCK], "object");
  assert.ok(
    !Object.keys(keys).some((key) => key.startsWith(`${BLOCK}.models`)),
  );
  // the key alone among connect's keys is a string: magpie's mark of its own
  assert.equal(typeof keys[KEY], "string");
  assert.deepEqual(
    Object.keys(keys).filter((key) => typeof keys[key] === "string"),
    [KEY],
  );
});

test("a model relayed on Chat alone stays on the provider's API, with all Pi takes defaults for said", () => {
  assert.deepEqual(modelEntry(glm, GATEWAY), {
    id: "cchp-general/glm-5.4",
    name: "GLM 5.4",
    reasoning: true,
    thinkingLevelMap: {
      off: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    },
    contextWindow: 200000,
    maxTokens: 131072,
  });
});

test("a model relayed on Responses is asked there, with strict tools", () => {
  const entry = modelEntry(gpt, GATEWAY);
  assert.equal(entry.api, "openai-responses");
  assert.equal(entry.baseUrl, undefined);
  assert.deepEqual(entry.compat, { supportsStrictMode: true });
  assert.deepEqual(entry.input, ["text", "image"]);
  assert.deepEqual(entry.thinkingLevelMap, {
    off: "none",
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: null,
    max: null,
  });
  assert.deepEqual(entry.cost, {
    input: 1.25,
    output: 10,
    cacheRead: 0,
    cacheWrite: 0,
  });
  assert.deepEqual(entry.promptCache, { short: 300 });
});

test("a model relayed on Messages names the gateway's root, as Anthropic's SDK adds the /v1", () => {
  const entry = modelEntry(kimi, GATEWAY);
  assert.equal(entry.api, "anthropic-messages");
  assert.equal(entry.baseUrl, GATEWAY.url);
  assert.equal(entry.compat, undefined);
  assert.equal(entry.input, undefined);
});

test("a Claude from 4.6 on is asked adaptively on Messages, and Pi's off is left for it to offer", () => {
  const entry = modelEntry(claude, GATEWAY);
  assert.deepEqual(entry.compat, { forceAdaptiveThinking: true });
  assert.deepEqual(entry.thinkingLevelMap, {
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  });
  assert.deepEqual(entry.cost, {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  });
  assert.deepEqual(entry.promptCache, { short: 300, long: 3600 });
});

test("an older Claude on Messages is asked with a budget, and its off stays its own none", () => {
  const entry = modelEntry(
    {
      id: "claude-sonnet-4-5",
      context: 200000,
      output: 16384,
      efforts: ["none", "low", "medium", "high"],
      native_endpoints: ["/v1/messages"],
    },
    GATEWAY,
  );
  assert.equal(entry.compat, undefined);
  assert.equal(entry.thinkingLevelMap.off, "none");
});

test("GLM-5.2 and 5.3 and a Gemini 3 are asked adaptively on Messages too", () => {
  for (const id of [
    "zai/glm-5.2",
    "glm-5.3-flash",
    "google/gemini-3.1-pro-preview",
  ]) {
    const entry = modelEntry(
      {
        id,
        context: 1000000,
        efforts: ["low", "high"],
        native_endpoints: ["/v1/messages"],
      },
      GATEWAY,
    );
    assert.deepEqual(entry.compat, { forceAdaptiveThinking: true }, id);
  }
  for (const id of ["glm-5.4", "glm-4.6", "google/gemini-2.5-pro"]) {
    const entry = modelEntry(
      {
        id,
        context: 1000000,
        efforts: ["low", "high"],
        native_endpoints: ["/v1/messages"],
      },
      GATEWAY,
    );
    assert.equal(entry.compat, undefined, id);
  }
});

test("a model that always thinks hides Pi's off", () => {
  const entry = modelEntry(kimi, GATEWAY);
  assert.deepEqual(entry.thinkingLevelMap, {
    off: null,
    minimal: null,
    low: "light",
    medium: "medium",
    high: null,
    xhigh: "extra_high",
    max: null,
  });
});

test("a model whose levels magpie doesn't know gets Pi's own, and no reasoning", () => {
  const entry = modelEntry({ id: "mystery", context: 8000 }, GATEWAY);
  assert.equal(entry.reasoning, false);
  assert.equal(entry.thinkingLevelMap, undefined);
  assert.equal(entry.maxTokens, undefined);
  assert.equal(entry.cost, undefined);
  assert.equal(entry.promptCache, undefined);
});

test("a reply is kept within the window, and a price is read by moving the point", () => {
  const entry = modelEntry(
    {
      id: "wide",
      context: 128000,
      output: 384000,
      pricing: { prompt: "0", completion: "0.00000010" },
    },
    GATEWAY,
  );
  assert.equal(entry.maxTokens, 128000);
  assert.deepEqual(entry.cost, {
    input: 0,
    output: 0.1,
    cacheRead: 0,
    cacheWrite: 0,
  });
});

test("what isn't of Pi's schema's kind is left out, as the whole file would be refused for it", () => {
  const entry = modelEntry(
    {
      id: "odd",
      name: 7,
      context: -1,
      output: "many",
      images: true,
      efforts: ["low", 3, null],
      native_endpoints: "everywhere",
      pricing: { prompt: 2, completion: "free" },
    },
    GATEWAY,
  );
  assert.deepEqual(entry, {
    id: "odd",
    name: "odd",
    reasoning: true,
    input: ["text", "image"],
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    },
  });
});

test("a model without an id is not written", () => {
  const keys = providerKeys(GATEWAY, [{ name: "nameless" }, null, glm]);
  assert.deepEqual(
    keys[BLOCK].models.map((entry) => entry.id),
    [glm.id],
  );
});

test("without a gateway there is nothing to write, and connect says so", () => {
  assert.throws(() => providerKeys(undefined, ALL_MODELS), /no gateway/);
  assert.throws(
    () => providerKeys({ url: GATEWAY.url }, ALL_MODELS),
    /no gateway/,
  );
  assert.throws(
    () => providerKeys({ key: GATEWAY.key }, ALL_MODELS),
    /no gateway/,
  );
});

test("the /v1 is made of the gateway's root when connect is given that alone", () => {
  const keys = providerKeys({ url: `${GATEWAY.url}/`, key: GATEWAY.key }, [
    kimi,
  ]);
  assert.equal(keys[BLOCK].baseUrl, GATEWAY.v1);
  assert.equal(keys[BLOCK].models[0].baseUrl, GATEWAY.url);
});
