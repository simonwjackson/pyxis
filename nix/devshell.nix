{ pkgs, proseql, proseqlBrowser, bun2nixPkgs }:

pkgs.mkShell {
  buildInputs = [
    pkgs.cargo
    pkgs.rustc
    pkgs.clippy
    pkgs.rustfmt
    pkgs.rust-analyzer
    pkgs.bun
    bun2nixPkgs.default
    pkgs.biome
    pkgs.yt-dlp
    pkgs.ffmpeg-headless
    pkgs.typeshare
    pkgs.just
    pkgs.jq
    pkgs.curl
    pkgs.shellcheck
    # Used by generate-contracts.sh to normalise typeshare output and diff artifacts.
    pkgs.perl
    pkgs.diffutils
  ];

  # Cargo path dependencies cannot reach into the Nix store by absolute path without
  # pinning the store hash into a committed file. Symlinking keeps Cargo.toml stable
  # while the flake input decides which proseql revision is used.
  # Consumed by tools/link-proseql, which runs after `bun install` rather than once at
  # shell entry, because bun removes anything it does not manage from node_modules.
  PYXIS_PROSEQL_BROWSER = proseqlBrowser;

  shellHook = ''
    mkdir -p .cache
    ln -sfn ${proseql} .cache/proseql
    tools/link-proseql || echo "link-proseql failed; run it manually before building the client" >&2
  '';
}
