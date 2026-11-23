// What magpie writes into Kinex's models.json for its own gateway: a
// provider named "magpie" in Pi's models.json shape.
//
// Kinex (stacx-lab/kinex) is built on Pi's SDK and keeps Pi's models.json,
// and a model of a provider Pi has no built-in list for is only what its
// entry says (modelFromJson in pi-coding-agent): without contextWindow Pi
// takes it for a 128K one, without maxTokens it caps every reply at 16384
// tokens, and without reasoning it offers no thinking. So each entry says
// all of it, as magpie's own Pi wiring does (yetone/magpie,
// internal/agent/agents.go, piModelOn).
//
// Pi checks the whole file against its schema at once, and one value of the
// wrong kind leaves it with no providers at all, so nothing is written here
// that isn't of the schema's kind: test/kinex-loads-it.test.mjs loads what
// this writes with the Pi that Kinex bundles.

export const PROVIDER = "magpie";

// Pi's thinking levels, in the order Pi lists them. Pi's off asks a model
// for the effort none.
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

// Efforts some vendors name in other words, each with the level it is
// (magpie's catalog.EffortAliases).
const ALIASES = { light: "low", extra_high: "xhigh" };

// The gateway paths connect is given a model's native_endpoints as, and the
// Pi API that asks each.
const RESPONSES = "/v1/responses";
const MESSAGES = "/v1/messages";

// A Claude's version, as magpie reads it off a model's name (the gateway's
// claudeVersion): opus-4-6, sonnet-5.5, claude-opus-5-5.
const CLAUDE_VERSION =
  /(?:^|[^a-z0-9])(?:claude-)?(?:opus|sonnet|haiku|fable|mythos)-(\d{1,2})(?:[-.](\d{1,2}))?(?:[^0-9]|$)|claude-(\d+)(?:[-.](\d))?-(?:opus|sonnet|haiku)/;
const CLAUDE = /(?:^|[/.:-])claude-/i;
// said as a string: a slash and a bracket in the class of a regex literal
// read as the literal's own
const GLM_OUTPUT_EFFORT = new RegExp("glm-5\\.[23](?:$|[-.:/\\[])", "i");
const GEMINI_GENERATION = /(?:^|\/)gemini-(\d+)/;

const text = (value) => (typeof value === "string" ? value : "");

// strings is v's strings, and nothing when v is no list.
const strings = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

const count = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

// providerKeys is what connect returns for a gateway ({url, v1, key}) and
// magpie's models as connect is given them: the keys to write into
// models.json, by key path.
export function providerKeys(gateway, models) {
  const gw = gateway && typeof gateway === "object" ? gateway : {};
  const url = text(gw.url).replace(/\/+$/, "");
  const v1 = text(gw.v1) || (url ? `${url}/v1` : "");
  // on Messages Pi is given the gateway's root, as Anthropic's SDK adds /v1
  const root = url || v1.replace(/\/v1$/, "");
  const key = text(gw.key);
  if (!v1 || !root || !key) {
    throw new Error(
      "connect was given no gateway: its address and key are needed to write Kinex's models.json",
    );
  }
  const entries = [];
  for (const model of Array.isArray(models) ? models : []) {
    if (model && text(model.id))
      entries.push(modelEntry(model, { url: root, v1 }));
  }
  return {
    "providers.magpie": {
      name: PROVIDER,
      baseUrl: v1,
      // the API every model of magpie's is served on; a model relayed on
      // another names its own below
      api: "openai-completions",
      // Pi names its session to a provider only when asked to; without it a
      // turn of Kinex's has no session in magpie's records
      compat: { sendSessionAffinityHeaders: true },
      models: entries,
    },
    // The key is written by its path as well as in the block: magpie keeps a
    // key of the gateway's among connect's own keys as the mark of its
    // wiring, and knows by it when the user has changed the key. Inside the
    // block alone it would be no mark, and the block written flat would be
    // left an empty object when magpie steps out, which Pi refuses to load.
    "providers.magpie.apiKey": key,
  };
}

// modelEntry is one of magpie's models as an entry of the provider's.
export function modelEntry(model, gateway) {
  const efforts = strings(model.efforts);
  const endpoints = strings(model.native_endpoints);
  const entry = {
    id: model.id,
    name: text(model.name) || model.id,
    // reasoning lets Pi offer thinking levels for the model
    reasoning: efforts.length > 0,
  };
  // Each model is asked on the API its provider speaks natively, so the
  // gateway relays what Pi sent as it is instead of translating Chat:
  // Responses before Messages, as magpie's Pi wiring prefers them.
  let api = "openai-completions";
  if (endpoints.includes(RESPONSES)) {
    api = "openai-responses";
    entry.api = api;
    // strict left out of a tool asked there is taken as a strict-mode
    // schema, every property required
    entry.compat = { supportsStrictMode: true };
  } else if (endpoints.includes(MESSAGES)) {
    api = "anthropic-messages";
    entry.api = api;
    entry.baseUrl = gateway.url;
    if (asksAdaptively(model.id)) {
      // pi-ai sends a thinking budget unless told otherwise, which a Claude
      // from 4.6 on, Z.ai's GLM-5.2 and 5.3 and a Gemini 3 turn away: these
      // think adaptively, by an effort in output_config
      entry.compat = { forceAdaptiveThinking: true };
    }
  }
  if (model.images) entry.input = ["text", "image"];
  const levels = thinkingLevels(
    efforts,
    api === "anthropic-messages" && thinksOnlyWhenAsked(model.id),
  );
  if (levels) entry.thinkingLevelMap = levels;
  // without it Pi takes the model for a 128K one, and compacts long before
  // it has to; a reply is kept within the window
  if (count(model.context)) entry.contextWindow = model.context;
  if (count(model.output)) {
    entry.maxTokens =
      count(model.context) && model.output > model.context
        ? model.context
        : model.output;
  }
  const cost = costOf(model.pricing);
  if (cost) entry.cost = cost;
  const cache = promptCache(api, model.id);
  if (cache) entry.promptCache = cache;
  return entry;
}

// thinkingLevels is a model's thinkingLevelMap: every level Pi lists, the
// model's own efforts mapped to the name it asks each by and the others
// null, which Pi hides and skips (a level left out is offered). Without it
// Pi offers its defaults.
function thinkingLevels(efforts, claudeOff) {
  if (efforts.length === 0) return undefined;
  const levels = {};
  for (const level of LEVELS) {
    const effort = modelEffort(efforts, level === "off" ? "none" : level);
    levels[level] = effort || null;
  }
  // A model without none always thinks, and Pi's off is left out for a
  // Claude on Messages, which takes thinking disabled whatever its levels:
  // left out, Pi offers off as it did before.
  if (claudeOff && levels.off === null) delete levels.off;
  return levels;
}

// modelEffort is the model's own name for level: level itself when its
// efforts name it, else the one of them that says it in a vendor's words.
function modelEffort(efforts, level) {
  if (efforts.includes(level)) return level;
  return (
    efforts.find(
      (effort) => (ALIASES[effort.toLowerCase()] || effort) === level,
    ) || ""
  );
}

// asksAdaptively is whether a model on Messages is asked adaptively, as
// magpie's gateway knows it of a model's name (AsksAdaptively): a Claude
// from 4.6 on, GLM-5.2 and 5.3, and a Gemini 3 or later.
function asksAdaptively(model) {
  const claude = claudeVersionOf(model);
  return (
    (!!claude &&
      (claude.major > 4 || (claude.major === 4 && claude.minor >= 6))) ||
    GLM_OUTPUT_EFFORT.test(model) ||
    geminiGeneration(model) >= 3
  );
}

// thinksOnlyWhenAsked is a model that takes thinking turned off on Messages
// whatever its levels (the gateway's ThinksOnlyWhenAsked): one of Anthropic's.
function thinksOnlyWhenAsked(model) {
  return CLAUDE.test(model) || CLAUDE_VERSION.test(model.toLowerCase());
}

function claudeVersionOf(model) {
  const found = CLAUDE_VERSION.exec(model.toLowerCase());
  if (!found) return undefined;
  const own = found[3] !== undefined;
  return {
    major: Number(own ? found[3] : found[1]) || 0,
    minor: Number(own ? found[4] : found[2]) || 0,
  };
}

function geminiGeneration(model) {
  const found = GEMINI_GENERATION.exec(model.toLowerCase());
  return found ? Number(found[1]) || 0 : 0;
}

// costOf is Pi's cost of a model, USD a million tokens, from its pricing as
// connect is given it (OpenRouter's): each a price in USD a token, written
// as a decimal. undefined without one.
function costOf(pricing) {
  if (!pricing || typeof pricing !== "object") return undefined;
  const input = perMillion(pricing.prompt);
  const output = perMillion(pricing.completion);
  if (input === undefined || output === undefined) return undefined;
  return {
    input,
    output,
    cacheRead: perMillion(pricing.input_cache_read) || 0,
    cacheWrite: perMillion(pricing.input_cache_write) || 0,
  };
}

// perMillion is a price in USD a token as USD a million tokens, with the
// decimal point moved rather than the number multiplied, so $0.3 stays 0.3.
function perMillion(price) {
  const decimal = text(price);
  if (!/^\d+(?:\.\d+)?$/.test(decimal)) return undefined;
  const [whole, fraction = ""] = decimal.split(".");
  const point = whole.length + 6;
  const digits = (whole + fraction).padEnd(point, "0");
  const rest = digits.slice(point).replace(/0+$/, "");
  const head = digits.slice(0, point);
  return Number(rest ? `${head}.${rest}` : head);
}

// promptCache is how long, in seconds, the vendor keeps a model's prompt
// cache at each of Pi's tiers, where magpie knows it of a model relayed as
// Pi sent it (its piPromptCache): a tier left out, Pi warms nothing of.
function promptCache(api, id) {
  const name = id.toLowerCase().slice(id.lastIndexOf("/") + 1);
  if (api === "anthropic-messages" && name.startsWith("claude")) {
    return { short: 300, long: 3600 };
  }
  if (api === "openai-responses" && name.startsWith("gpt")) {
    return { short: 300 };
  }
  return undefined;
}
