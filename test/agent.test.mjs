import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { agent, connect } from "../kinex.agent.js";
import { PROVIDER, providerKeys } from "../lib/provider.js";
import { ALL_MODELS, GATEWAY, ROOT } from "./helpers.mjs";

const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

// Where Kinex keeps its files (src/settings.ts, paths): its agent folder
// under ~/.config/kinex.
const AGENT_DIR = "~/.config/kinex/agent";

test("the agent is as magpie checks an agent plugin's (agentplug.Desc.check)", () => {
  assert.match(agent.id, /^[a-z0-9][a-z0-9._-]{0,63}$/);
  assert.equal(agent.name, "Kinex");
  assert.ok(agent.config);
  assert.equal(agent.format, "json");
  // the model is kept in a file apart (startup), so none is named in config
  assert.equal(agent.model, undefined);
  const { startup } = agent;
  assert.ok(startup.config);
  assert.notEqual(startup.config, agent.config);
  assert.equal(startup.format, "json");
  assert.ok(startup.model);
  assert.equal(startup.keys[startup.model], undefined);
  assert.equal(startup.keys.defaultProvider, PROVIDER);
  assert.equal(typeof agent.notice, "string");
});

test("every file the agent names is in Kinex's agent folder", () => {
  const files = [
    agent.config,
    agent.startup.config,
    agent.library.instructions,
    agent.library.skills,
  ];
  for (const file of files) {
    assert.ok(file.startsWith(`${AGENT_DIR}/`), file);
  }
  assert.equal(agent.dir, AGENT_DIR);
  assert.equal(agent.bin, "kinex");
});

test("Kinex has no MCP file of its own, so none is given to the Library", () => {
  assert.equal(agent.library.mcp, undefined);
});

test("connect gives the gateway and the models to providerKeys, and no own is given", () => {
  assert.deepEqual(
    connect({ gateway: GATEWAY, models: ALL_MODELS }),
    providerKeys(GATEWAY, ALL_MODELS),
  );
  // no own: magpie writes defaultModel alone for a model of an agent's own,
  // which Pi resolves only beside a defaultProvider naming its provider
  assert.equal(agent.own, undefined);
});

test("package.json names the module, and nothing for magpie's Bun host to load", () => {
  assert.equal(pkg.magpie.agent, "./kinex.agent.js");
  // an agent alone runs in magpie's own process: with a main or exports
  // magpie would start its plugin host for the package too
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.exports, undefined);
  assert.ok(pkg.files.includes("kinex.agent.js"));
  assert.ok(pkg.files.includes("lib"));
});

test("the icon is a picture magpie decodes: a PNG data URI under its limit", () => {
  const { icon } = pkg.magpie;
  assert.match(icon, /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/);
  assert.ok(Buffer.byteLength(icon) <= 1 << 20);
  const png = Buffer.from(
    icon.slice("data:image/png;base64,".length),
    "base64",
  );
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 192);
  assert.equal(png.readUInt32BE(20), 192);
});

test("the module imports only files beside it, as magpie links an agent plugin", async () => {
  const lib = (await readdir(path.join(ROOT, "lib"))).map(
    (name) => `lib/${name}`,
  );
  for (const file of ["kinex.agent.js", ...lib]) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    for (const found of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      assert.match(found[1], /^\.{1,2}\//, `${file} imports ${found[1]}`);
      assert.equal(found[1].endsWith(".js"), true, `${file}: by its file name`);
      await readFile(path.join(ROOT, path.dirname(file), found[1]));
    }
  }
});
