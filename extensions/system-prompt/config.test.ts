import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { agentDir, configPath, readTweakConfig, settingsFor, type TweakConfig } from "./config.ts";
import type { MatchContext } from "./match.ts";

const dir = mkdtempSync(join(tmpdir(), "pi-tweaks-config-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, content: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

describe("paths", () => {
  test("agentDir follows PI_CODING_AGENT_DIR", () => {
    expect(agentDir({}, "/h")).toBe("/h/.pi/agent");
    expect(agentDir({ PI_CODING_AGENT_DIR: "~/agent" }, "/h")).toBe("/h/agent");
  });

  test("configPath: PI_TWEAKS_CONFIG, else pi-tweaks.json in the agent directory", () => {
    expect(configPath({}, "/h")).toBe("/h/.pi/agent/pi-tweaks.json");
    expect(configPath({ PI_CODING_AGENT_DIR: "/a" }, "/h")).toBe("/a/pi-tweaks.json");
    expect(configPath({ PI_TWEAKS_CONFIG: "~/t.json", PI_CODING_AGENT_DIR: "/a" }, "/h")).toBe("/h/t.json");
  });
});

describe("readTweakConfig", () => {
  test("a missing file or entry has no scopes", () => {
    expect(readTweakConfig(join(dir, "missing.json"), "x").scopes).toEqual([]);
    expect(readTweakConfig(file("other.json", { other: {} }), "x").scopes).toEqual([]);
    expect(readTweakConfig(file("empty.json", { x: {} }), "x").scopes).toEqual([]);
  });

  test("global first, then repos in file order", () => {
    const path = file("ok.json", {
      x: { repos: { " owner/* ": { a: 2 }, "~/src": { enable: false } }, global: { a: 1 } },
    });
    expect(readTweakConfig(path, "x")).toEqual({
      path,
      scopes: [
        { name: "global", pattern: "*", settings: { a: 1 } },
        { name: 'repos." owner/* "', pattern: "owner/*", settings: { a: 2 } },
        { name: 'repos."~/src"', pattern: "~/src", settings: { enable: false } },
      ],
    });
  });

  test.each([
    ["bad.json", "{", "invalid JSON"],
    ["list.json", [], "expected a JSON object"],
    ["str.json", { x: "on" }, '"x" must be an object'],
    ["key.json", { x: { text: "flat" } }, 'unknown key(s): text; use "global" and "repos"'],
    ["global.json", { x: { global: true } }, '"x".global: must be an object'],
    ["repos.json", { x: { repos: [] } }, '"x".repos must be an object'],
    ["repo.json", { x: { repos: { "o/r": "on" } } }, '"x".repos."o/r": must be an object'],
    ["enable.json", { x: { global: { enable: "yes" } } }, '"enable" must be true or false'],
  ])("%s throws", (name, content, message) => {
    const path = file(name, content);
    expect(() => readTweakConfig(path, "x")).toThrow(`${path}: `);
    expect(() => readTweakConfig(path, "x")).toThrow(message);
  });

  test.skipIf(process.getuid?.() === 0)("an unreadable file throws", () => {
    const locked = file("locked.json", "{}");
    chmodSync(locked, 0o000);
    expect(() => readTweakConfig(locked, "x")).toThrow();
  });
});

describe("settingsFor", () => {
  const inRepo: MatchContext = {
    cwd: "/work/repo",
    home: "/h",
    repo: {
      worktreeRoot: "/work/repo",
      commonDir: "/work/repo/.git",
      mainRoot: "/work/repo",
      remotes: ["git@github.com:owner/repo.git"],
    },
  };
  const outside: MatchContext = { cwd: "/tmp", home: "/h", repo: undefined };
  const config = (scopes: Array<[string, Record<string, unknown>]>): TweakConfig => ({
    path: "p",
    scopes: scopes.map(([pattern, settings]) => ({ name: pattern, pattern, settings })),
  });

  test("off without a matching scope", () => {
    expect(settingsFor(config([]), inRepo)).toBeUndefined();
    expect(settingsFor(config([["other/*", { a: 1 }]]), inRepo)).toBeUndefined();
  });

  test("global applies everywhere, also outside git", () => {
    expect(settingsFor(config([["*", { a: 1 }]]), outside)).toEqual({ a: 1 });
  });

  test("matching scopes merge in order; later keys win", () => {
    const scopes = config([
      ["*", { a: 1, b: 1 }],
      ["owner/*", { b: 2 }],
      ["other/*", { b: 3 }],
      ["/work", { c: 4 }],
    ]);
    expect(settingsFor(scopes, inRepo)).toEqual({ a: 1, b: 2, c: 4 });
  });

  test("keys of a group replace each other", () => {
    const scopes = config([
      ["*", { text: "global", tools: false }],
      ["owner/repo", { file: "repo.md" }],
    ]);
    expect(settingsFor(scopes, inRepo, [["text", "file"]])).toEqual({ tools: false, file: "repo.md" });
  });

  test("enable: false turns the tweak off; a later scope can turn it on again", () => {
    expect(
      settingsFor(
        config([
          ["*", { a: 1 }],
          ["owner/repo", { enable: false }],
        ]),
        inRepo,
      ),
    ).toBeUndefined();
    expect(
      settingsFor(
        config([
          ["*", { enable: false }],
          ["owner/repo", { enable: true }],
        ]),
        inRepo,
      ),
    ).toEqual({});
  });
});
