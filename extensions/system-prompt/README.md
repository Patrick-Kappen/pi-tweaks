# system-prompt

Replaces pi's system prompt with your own, in the repositories where you turn it on, and keeps what
the tools add to it. It is off by default.

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

Where the tweak is on and `--system-prompt` or a `SYSTEM.md` is in play, that text wins over the
configured one, and the tool list and guidelines are still added. Where it is off, pi behaves as
without it.

## Settings

The entry `system-prompt` in `~/.pi/agent/pi-tweaks.json` (or `$PI_TWEAKS_CONFIG`) says where the
tweak is on, and with which settings:

| Key | Meaning |
|---|---|
| `global` | On everywhere, also outside git repositories, with these settings |
| `repos` | On in the repositories that match, with these settings on top of `global` |

A `repos` name is a remote (`owner/repo`, `host/owner/repo`, `owner/*`; it matches when any remote
of the repository ends with it, so in every clone and worktree), a path (`/...` or `~/...`: that
directory and everything below it), or `*` (everywhere). The same patterns as pi-rules and
pi-mcp-servers. Without `global` and without a matching `repos` entry, the tweak is off.

All matching scopes apply: `global` first, then the `repos` entries in file order (alphabetical with
Home Manager); later keys win, and `text` and `file` replace each other. The working directory of
the session decides, also in a subdirectory or a worktree of the repository.

The settings of a scope:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enable` | boolean | `true` | `false` turns the tweak off here, for example one repository under `owner/*` |
| `text` | string | — | The prompt |
| `file` | path | — | A file with the prompt; relative to the config file, `~/` allowed |
| `tools` | boolean | `true` | Add the `<tools>` list |
| `toolGuidelines` | boolean | `true` | Add the `<tool_guidelines>` of the active tools |

Set `text` or `file` in one scope, not both. Where the tweak is on without either, pi's own prompt
stays. Unknown keys and an empty prompt, in any scope, are errors, reported when pi loads the
extension. The files are read when pi loads the extension; `/reload` reads them again.

```json
{
  "system-prompt": {
    "repos": {
      "Patrick-Kappen/*": { "file": "~/.config/pi/system-prompt.md" },
      "Patrick-Kappen/legacy": { "enable": false },
      "~/work/customer": { "file": "~/.config/pi/customer.md", "tools": false }
    }
  }
}
```

With Home Manager:

```nix
programs.pi-tweaks.tweaks.system-prompt = {
  enable = true;
  alwaysOn = true;
  repos = {
    "Patrick-Kappen/*".file = ./system-prompt.md;
    "Patrick-Kappen/legacy".enable = false;
  };
};
```
