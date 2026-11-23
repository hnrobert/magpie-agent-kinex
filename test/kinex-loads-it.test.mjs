// The files magpie writes for Kinex are loaded by the Pi that Kinex bundles
// (@earendil-works/pi-coding-agent 1.2.0, Kinex 1.1.0's), as Kinex loads
// them (its src/application.ts and src/settings.ts). Pi checks a models.json
// whole, and refuses every provider in it for one value of the wrong kind, so
// what is written for Kinex is read back by Pi itself here.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { URL } from "node:url";
import { PROVIDER, providerKeys } from "../lib/provider.js";
import { ALL_MODELS, GATEWAY, MAGPIE_MODELS, applyKeys } from "./helpers.mjs";

const piEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const { ModelRuntime, SettingsManager } = await import(piEntry);
const { getSupportedThinkingLevels } = await import(
  import.meta.resolve("@earendil-works/pi-ai/models")
);
// Pi's own resolver, by file: the package exports its front only
const { findInitialModel } = await import(
  new URL("./core/model-resolver.js", piEntry)
);

// kinexHome is a home with Kinex's agent folder, as Kinex makes it.
async function kinexHome(t) {
  const home = await mkdtemp(path.join(tmpdir(), "magpie-agent-kinex-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const agentDir = path.join(home, ".config", "kinex", "agent");
  await mkdir(agentDir, { recursive: true });
  return {
    home,
    agentDir,
    models: path.join(agentDir, "models.json"),
    settings: path.join(agentDir, "settings.json"),
  };
}

// connectKinex is what magpie does when a model is picked in Kinex's row:
// connect's keys into models.json (beside the user's own providers), the
// model and the provider into settings.json.
async function connectKinex(at, model, had = {}) {
  await writeFile(
    at.models,
    JSON.stringify(
      applyKeys({ providers: had }, providerKeys(GATEWAY, ALL_MODELS)),
      null,
      2,
    ),
  );
  await writeFile(
    at.settings,
    JSON.stringify({
      quietStartup: true,
      defaultProvider: PROVIDER,
      defaultModel: model.id,
    }),
  );
}

// kinex is Pi started on the folder, with the options Kinex starts it with.
async function kinex(at) {
  await writeFile(path.join(at.agentDir, "auth.json"), "{}");
  return ModelRuntime.create({
    authPath: path.join(at.agentDir, "auth.json"),
    modelsPath: at.models,
    modelsStorePath: path.join(at.home, "models-cache.json"),
    allowModelNetwork: false,
  });
}

// startsOn is the model a new Kinex session starts on, as Pi picks it.
async function startsOn(at, modelRuntime) {
  const settings = SettingsManager.create(at.home, at.agentDir);
  const found = await findInitialModel({
    scopedModels: [],
    isContinuing: false,
    defaultProvider: settings.getDefaultProvider(),
    defaultModelId: settings.getDefaultModel(),
    defaultThinkingLevel: settings.getDefaultThinkingLevel(),
    modelThinkingLevels: settings.getAllModelThinkingLevels(),
    modelRuntime,
  });
  return found.model && `${found.model.provider}/${found.model.id}`;
}

test("the models.json magpie writes loads with Pi 1.2.0, every model as magpie says it", async (t) => {
  const at = await kinexHome(t);
  await connectKinex(at, MAGPIE_MODELS.glm);
  const runtime = await kinex(at);
  const magpie = runtime.getModels(PROVIDER);
  assert.deepEqual(
    magpie.map((model) => model.id),
    ALL_MODELS.map((model) => model.id),
  );
  const byId = Object.fromEntries(magpie.map((model) => [model.id, model]));
  const { claude, gpt, kimi } = MAGPIE_MODELS;

  // on Chat: the provider's address, and the session headers
  assert.equal(byId[MAGPIE_MODELS.glm.id].api, "openai-completions");
  assert.equal(byId[MAGPIE_MODELS.glm.id].baseUrl, GATEWAY.v1);
  assert.deepEqual(byId[MAGPIE_MODELS.glm.id].compat, {
    sendSessionAffinityHeaders: true,
  });
  assert.equal(byId[MAGPIE_MODELS.glm.id].contextWindow, 200000);
  assert.equal(byId[MAGPIE_MODELS.glm.id].maxTokens, 131072);

  // on Responses: strict tools
  assert.equal(byId[gpt.id].api, "openai-responses");
  assert.deepEqual(byId[gpt.id].compat, {
    sendSessionAffinityHeaders: true,
    supportsStrictMode: true,
  });
  assert.deepEqual(byId[gpt.id].cost, {
    input: 1.25,
    output: 10,
    cacheRead: 0,
    cacheWrite: 0,
  });

  // on Messages: the gateway's root, adaptively for a Claude from 4.6 on
  assert.equal(byId[claude.id].api, "anthropic-messages");
  assert.equal(byId[claude.id].baseUrl, GATEWAY.url);
  assert.deepEqual(byId[claude.id].compat, {
    sendSessionAffinityHeaders: true,
    forceAdaptiveThinking: true,
  });
  assert.deepEqual(byId[claude.id].input, ["text", "image"]);
  assert.deepEqual(byId[claude.id].promptCache, { short: 300, long: 3600 });

  // a model that always thinks is not offered off
  assert.equal(byId[kimi.id].compat.forceAdaptiveThinking, undefined);
  assert.deepEqual(getSupportedThinkingLevels(byId[kimi.id]), [
    "low",
    "medium",
    "xhigh",
  ]);
});

test("Pi offers a Claude on Messages every level it takes, and off, which disables thinking", async (t) => {
  const at = await kinexHome(t);
  await connectKinex(at, MAGPIE_MODELS.claude);
  const claude = (await kinex(at)).getModel(PROVIDER, MAGPIE_MODELS.claude.id);
  assert.deepEqual(getSupportedThinkingLevels(claude), [
    "off",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
});

test("a new Kinex session starts on the model picked in magpie", async (t) => {
  const at = await kinexHome(t);
  for (const model of ALL_MODELS) {
    await connectKinex(at, model);
    assert.equal(
      await startsOn(at, await kinex(at)),
      `${PROVIDER}/${model.id}`,
    );
  }
});

test("the user's own providers are left as they were, beside magpie's", async (t) => {
  const at = await kinexHome(t);
  await connectKinex(at, MAGPIE_MODELS.gpt, {
    mine: {
      name: "Mine",
      baseUrl: "https://example.com/v1",
      api: "openai-completions",
      apiKey: "mine",
      models: [{ id: "own-1" }],
    },
  });
  const runtime = await kinex(at);
  assert.deepEqual(
    runtime.getModels("mine").map((model) => model.id),
    ["own-1"],
  );
  await writeFile(
    at.settings,
    JSON.stringify({ defaultProvider: "mine", defaultModel: "own-1" }),
  );
  assert.equal(await startsOn(at, runtime), "mine/own-1");
});

test("taken off magpie, the provider goes whole: {} left behind is one Pi reports an error for", async (t) => {
  // magpie writes the block by one key path, so stepping out deletes that
  // key. Written flat, its keys deleted one by one would leave {} behind.
  const keys = providerKeys(GATEWAY, ALL_MODELS);
  const block = `providers.${PROVIDER}`;
  assert.deepEqual(
    Object.keys(keys).filter((key) => key.startsWith(block)),
    [block, `${block}.apiKey`],
  );
  const at = await kinexHome(t);
  await writeFile(at.models, JSON.stringify({ providers: { [PROVIDER]: {} } }));
  assert.match(String((await kinex(at)).getError()), /must specify/);
});
