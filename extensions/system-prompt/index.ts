// system-prompt: replaces pi's system prompt with your own where you turn it on, and keeps what the tools add.
import { homedir } from "node:os";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configPath, readTweakConfig, settingsFor } from "./config.ts";
import { buildPrompt, PROMPT_KEYS, parseSettings, type Settings } from "./prompt.ts";
import { findRepo } from "./repo.ts";

/** The name of this tweak: its directory, and its key in `pi-tweaks.json`. */
export const NAME = "system-prompt";

export interface Options {
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/** The pi methods this extension uses; a subset of ExtensionAPI, so tests can pass a fake. */
export type SystemPromptApi = Pick<ExtensionAPI, "on">;

export function createSystemPrompt(pi: SystemPromptApi, options: Options = {}): void {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const path = configPath(env, home);
  const configDir = dirname(path);
  const config = readTweakConfig(path, NAME);

  // Check every scope now, so a mistake shows when pi loads the extension, not in some repository later.
  for (const scope of config.scopes) {
    const { enable: _, ...settings } = scope.settings;
    try {
      parseSettings(settings, configDir, home);
    } catch (error) {
      throw new Error(`${path}: ${scope.name}: ${(error as Error).message}`);
    }
  }

  /** The settings per working directory; undefined where the tweak is off. */
  const byCwd = new Map<string, Settings | undefined>();
  const settingsIn = (cwd: string): Settings | undefined => {
    if (!byCwd.has(cwd)) {
      const raw = settingsFor(config, { cwd, home, repo: findRepo(cwd) }, [PROMPT_KEYS]);
      byCwd.set(cwd, raw && parseSettings(raw, configDir, home));
    }
    return byCwd.get(cwd);
  };

  pi.on("before_agent_start", (event) => {
    const prompt = event.systemPromptOptions;
    const settings = settingsIn(prompt.cwd);
    if (!settings) return;
    // An explicit --system-prompt or SYSTEM.md wins over the configured text; either way the tools stay.
    const text = prompt.customPrompt ?? settings.text;
    if (text === undefined) return;
    // With a custom prompt pi leaves out its preamble, tool list, rules and docs; the rest stays:
    // --append-system-prompt, AGENTS.md, skills, the working directory and sections of other extensions.
    prompt.customPrompt = buildPrompt(text, prompt, settings);
  });
}

export default function systemPrompt(pi: ExtensionAPI): void {
  createSystemPrompt(pi);
}
