import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { expandHome } from "./config.ts";

/** The settings of the system-prompt tweak, validated and with the prompt file read. */
export interface Settings {
  /** The prompt that replaces pi's own; undefined leaves pi's prompt alone. */
  text?: string;
  /** Keep the list of tools (their one-line snippets). */
  tools: boolean;
  /** Keep the guidelines that tools add to the prompt. */
  toolGuidelines: boolean;
}

/** The parts of pi's prompt options this tweak reads. */
export interface ToolPromptOptions {
  selectedTools: string[];
  hiddenTools: string[];
  toolSnippets: Record<string, string>;
  toolGuidelines: Record<string, string[]>;
  promptGuidelines: string[];
}

const KEYS = new Set(["text", "file", "tools", "toolGuidelines"]);

function flag(raw: Record<string, unknown>, key: string): boolean {
  const value = raw[key];
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Error(`system-prompt: "${key}" must be true or false`);
  return value;
}

function promptText(raw: Record<string, unknown>, configDir: string, home: string): string | undefined {
  const { text, file } = raw;
  if (text !== undefined && file !== undefined) throw new Error('system-prompt: set "text" or "file", not both');
  if (text !== undefined && typeof text !== "string") throw new Error('system-prompt: "text" must be a string');
  if (file !== undefined && typeof file !== "string") throw new Error('system-prompt: "file" must be a path');
  if (text === undefined && file === undefined) return undefined;
  let content: string;
  if (typeof file === "string") {
    const expanded = expandHome(file, home);
    const path = isAbsolute(expanded) ? expanded : resolve(configDir, expanded);
    content = readFileSync(path, "utf8");
  } else {
    content = text as string;
  }
  if (content.trim() === "") throw new Error("system-prompt: the prompt is empty");
  return content.trim();
}

/**
 * Validates the raw settings and reads the prompt file. A relative `file` is resolved against the
 * directory of the config file. Unknown keys throw, so a typo does not silently do nothing.
 */
export function parseSettings(raw: Record<string, unknown> | undefined, configDir: string, home: string): Settings {
  const entry = raw ?? {};
  const unknown = Object.keys(entry).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) throw new Error(`system-prompt: unknown setting(s): ${unknown.join(", ")}`);
  const text = promptText(entry, configDir, home);
  const settings: Settings = { tools: flag(entry, "tools"), toolGuidelines: flag(entry, "toolGuidelines") };
  if (text !== undefined) settings.text = text;
  return settings;
}

/** The tools the model sees declared, in order; hidden tools are reachable only through other tools. */
function declaredTools(options: ToolPromptOptions): string[] {
  return options.selectedTools.filter((name) => !options.hiddenTools.includes(name));
}

/** The `<tools>` block, the same as pi's own, or undefined when no declared tool has a snippet. */
export function renderTools(options: ToolPromptOptions): string | undefined {
  const lines = declaredTools(options)
    .filter((name) => options.toolSnippets[name])
    .map((name) => `- ${name}: ${options.toolSnippets[name]}`);
  if (lines.length === 0) return undefined;
  return [
    "<tools>",
    ...lines,
    "In addition to the tools above, you may have access to other custom tools depending on the project.",
    "</tools>",
  ].join("\n");
}

/**
 * The guidelines of the declared tools and the extra prompt guidelines, deduplicated, without pi's
 * general rules; undefined when there are none.
 */
export function renderToolGuidelines(options: ToolPromptOptions): string | undefined {
  const rules: string[] = [];
  const add = (rule: string): void => {
    const trimmed = rule.trim();
    if (trimmed !== "" && !rules.includes(trimmed)) rules.push(trimmed);
  };
  for (const name of declaredTools(options)) {
    for (const rule of options.toolGuidelines[name] ?? []) add(rule);
  }
  for (const rule of options.promptGuidelines) add(rule);
  if (rules.length === 0) return undefined;
  return ["<tool_guidelines>", ...rules.map((rule) => `- ${rule}`), "</tool_guidelines>"].join("\n");
}

/** The text that replaces pi's preamble, tool list, rules and docs: the prompt, then the tool blocks. */
export function buildPrompt(text: string, options: ToolPromptOptions, settings: Settings): string {
  const parts = [
    text.trim(),
    settings.tools ? renderTools(options) : undefined,
    settings.toolGuidelines ? renderToolGuidelines(options) : undefined,
  ];
  return parts.filter((part): part is string => part !== undefined).join("\n\n");
}
