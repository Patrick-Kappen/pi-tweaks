import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The settings of all tweaks, one entry per tweak name. */
const CONFIG_FILE = "pi-tweaks.json";

/** `~` and `~/...` expanded to the home directory; other paths unchanged. */
export function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  return path.startsWith("~/") ? join(home, path.slice(2)) : path;
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

/**
 * The settings of one tweak from the config file, or undefined when the file or the entry is missing.
 * A file that is not a JSON object throws, so pi reports the error instead of silently using defaults.
 */
export function readTweakSettings(path: string, name: string): Record<string, unknown> | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) throw new Error(`${path}: expected a JSON object`);
  const entry = parsed[name];
  if (entry === undefined) return undefined;
  if (!isRecord(entry)) throw new Error(`${path}: "${name}" must be an object`);
  return entry;
}
