import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, NormalizedBuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { afterAll, describe, expect, test } from "vitest";
import systemPrompt, { createSystemPrompt, NAME, type SystemPromptApi } from "./index.ts";

type Handler = (event: { systemPromptOptions: NormalizedBuildSystemPromptOptions }) => unknown;

const dir = mkdtempSync(join(tmpdir(), "pi-tweaks-index-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function config(settings: unknown): string {
  const path = join(dir, `${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({ [NAME]: settings }));
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

function promptOptions(customPrompt?: string): NormalizedBuildSystemPromptOptions {
  return {
    ...(customPrompt === undefined ? {} : { customPrompt }),
    selectedTools: ["read"],
    hiddenTools: [],
    toolSnippets: { read: "Read files" },
    toolGuidelines: { read: ["Use read for files"] },
    promptGuidelines: [],
    appendSystemPrompt: "",
    sections: {},
    cwd: "/repo",
    contextFiles: [],
    skills: [],
  };
}

describe("system-prompt", () => {
  test("replaces the prompt with the configured text and keeps the tools", () => {
    const handler = load({ PI_TWEAKS_CONFIG: config({ text: "You are terse." }) });
    const options = promptOptions();
    handler({ systemPromptOptions: options });
    expect(options.customPrompt).toBe(
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

  test("an explicit --system-prompt or SYSTEM.md wins, and still keeps the tools", () => {
    const handler = load({ PI_TWEAKS_CONFIG: config({ text: "Configured.", toolGuidelines: false }) });
    const options = promptOptions("From the command line.");
    handler({ systemPromptOptions: options });
    expect(options.customPrompt).toMatch(/^From the command line\.\n\n<tools>/);
    expect(options.customPrompt).not.toContain("<tool_guidelines>");
  });

  test("without text or a custom prompt, pi's prompt stays", () => {
    const handler = load({ PI_TWEAKS_CONFIG: join(dir, "missing.json") });
    const options = promptOptions();
    handler({ systemPromptOptions: options });
    expect(options.customPrompt).toBeUndefined();
  });

  test("invalid settings fail when the extension loads", () => {
    expect(() => load({ PI_TWEAKS_CONFIG: config({ txt: "typo" }) })).toThrow("unknown setting(s): txt");
  });

  test("the default export reads the config of the environment", () => {
    const saved = process.env.PI_TWEAKS_CONFIG;
    process.env.PI_TWEAKS_CONFIG = config({ text: "Env." });
    try {
      const handlers: Handler[] = [];
      systemPrompt({ on: (_event: string, fn: Handler) => handlers.push(fn) } as unknown as ExtensionAPI);
      const options = promptOptions();
      handlers[0]?.({ systemPromptOptions: options });
      expect(options.customPrompt).toMatch(/^Env\.\n\n/);
    } finally {
      if (saved === undefined) delete process.env.PI_TWEAKS_CONFIG;
      else process.env.PI_TWEAKS_CONFIG = saved;
    }
  });
});
