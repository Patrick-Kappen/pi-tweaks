import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { buildPrompt, parseSettings, renderToolGuidelines, renderTools, type ToolPromptOptions } from "./prompt.ts";

const dir = mkdtempSync(join(tmpdir(), "pi-tweaks-prompt-"));
const home = join(dir, "home");
mkdirSync(home);
writeFileSync(join(dir, "relative.md"), "From a relative file.\n");
writeFileSync(join(home, "home.md"), "From home.");
writeFileSync(join(dir, "blank.md"), "  \n");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function options(overrides: Partial<ToolPromptOptions> = {}): ToolPromptOptions {
  return {
    selectedTools: ["read", "bash", "secret", "git_pr"],
    hiddenTools: ["secret"],
    toolSnippets: { read: "Read files", bash: "Run commands", secret: "Hidden", git_pr: "Open a PR" },
    toolGuidelines: {
      bash: ["Use bash for ls"],
      secret: ["Never shown"],
      git_pr: ["Use git_pr to push", "Use bash for ls"],
    },
    promptGuidelines: ["  Extra rule  ", ""],
    ...overrides,
  };
}

describe("parseSettings", () => {
  test("defaults: no text, keep tools and guidelines", () => {
    expect(parseSettings(undefined, dir, home)).toEqual({ tools: true, toolGuidelines: true });
    expect(parseSettings({}, dir, home)).toEqual({ tools: true, toolGuidelines: true });
  });

  test("text, trimmed", () => {
    expect(parseSettings({ text: "  Be brief.\n", tools: false }, dir, home)).toEqual({
      text: "Be brief.",
      tools: false,
      toolGuidelines: true,
    });
  });

  test("file: absolute, relative to the config, or under ~", () => {
    expect(parseSettings({ file: join(dir, "relative.md") }, "/elsewhere", home).text).toBe("From a relative file.");
    expect(parseSettings({ file: "relative.md" }, dir, home).text).toBe("From a relative file.");
    expect(parseSettings({ file: "~/home.md" }, dir, home).text).toBe("From home.");
  });

  test.each([
    [{ text: "a", file: "b" }, "not both"],
    [{ text: 1 }, '"text" must be a string'],
    [{ file: true }, '"file" must be a path'],
    [{ text: "   " }, "the prompt is empty"],
    [{ file: "blank.md" }, "the prompt is empty"],
    [{ tools: "yes" }, '"tools" must be true or false'],
    [{ toolHints: false }, "unknown setting(s): toolHints"],
  ])("rejects %j", (raw, message) => {
    expect(() => parseSettings(raw, dir, home)).toThrow(message);
  });

  test("a missing file throws", () => {
    expect(() => parseSettings({ file: "missing.md" }, dir, home)).toThrow("ENOENT");
  });
});

describe("renderTools", () => {
  test("lists declared tools with a snippet, like pi", () => {
    expect(renderTools(options({ toolSnippets: { read: "Read files", git_pr: "Open a PR", secret: "Hidden" } }))).toBe(
      [
        "<tools>",
        "- read: Read files",
        "- git_pr: Open a PR",
        "In addition to the tools above, you may have access to other custom tools depending on the project.",
        "</tools>",
      ].join("\n"),
    );
  });

  test("undefined without tools to list", () => {
    expect(renderTools(options({ selectedTools: [] }))).toBeUndefined();
    expect(renderTools(options({ toolSnippets: {} }))).toBeUndefined();
  });
});

describe("renderToolGuidelines", () => {
  test("guidelines of declared tools and extra guidelines, deduplicated", () => {
    expect(renderToolGuidelines(options())).toBe(
      ["<tool_guidelines>", "- Use bash for ls", "- Use git_pr to push", "- Extra rule", "</tool_guidelines>"].join(
        "\n",
      ),
    );
  });

  test("undefined without guidelines", () => {
    expect(renderToolGuidelines(options({ toolGuidelines: {}, promptGuidelines: [] }))).toBeUndefined();
  });
});

describe("buildPrompt", () => {
  test("the text, then the tools, then the guidelines", () => {
    const prompt = buildPrompt("  You are terse.  ", options(), { tools: true, toolGuidelines: true });
    expect(prompt.startsWith("You are terse.\n\n<tools>\n- read: Read files\n")).toBe(true);
    expect(prompt.indexOf("<tools>")).toBeLessThan(prompt.indexOf("<tool_guidelines>"));
    expect(prompt).not.toContain("Hidden");
    expect(prompt).not.toContain("Never shown");
  });

  test("tools and guidelines can be left out", () => {
    expect(buildPrompt("Only me.", options(), { tools: false, toolGuidelines: false })).toBe("Only me.");
    expect(buildPrompt("Me.", options(), { tools: false, toolGuidelines: true })).toMatch(/^Me\.\n\n<tool_guidelines>/);
  });
});
