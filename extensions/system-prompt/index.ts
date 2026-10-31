// system-prompt: replaces pi's system prompt with your own, and keeps what the tools add to it.
import { homedir } from "node:os";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configPath, readTweakSettings } from "./config.ts";
import { buildPrompt, parseSettings } from "./prompt.ts";

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
  const settings = parseSettings(readTweakSettings(path, NAME), dirname(path), home);

  pi.on("before_agent_start", (event) => {
    const prompt = event.systemPromptOptions;
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
