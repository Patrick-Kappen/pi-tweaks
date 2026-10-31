import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandHome, type MatchContext, patternMatches } from "./match.ts";

/** The settings of all tweaks, one entry per tweak name. */
const CONFIG_FILE = "pi-tweaks.json";

/** The pattern of the `global` scope: everywhere, also outside git repositories. */
const EVERYWHERE = "*";

/** Settings for one place: `global` (pattern `*`) or one entry of `repos`. */
interface Scope {
  /** `global` or `repos."<pattern>"`, for error messages. */
  name: string;
  pattern: string;
  settings: Record<string, unknown>;
}

/** The scopes of one tweak, in order: `global` first, then `repos` in file order. */
export interface TweakConfig {
  path: string;
  scopes: Scope[];
}

/** pi's agent directory: `$PI_CODING_AGENT_DIR`, else `~/.pi/agent`. */
export function agentDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const dir = env.PI_CODING_AGENT_DIR;
  return dir ? expandHome(dir, home) : join(home, ".pi", "agent");
}

/** `$PI_TWEAKS_CONFIG`, else `pi-tweaks.json` in the agent directory. */
export function configPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const file = env.PI_TWEAKS_CONFIG;
  return file ? expandHome(file, home) : join(agentDir(env, home), CONFIG_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${(error as Error).message}`);
  }
}

function scope(name: string, pattern: string, settings: unknown, where: string): Scope {
  if (!isRecord(settings)) throw new Error(`${where}: must be an object`);
  if (settings.enable !== undefined && typeof settings.enable !== "boolean") {
    throw new Error(`${where}: "enable" must be true or false`);
  }
  return { name, pattern, settings };
}

/**
 * The scopes of one tweak from the config file: `{ "<tweak>": { "global": {...}, "repos": { "<pattern>": {...} } } }`.
 * A missing file or entry has no scopes, so the tweak does nothing. Invalid content throws, so pi reports the
 * error instead of silently doing nothing.
 */
export function readTweakConfig(path: string, tweak: string): TweakConfig {
  const config: TweakConfig = { path, scopes: [] };
  const parsed = readJson(path);
  if (parsed === undefined) return config;
  if (!isRecord(parsed)) throw new Error(`${path}: expected a JSON object`);
  const entry = parsed[tweak];
  if (entry === undefined) return config;
  const where = `${path}: "${tweak}"`;
  if (!isRecord(entry)) throw new Error(`${where} must be an object`);
  const unknown = Object.keys(entry).filter((key) => key !== "global" && key !== "repos");
  if (unknown.length > 0) throw new Error(`${where}: unknown key(s): ${unknown.join(", ")}; use "global" and "repos"`);
  if (entry.global !== undefined) config.scopes.push(scope("global", EVERYWHERE, entry.global, `${where}.global`));
  if (entry.repos !== undefined) {
    if (!isRecord(entry.repos)) throw new Error(`${where}.repos must be an object`);
    for (const [pattern, settings] of Object.entries(entry.repos)) {
      config.scopes.push(scope(`repos."${pattern}"`, pattern.trim(), settings, `${where}.repos."${pattern}"`));
    }
  }
  return config;
}

function scopeMatches(scope: Scope, ctx: MatchContext): boolean {
  return scope.pattern === EVERYWHERE || patternMatches(scope.pattern, ctx);
}

/**
 * The settings of the tweak in this session, or undefined when it is off here.
 *
 * The tweak is on where `global` is set or a `repos` pattern matches. The matching scopes are merged in order,
 * later keys win; keys in one of `groups` replace each other (a scope with `file` drops an earlier `text`).
 * `enable: false` in the merged result turns the tweak off here; `enable` is not part of the result.
 */
export function settingsFor(
  config: TweakConfig,
  ctx: MatchContext,
  groups: readonly (readonly string[])[] = [],
): Record<string, unknown> | undefined {
  const matching = config.scopes.filter((entry) => scopeMatches(entry, ctx));
  if (matching.length === 0) return undefined;
  const merged: Record<string, unknown> = {};
  for (const { settings } of matching) {
    for (const group of groups) {
      if (group.some((key) => key in settings)) for (const key of group) delete merged[key];
    }
    Object.assign(merged, settings);
  }
  if (merged.enable === false) return undefined;
  delete merged.enable;
  return merged;
}
