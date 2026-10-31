# system-prompt

Replaces pi's system prompt with your own, and keeps what the tools add to it.

pi's `--system-prompt` and `SYSTEM.md` replace more than the opening text: pi then also leaves out
the list of tools, the rules (with the guidelines that tools such as `git_commit` add) and the docs
section. This tweak sets your prompt and adds the tool list and the tool guidelines back.

| Part of the prompt | pi | `--system-prompt` | this tweak |
|---|---|---|---|
| Opening text | pi's | yours | yours |
| `<tools>` (one line per tool) | yes | no | yes (`tools`) |
| `<rules>`: pi's general rules | yes | no | no |
| Guidelines of the tools | in `<rules>` | no | `<tool_guidelines>` (`toolGuidelines`) |
| `<docs>`: where pi's docs are | yes | no | no |
| `--append-system-prompt`, `APPEND_SYSTEM.md` | yes | yes | yes |
| `AGENTS.md`, skills, working directory, sections of other extensions | yes | yes | yes |

The tool declarations themselves (names, descriptions, parameters) always go to the model; they are
not part of the prompt text.

When `--system-prompt` or a `SYSTEM.md` is in play, that text wins over the configured one, and the
tool list and guidelines are still added.

## Settings

The entry `system-prompt` in `~/.pi/agent/pi-tweaks.json` (or `$PI_TWEAKS_CONFIG`):

| Key | Type | Default | Meaning |
|---|---|---|---|
| `text` | string | — | The prompt |
| `file` | path | — | A file with the prompt; relative to the config file, `~/` allowed |
| `tools` | boolean | `true` | Add the `<tools>` list |
| `toolGuidelines` | boolean | `true` | Add the `<tool_guidelines>` of the active tools |

Set `text` or `file`, not both. Without either, pi's own prompt stays. Unknown keys and an empty
prompt are errors, reported when pi loads the extension. The file is read once when pi loads the
extension; `/reload` reads it again.

```json
{ "system-prompt": { "file": "~/.config/pi/system-prompt.md" } }
```

With Home Manager:

```nix
programs.pi-tweaks.tweaks.system-prompt = {
  enable = true;
  alwaysOn = true;
  settings.file = ./system-prompt.md;
};
```
