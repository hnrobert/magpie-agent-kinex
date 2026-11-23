import { URL, fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));

// The gateway as connect is given it: its root, its /v1, and the key magpie
// issued Kinex (gateway.TokenFor).
export const GATEWAY = {
  url: "http://127.0.0.1:3425",
  v1: "http://127.0.0.1:3425/v1",
  key: "magpie-kinex",
};

// Magpie's models as connect is given them, one of each kind the gateway
// lists: by provider, on each of the paths it relays a request on as it is.
export const MAGPIE_MODELS = {
  glm: {
    id: "cchp-general/glm-5.4",
    name: "GLM 5.4",
    context: 200000,
    output: 131072,
    images: false,
    efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  },
  claude: {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    context: 500000,
    output: 128000,
    images: true,
    efforts: ["low", "medium", "high", "xhigh", "max"],
    native_endpoints: ["/v1/messages", "/v1/chat/completions"],
    pricing: {
      prompt: "0.000005",
      completion: "0.000025",
      input_cache_read: "0.0000005",
      input_cache_write: "0.00000625",
    },
  },
  gpt: {
    id: "gpt-5.5",
    name: "GPT-5.5",
    context: 400000,
    output: 128000,
    images: true,
    efforts: ["none", "low", "medium", "high"],
    native_endpoints: ["/v1/chat/completions", "/v1/responses"],
    pricing: { prompt: "0.00000125", completion: "0.00001" },
  },
  kimi: {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    context: 256000,
    output: 32768,
    images: false,
    efforts: ["light", "medium", "extra_high"],
    native_endpoints: ["/v1/messages"],
  },
};

export const ALL_MODELS = Object.values(MAGPIE_MODELS);

// applyKeys is what magpie makes of connect's keys (edit.SetJSON): each
// written at its key path, in the order given, an object whole as its JSON.
export function applyKeys(target, keys) {
  for (const [keyPath, value] of Object.entries(keys)) {
    const parts = keyPath.split(".");
    let node = target;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== "object") node[part] = {};
      node = node[part];
    }
    node[parts.at(-1)] = JSON.parse(JSON.stringify(value));
  }
  return target;
}
