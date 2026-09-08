{ pkgs, mkBunDerivation, proseqlBrowser }:

mkBunDerivation {
  pname = "pyxis-player";
  version = "2.0.0";
  src = pkgs.lib.cleanSource ../.;
  bunNix = ../bun.nix;

  # The @proseql browser packages carry the worker WASM runtime that the published npm
  # builds omit, so they come from the same Nix build as the Rust engine rather than from
  # the lockfile. The player reaches the same engine through the shared worker layer that
  # clients/player/src/main.tsx spawns, so it needs this exactly as the reference client
  # does. Copied writable because the bundler resolves through them.
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
    bun run --cwd clients/player build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r clients/player/dist/* $out/

    # The service worker precaches this list atomically. cache.addAll rejects as a whole, so
    # a path that is named but not shipped leaves the worker permanently uninstalled, and an
    # uninstalled worker means every media request goes out without credentials. Failing the
    # build is far cheaper than shipping a client whose audio silently 401s.
    ${pkgs.jq}/bin/jq -r '.assets[]' $out/asset-manifest.json | while read -r asset; do
      case "$asset" in
        /) file="$out/index.html" ;;
        *) file="$out$asset" ;;
      esac
      if [ ! -f "$file" ]; then
        echo "precache asset $asset is named in asset-manifest.json but was not built" >&2
        exit 1
      fi
    done

    # A service worker only controls pages at or below its own path. Emitted anywhere but the
    # root it would control nothing, and nothing is exactly what a silent failure looks like.
    if [ ! -f "$out/service-worker.js" ]; then
      echo "service-worker.js is missing from the web root" >&2
      exit 1
    fi
    runHook postInstall
  '';
}
