// Kinex (stacx-lab/kinex) is a robotics coding agent built on Pi's SDK, and
// it keeps Pi's files in an agent folder of its own: the providers and their
// models in models.json, and the model a new session starts on in
// settings.json, defaultProvider beside defaultModel. Both are under
// ~/.config/kinex/agent, which KINEX_CONFIG_DIR or XDG_CONFIG_HOME move;
// this module runs in magpie's own process, with no environment to read, so
// it names the default place.
//
// So Kinex is an agent with a startup file (magpie's agentplug.Startup, made
// for Pi forks such as PiG): magpie writes what connect returns into
// models.json and the model picked in its row into settings.json, and puts
// back what it finds under every key it wrote when Kinex is taken off
// magpie.
//
// No `model` key and no `own`: the row picks one model among magpie's.
// Kinex's own models are picked in Kinex (/model), which writes both keys of
// the pair; magpie writes defaultModel alone for a model of an agent's own,
// and Pi resolves that only beside a defaultProvider naming its provider.

import { providerKeys } from "./lib/provider.js";

export const agent = {
  id: "kinex",
  name: "Kinex",
  // the command Kinex is started by, and the folder it keeps: whether Kinex
  // is here
  bin: "kinex",
  dir: "~/.config/kinex/agent",
  // Pi's models.json, where magpie writes its provider
  config: "~/.config/kinex/agent/models.json",
  format: "json",
  // Pi's settings.json, where the model a new session starts on is kept
  startup: {
    config: "~/.config/kinex/agent/settings.json",
    format: "json",
    model: "defaultModel",
    keys: { defaultProvider: "magpie" },
  },
  // what Kinex reads as Pi does: the first context file in its agent folder
  // (AGENTS.md), and the skills folder beside it
  library: {
    instructions: "~/.config/kinex/agent/AGENTS.md",
    skills: "~/.config/kinex/agent/skills",
  },
  // Kinex reads models.json when it starts: Pi's /reload loads settings,
  // extensions and skills again, not the model list
  notice: "Reopen Kinex for it to take effect.",
};

// connect is given the gateway ({url, v1, key}) and magpie's models, and
// returns what to write into models.json, by key path.
export function connect(input) {
  return providerKeys(input && input.gateway, input && input.models);
}
