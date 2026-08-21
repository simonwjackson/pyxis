{ pkgs, mkBunDerivation }:

mkBunDerivation {
  pname = "pyxis-reference-client";
  version = "1.0.0";
  src = pkgs.lib.cleanSource ../.;
  bunNix = ../bun.nix;

  buildPhase = ''
    runHook preBuild
    bun run --cwd clients/app build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r clients/app/dist/* $out/
    runHook postInstall
  '';
}
