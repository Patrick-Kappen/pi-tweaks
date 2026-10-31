{
  self,
  pkgs,
  home-manager,
}:
let
  package = self.packages.${pkgs.stdenv.hostPlatform.system}.default;

  configuration =
    tweaks:
    home-manager.lib.homeManagerConfiguration {
      inherit pkgs;
      modules = [
        self.homeModules.default
        {
          home = {
            username = "check";
            homeDirectory = "/home/check";
            stateVersion = "25.11";
          };
          programs.pi-tweaks = {
            enable = true;
            inherit tweaks;
          };
        }
      ];
    };
  home = tweaks: (configuration tweaks).config;

  prompt = pkgs.writeText "system-prompt.md" "You are the pi-tweaks check agent.\n";
  alwaysOn = home {
    system-prompt = {
      enable = true;
      alwaysOn = true;
      settings.file = prompt;
    };
  };
  discovered = home {
    system-prompt = {
      enable = true;
      settings.text = "Discovered.";
    };
  };
in
{
  inherit package;

  # The package has every tweak, without tests.
  package-contents = pkgs.runCommand "package-contents" { } ''
    test -f ${package}/system-prompt/index.ts
    test -f ${package}/system-prompt/README.md
    test ! -e ${package}/system-prompt/index.test.ts
    touch $out
  '';

  # Always on: the `pi` wrapper starts the real pi with -e <tweak>; with -ne and -p the prompt is replaced.
  home-manager-always-on =
    pkgs.runCommand "home-manager-always-on"
      {
        nativeBuildInputs = [ pkgs.jq ];
        homeFiles = alwaysOn.home-files;
        homePath = alwaysOn.home.path;
        provider = ../test/fixtures/fake-provider.ts;
      }
      ''
        agent=$homeFiles/.pi/agent
        test ! -e "$agent/extensions/pi-tweaks-system-prompt"
        jq -e --arg file "${prompt}" '. == {"system-prompt": {file: $file}}' "$agent/pi-tweaks.json"
        grep -q -- "-e ${package}/system-prompt" "$homePath/bin/pi"

        export HOME=$TMPDIR/home PI_OFFLINE=1
        mkdir -p "$HOME/.pi/agent" project
        cp "$agent/pi-tweaks.json" "$HOME/.pi/agent/"
        cp "$provider" provider.ts
        cd project
        CAPTURE_FILE=$TMPDIR/prompt.txt "$homePath/bin/pi" -ne -e ../provider.ts --provider faux --model echo -p hi
        head -n 1 "$TMPDIR/prompt.txt" | grep -qx "You are the pi-tweaks check agent."
        grep -q "^<tools>$" "$TMPDIR/prompt.txt"
        ! grep -q "expert coding assistant" "$TMPDIR/prompt.txt"
        # Subcommands get no -e.
        "$homePath/bin/pi" list
        touch $out
      '';

  # Not always on: pi discovers the tweak in the agent directory; no wrapper.
  home-manager-discovered =
    pkgs.runCommand "home-manager-discovered"
      {
        nativeBuildInputs = [ pkgs.jq ];
        homeFiles = discovered.home-files;
        homePath = discovered.home.path;
      }
      ''
        agent=$homeFiles/.pi/agent
        test -f "$agent/extensions/pi-tweaks-system-prompt/index.ts"
        test ! -e "$agent/extensions/pi-tweaks-system-prompt/index.test.ts"
        jq -e '. == {"system-prompt": {text: "Discovered."}}' "$agent/pi-tweaks.json"
        test ! -e "$homePath/bin/pi"
        touch $out
      '';

  # An unknown tweak fails the evaluation (with the assertion "no such tweak").
  home-manager-assertion =
    let
      bad = configuration { no-such-tweak.enable = true; };
    in
    assert !(builtins.tryEval bad.activationPackage.drvPath).success;
    pkgs.emptyFile;
}
