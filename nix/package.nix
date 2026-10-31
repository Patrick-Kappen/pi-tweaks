# All tweaks of extensions/, one directory each ($out/<name>), without their tests.
{
  lib,
  stdenvNoCC,
  version,
}:
let
  src = ../extensions;
in
stdenvNoCC.mkDerivation {
  pname = "pi-tweaks";
  inherit version;

  src = lib.fileset.toSource {
    root = src;
    fileset = lib.fileset.difference src (
      lib.fileset.fileFilter (file: lib.hasSuffix ".test.ts" file.name) src
    );
  };

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r . $out/
    runHook postInstall
  '';

  passthru.tweaks = builtins.attrNames (
    lib.filterAttrs (_: type: type == "directory") (builtins.readDir src)
  );

  meta = {
    description = "pi extensions for the little changes that do not fit anywhere else";
    homepage = "https://github.com/Patrick-Kappen/pi-tweaks";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
