import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { agentDir, configPath, expandHome, readTweakSettings } from "./config.ts";

const dir = mkdtempSync(join(tmpdir(), "pi-tweaks-config-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("paths", () => {
  test("expandHome expands ~ and ~/ only", () => {
    expect(expandHome("~", "/h")).toBe("/h");
    expect(expandHome("~/x/y", "/h")).toBe("/h/x/y");
    expect(expandHome("/abs/~/x", "/h")).toBe("/abs/~/x");
    expect(expandHome("rel", "/h")).toBe("rel");
  });

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

describe("readTweakSettings", () => {
  test("a missing file or entry gives undefined", () => {
    expect(readTweakSettings(join(dir, "missing.json"), "x")).toBeUndefined();
    expect(readTweakSettings(file("other.json", '{"other": {}}'), "x")).toBeUndefined();
  });

  test("returns the entry of the tweak", () => {
    expect(readTweakSettings(file("ok.json", '{"x": {"a": 1}, "y": {}}'), "x")).toEqual({ a: 1 });
  });

  test("invalid content throws with the path", () => {
    const bad = file("bad.json", "{");
    expect(() => readTweakSettings(bad, "x")).toThrow(`${bad}: invalid JSON`);
    expect(() => readTweakSettings(file("list.json", "[]"), "x")).toThrow("expected a JSON object");
    expect(() => readTweakSettings(file("str.json", '{"x": "on"}'), "x")).toThrow('"x" must be an object');
  });

  test.skipIf(process.getuid?.() === 0)("an unreadable file throws", () => {
    const locked = file("locked.json", "{}");
    chmodSync(locked, 0o000);
    expect(() => readTweakSettings(locked, "x")).toThrow();
  });
});
