# Home Manager module: installs the tweaks you enable and writes where they apply to pi-tweaks.json.
#
# Every tweak is off by default: it does something only where `global` or a `repos` entry says so.
#
# How it loads:
# - An enabled tweak goes to <agentDir>/extensions/pi-tweaks-<name>; pi discovers it, and `pi config`
#   or `-ne` can turn it off.
# - An always-on tweak is not discovered: a `pi` wrapper passes it with `-e`, which pi loads even with
#   `--no-extensions`, in every mode (interactive, -p, json, rpc) and in every pi started from PATH.
{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.pi-tweaks;
  json = pkgs.formats.json { };
  piAgent = config.programs.pi-coding-agent or { };

  enabled = lib.filterAttrs (_: tweak: tweak.enable) cfg.tweaks;
  alwaysOn = lib.filterAttrs (_: tweak: tweak.alwaysOn) enabled;
  discovered = lib.filterAttrs (_: tweak: !tweak.alwaysOn) enabled;

  tweakDir = name: "${cfg.package}/${name}";

  # pi's subcommands manage packages and config; they take no -e.
  subcommands = [
    "install"
    "remove"
    "uninstall"
    "update"
    "list"
    "config"
    "auth"
    "mcp"
  ];
  extensionArgs = lib.concatMap (name: [
    "-e"
    (tweakDir name)
  ]) (builtins.attrNames alwaysOn);
  extraPath = lib.optionalString (piAgent.extraPackages or [ ] != [ ]) ''
    export PATH="$PATH:${lib.makeBinPath piAgent.extraPackages}"
  '';
  wrapper = pkgs.writeShellScriptBin "pi" ''
    ${extraPath}
    case "''${1-}" in
      ${lib.concatStringsSep "|" subcommands}) exec ${lib.getExe' cfg.piPackage "pi"} "$@" ;;
    esac
    exec ${lib.getExe' cfg.piPackage "pi"} ${lib.escapeShellArgs extensionArgs} "$@"
  '';

  tweakModule = {
    options = {
      enable = lib.mkEnableOption "this tweak";
      alwaysOn = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = ''
          Load the tweak in every pi run, also with `--no-extensions`, through a `pi` wrapper that passes
          it with `-e`. Off: pi discovers it, and `pi config` can turn it off.
        '';
      };
      global = lib.mkOption {
        type = lib.types.nullOr json.type;
        default = null;
        example = lib.literalExpression "{ file = ./system-prompt.md; }";
        description = ''
          Turns the tweak on everywhere, also outside git repositories, with these settings (see the README
          of the tweak). null: only where a `repos` entry matches.

          A Nix path is copied to the store. The file is world-readable in the store: no secrets.
        '';
      };
      repos = lib.mkOption {
        type = lib.types.attrsOf json.type;
        default = { };
        example = lib.literalExpression ''
          {
            "my-org/*".file = ./system-prompt.md;
            "my-org/legacy".enable = false;
            "~/src/project" = { file = ./project.md; tools = false; };
          }
        '';
        description = ''
          Turns the tweak on per repository, with settings on top of `global`. The name is where it applies:

          - a remote: `owner/repo`, `host/owner/repo` or with `*` (`owner/*`). It matches when any remote of
            the repository ends with it, so it works in every clone and every worktree;
          - a path starting with `/` or `~/`: it matches that directory and everything below it. Worktrees
            elsewhere match through the location of their main checkout;
          - `*`: everywhere, like `global`.

          All matching entries apply, in alphabetical order of their names; later keys win. `enable = false`
          turns the tweak off there.
        '';
      };
    };
  };
in
{
  options.programs.pi-tweaks = {
    enable = lib.mkEnableOption "pi-tweaks, small pi extensions you turn on one by one";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "pi-tweaks.packages.\${system}.default";
      description = "The package with all tweaks, one directory per tweak.";
    };

    piPackage = lib.mkOption {
      type = lib.types.package;
      default =
        if (piAgent.enable or false) && (piAgent.package or null) != null then
          piAgent.package
        else
          pkgs.pi-coding-agent;
      defaultText = lib.literalExpression "config.programs.pi-coding-agent.package, else pkgs.pi-coding-agent";
      description = "The pi that the wrapper for always-on tweaks starts.";
    };

    agentDir = lib.mkOption {
      type = lib.types.str;
      default = ".pi/agent";
      description = "pi's agent directory relative to the home directory. Change it together with `PI_CODING_AGENT_DIR`.";
    };

    tweaks = lib.mkOption {
      type = lib.types.attrsOf (lib.types.submodule tweakModule);
      default = { };
      example = lib.literalExpression ''
        {
          system-prompt = {
            enable = true;
            alwaysOn = true;
            repos."my-org/*".file = ./system-prompt.md;
          };
        }
      '';
      description = ''
        The tweaks by name (a directory of `extensions/`). Only enabled tweaks are installed, and they do
        something only where `global` or `repos` turns them on.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = lib.mapAttrsToList (name: _: {
      assertion = builtins.elem name cfg.package.tweaks;
      message = "programs.pi-tweaks.tweaks.${name}: no such tweak; available: ${lib.concatStringsSep ", " cfg.package.tweaks}.";
    }) cfg.tweaks;

    # Above the pi of programs.pi-coding-agent, so `pi` on PATH is the wrapper.
    home.packages = lib.optional (alwaysOn != { }) (lib.hiPrio wrapper);

    home.file =
      lib.mapAttrs' (
        name: _:
        lib.nameValuePair "${cfg.agentDir}/extensions/pi-tweaks-${name}" { source = tweakDir name; }
      ) discovered
      // lib.optionalAttrs (enabled != { }) {
        "${cfg.agentDir}/pi-tweaks.json".source = json.generate "pi-tweaks.json" (
          lib.mapAttrs (
            _: tweak:
            lib.optionalAttrs (tweak.global != null) { inherit (tweak) global; } // { inherit (tweak) repos; }
          ) enabled
        );
      };
  };
}
