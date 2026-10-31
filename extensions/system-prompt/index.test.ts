import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, NormalizedBuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { afterAll, describe, expect, test } from "vitest";
import systemPrompt, { createSystemPrompt, NAME, type SystemPromptApi } from "./index.ts";

type Handler = (event: { systemPromptOptions: NormalizedBuildSystemPromptOptions }) => unknown;

const dir = realpathSync(mkdtempSync(join(tmpdir(), "pi-tweaks-index-")));
const repo = join(dir, "repo");
const plain = join(dir, "plain");
mkdirSync(plain);
mkdirSync(repo);
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
execFileSync("git", ["init", "-q", repo], { env: gitEnv });
execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:Owner/Repo.git"], { env: gitEnv });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let configs = 0;
function config(entry: unknown): string {
  const path = join(dir, `config-${configs++}.json`);
  writeFileSync(path, JSON.stringify({ [NAME]: entry }));
  return path;
}

function load(env: NodeJS.ProcessEnv): Handler {
  let handler: Handler | undefined;
  const pi = {
    on(event: string, fn: Handler) {
      expect(event).toBe("before_agent_start");
      handler = fn;
    },
  } as unknown as SystemPromptApi;
  createSystemPrompt(pi, { env, home: dir });
  if (!handler) throw new Error("no before_agent_start handler");
  return handler;
}

function run(handler: Handler, cwd: string, customPrompt?: string): string | undefined {
  const options: NormalizedBuildSystemPromptOptions = {
    ...(customPrompt === undefined ? {} : { customPrompt }),
    selectedTools: ["read"],
    hiddenTools: [],
    toolSnippets: { read: "Read files" },
    toolGuidelines: { read: ["Use read for files"] },
    promptGuidelines: [],
    appendSystemPrompt: "",
    sections: {},
    cwd,
    contextFiles: [],
    skills: [],
  };
  handler({ systemPromptOptions: options });
  return options.customPrompt;
}

describe("system-prompt", () => {
  test("global: replaces the prompt everywhere and keeps the tools", () => {
    const handler = load({ PI_TWEAKS_CONFIG: config({ global: { text: "You are terse." } }) });
    expect(run(handler, plain)).toBe(
      [
        "You are terse.",
        "",
        "<tools>",
        "- read: Read files",
        "In addition to the tools above, you may have access to other custom tools depending on the project.",
        "</tools>",
        "",
        "<tool_guidelines>",
        "- Use read for files",
        "</tool_guidelines>",
      ].join("\n"),
    );
  });

  test("off by default: without scopes pi's prompt stays", () => {
    expect(run(load({ PI_TWEAKS_CONFIG: join(dir, "missing.json") }), repo)).toBeUndefined();
    expect(run(load({ PI_TWEAKS_CONFIG: config({}) }), repo)).toBeUndefined();
  });

  test("repos: on only in matching repositories, also in a subdirectory", () => {
    const handler = load({ PI_TWEAKS_CONFIG: config({ repos: { "owner/*": { text: "Repo prompt." } } }) });
    const sub = join(repo, "src");
    mkdirSync(sub);
    expect(run(handler, repo)).toMatch(/^Repo prompt\.\n\n<tools>/);
    expect(run(handler, sub)).toMatch(/^Repo prompt\./);
    expect(run(handler, plain)).toBeUndefined();
  });

  test("a repository can change or turn off the global settings", () => {
    const changed = load({
      PI_TWEAKS_CONFIG: config({
        global: { text: "Global." },
        repos: { "owner/repo": { text: "Here.", tools: false } },
      }),
    });
    expect(run(changed, repo)).toBe("Here.\n\n<tool_guidelines>\n- Use read for files\n</tool_guidelines>");
    expect(run(changed, plain)).toMatch(/^Global\.\n\n<tools>/);
    const off = load({
      PI_TWEAKS_CONFIG: config({ global: { text: "Global." }, repos: { [plain]: { enable: false } } }),
    });
    expect(run(off, plain)).toBeUndefined();
  });

  test("where it is on, an explicit --system-prompt or SYSTEM.md wins and keeps the tools", () => {
    const handler = load({ PI_TWEAKS_CONFIG: config({ repos: { "owner/repo": { toolGuidelines: false } } }) });
    expect(run(handler, repo, "From the command line.")).toBe(
      [
        "From the command line.",
        "",
        "<tools>",
        "- read: Read files",
        "In addition to the tools above, you may have access to other custom tools depending on the project.",
        "</tools>",
      ].join("\n"),
    );
    // Where it is off, pi's own handling of --system-prompt stays.
    expect(run(handler, plain, "From the command line.")).toBe("From the command line.");
  });

  test("on without a text, pi's prompt stays", () => {
    expect(run(load({ PI_TWEAKS_CONFIG: config({ global: {} }) }), plain)).toBeUndefined();
  });

  test("invalid settings in any scope fail when the extension loads", () => {
    const path = config({ repos: { "other/repo": { txt: "typo" } } });
    expect(() => load({ PI_TWEAKS_CONFIG: path })).toThrow(
      `${path}: repos."other/repo": system-prompt: unknown setting(s): txt`,
    );
  });

  test("the default export reads the config of the environment", () => {
    const saved = process.env.PI_TWEAKS_CONFIG;
    process.env.PI_TWEAKS_CONFIG = config({ global: { text: "Env." } });
    try {
      const handlers: Handler[] = [];
      systemPrompt({ on: (_event: string, fn: Handler) => handlers.push(fn) } as unknown as ExtensionAPI);
      const [handler] = handlers;
      if (!handler) throw new Error("no handler");
      expect(run(handler, plain)).toMatch(/^Env\.\n\n/);
    } finally {
      if (saved === undefined) delete process.env.PI_TWEAKS_CONFIG;
      else process.env.PI_TWEAKS_CONFIG = saved;
    }
  });
});
