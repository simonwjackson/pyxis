{ pkgs, mkBunDerivation, proseqlBrowser }:

mkBunDerivation {
  pname = "pyxis-reference-client";
  version = "1.0.0";
  src = pkgs.lib.cleanSource ../.;
  bunNix = ../bun.nix;

  # The @proseql browser packages carry the worker WASM runtime that the published npm
  # builds omit, so they come from the same Nix build as the Rust engine rather than from
  # the lockfile. Copied writable because the bundler resolves through them.
  preBuild = ''
    for entry in ${proseqlBrowser}/closure/node_modules/*; do
      name="$(basename "$entry")"
      # Replace rather than copy into. Bun installs some of the same transitive packages,
      # and copying into an existing directory would nest one inside the other and leave
      # the build resolving a different copy than the dev shell does.
      rm -rf "node_modules/$name"
      cp -r "$entry" "node_modules/$name"
    done
    chmod -R u+w node_modules
  '';

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
