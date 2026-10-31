# pi-tweaks

[pi](https://pi.dev) extensions for the little changes that do not fit anywhere else, packaged as a
Nix flake with a Home Manager module. Each tweak is a small extension of its own, off by default; you
turn it on everywhere or per repository, like pi-rules and pi-mcp-servers.

| Tweak | What it does |
|---|---|
| [system-prompt](extensions/system-prompt/README.md) | Replaces pi's system prompt with your own, and keeps the tool list and the tool guidelines |

## Install

Add the flake and import the Home Manager module:

```nix
# flake.nix
inputs.pi-tweaks = {
  url = "github:Patrick-Kappen/pi-tweaks/latest";
  inputs = {
    nixpkgs.follows = "nixpkgs";
    home-manager.follows = "home-manager";
  };
};
```

```nix
# Home Manager
imports = [ inputs.pi-tweaks.homeModules.default ];

programs.pi-tweaks = {
  enable = true;
  tweaks.system-prompt = {
    enable = true;
    alwaysOn = true;
    repos."my-org/*".file = ./system-prompt.md;
  };
};
```

Only the tweaks with `enable = true` are installed, and they do nothing until you say where:

| Option | Where the tweak is on |
|---|---|
| `global = { ... }` | Everywhere, also outside git repositories |
| `repos."<pattern>" = { ... }` | In matching repositories: a remote (`owner/repo`, `owner/*`), a path (`~/src/x`), or `*` |
| `repos."<pattern>".enable = false` | Off there, also when `global` or another pattern turns it on |

The attribute sets are the settings of the tweak; its README lists them. They go to
`~/.pi/agent/pi-tweaks.json`, one entry per tweak, as `{ "global": {...}, "repos": {...} }`.

### Always on

`alwaysOn` decides how a tweak is loaded; `global` and `repos` still decide where it does something.

| | Installed as | Loads with `-ne` | Turn off with `pi config` |
|---|---|---|---|
| `enable` | `~/.pi/agent/extensions/pi-tweaks-<name>`, discovered by pi | no | yes |
| `enable` + `alwaysOn` | passed with `-e` by a `pi` wrapper | yes | no |

pi loads extensions passed with `-e` even with `--no-extensions`. For always-on tweaks the module
puts a `pi` wrapper on `PATH`, above the pi of `programs.pi-coding-agent`, that starts pi with
`-e <tweak>` for each of them. That covers every mode (interactive, `-p`, `--mode json`,
`--mode rpc`) and every pi started from `PATH`, such as subagents. pi's subcommands (`pi config`,
`pi install`, `pi mcp`, ...) are passed through unchanged.

The wrapper starts `programs.pi-tweaks.piPackage`: the package of `programs.pi-coding-agent` when
that module is enabled, else `pkgs.pi-coding-agent`.

Without Home Manager: copy `extensions/<name>` anywhere, load it with `pi -e <dir>` or list it in the
`extensions` setting, and write `~/.pi/agent/pi-tweaks.json` yourself.

### Adding a tweak

A tweak is a directory `extensions/<name>/` with an `index.ts` that exports the extension, its tests
next to it (`*.test.ts`), and a `README.md`. It reads its scopes from the entry `<name>` of
`pi-tweaks.json` (`config.ts`, with the repository matching of `match.ts` and `repo.ts`, shared with
pi-rules and pi-mcp-servers). The package and the Home Manager module pick it up by its directory.

## Development

The dev environment uses [devenv](https://devenv.sh):

```sh
devenv shell   # tools, dependencies and git hooks
check          # everything CI runs
```

| Command | What it runs |
|---|---|
| `lint` | Linters and formatters (check only) |
| `typecheck` | The type checker |
| `unit [files]` | Tests; with files, only the tests related to them. `test/integration` runs the real pi CLI with `-ne -e <tweak>` and a fake model |
| `security` | gitleaks over the history, and known vulnerabilities in the lock files |
| `check` | All of the above with coverage, plus `nix flake check` if there is a `flake.nix` |

### Git hooks

| Hook | Checks |
|---|---|
| `pre-commit` | The staged files: linters, types, and the unit tests related to them; secrets; no commits on `main` |
| `commit-msg` | [Conventional Commits](https://www.conventionalcommits.org/) |
| `pre-push` | `check` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## CI and releases

- `ci.yml` runs `devenv test` on every PR and on `main`, and checks the PR title and commit messages.
- `release.yml` runs [release-please](https://github.com/googleapis/release-please) on `main`:
  1. It keeps one release PR that collects the merged PRs, with the version bump and the notes in
     [`CHANGELOG.md`](CHANGELOG.md).
  2. Merging that PR tags `vX.Y.Z`, publishes the release, and moves the `latest` branch to it.
- Squash-merge PRs: the PR title becomes the commit on `main`.
