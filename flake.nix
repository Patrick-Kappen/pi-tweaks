{
  description = "pi extensions for the little changes that do not fit anywhere else";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # Only for the checks; consumers set `inputs.home-manager.follows`.
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
    }:
    let
      inherit (nixpkgs) lib;
      inherit (builtins.fromJSON (builtins.readFile ./package.json)) version;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: rec {
        pi-tweaks = pkgs.callPackage ./nix/package.nix { inherit version; };
        default = pi-tweaks;
      });

      homeModules = rec {
        pi-tweaks = import ./nix/home-manager.nix { inherit self; };
        default = pi-tweaks;
      };

      # treefmt, so `nix fmt -- --fail-on-change FILES` works (the owner's global pre-commit hook uses it).
      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);

      checks = forAllSystems (
        pkgs:
        {
          formatting = pkgs.runCommand "formatting" { nativeBuildInputs = [ pkgs.nixfmt ]; } ''
            cd ${self}
            nixfmt --check $(find . -name '*.nix' -not -path './.devenv/*')
            touch $out
          '';
        }
        // import ./nix/checks.nix { inherit self pkgs home-manager; }
      );
    };
}
