{ pkgs, mkBunDerivation }:

mkBunDerivation {
  pname = "pyxis-mcp";
  version = "2.0.0";
  src = pkgs.lib.cleanSource ../.;
  bunNix = ../bun.nix;
  nativeBuildInputs = [ pkgs.makeWrapper ];

  buildPhase = ''
    runHook preBuild
    bun build clients/mcp/src/main.ts --target=bun --outfile=dist/pyxis-mcp.js
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm644 dist/pyxis-mcp.js $out/lib/pyxis-mcp.js
    makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis-mcp --add-flags $out/lib/pyxis-mcp.js
    runHook postInstall
  '';

  meta.mainProgram = "pyxis-mcp";
}
