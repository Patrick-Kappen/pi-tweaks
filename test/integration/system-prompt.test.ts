// Runs the real pi CLI with --no-extensions and the tweak passed with -e, as the Home Manager wrapper
// does for always-on tweaks, and checks the system prompt that reaches the model.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

const repo = resolve(import.meta.dirname, "../..");
const cli = join(repo, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const tweak = join(repo, "extensions/system-prompt");
const provider = join(repo, "test/fixtures/fake-provider.ts");

const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-tweaks-it-")));
const agentDir = join(root, "agent");
const project = join(root, "project");
mkdirSync(agentDir);
mkdirSync(project);
writeFileSync(join(root, "prompt.md"), "You are the pi-tweaks test agent.\n");
writeFileSync(
  join(agentDir, "pi-tweaks.json"),
  JSON.stringify({ "system-prompt": { global: { file: "../prompt.md" } } }),
);
// On only in repositories of other-owner: not in the test project.
const elsewhere = join(root, "elsewhere.json");
writeFileSync(elsewhere, JSON.stringify({ "system-prompt": { repos: { "other-owner/*": { text: "Elsewhere." } } } }));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let runs = 0;

function systemPromptOf(args: string[], extraEnv: Record<string, string> = {}): string {
  const capture = join(root, `capture-${runs++}.txt`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PI_")));
  execFileSync(
    process.execPath,
    [cli, "-ne", "-e", provider, "-e", tweak, "--provider", "faux", "--model", "echo", ...args, "hi"],
    {
      cwd: project,
      env: { ...env, HOME: root, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", CAPTURE_FILE: capture, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    },
  );
  return readFileSync(capture, "utf8");
}

describe("pi -ne -e system-prompt", () => {
  test("print mode: the configured prompt replaces pi's, the tools stay", () => {
    const prompt = systemPromptOf(["-p"]);
    expect(prompt.startsWith("You are the pi-tweaks test agent.\n\n<tools>\n")).toBe(true);
    expect(prompt).toMatch(/^- read: /m);
    expect(prompt).toMatch(/^- bash: /m);
    expect(prompt).toContain("<tool_guidelines>");
    expect(prompt).toContain(`<cwd>\n${project}\n</cwd>`);
    expect(prompt).not.toContain("expert coding assistant");
    expect(prompt).not.toContain("Pi documentation");
  });

  test("json mode, with --append-system-prompt kept", () => {
    const prompt = systemPromptOf(["--mode", "json", "--append-system-prompt", "Always answer in Dutch."]);
    expect(prompt.startsWith("You are the pi-tweaks test agent.")).toBe(true);
    expect(prompt).toContain("<addendum>\nAlways answer in Dutch.\n</addendum>");
  });

  test("--system-prompt wins over the configured text and keeps the tools", () => {
    const prompt = systemPromptOf(["-p", "--system-prompt", "One-off prompt."]);
    expect(prompt.startsWith("One-off prompt.\n\n<tools>\n")).toBe(true);
    expect(prompt).not.toContain("pi-tweaks test agent");
  });

  test("where no scope matches, pi's own prompt stays", () => {
    const prompt = systemPromptOf(["-p"], { PI_TWEAKS_CONFIG: elsewhere });
    expect(prompt).toContain("expert coding assistant");
    expect(prompt).not.toContain("Elsewhere.");
  });
});
