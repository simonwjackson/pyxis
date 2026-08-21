{ pkgs, proseql }:

pkgs.mkShell {
  buildInputs = [
    pkgs.cargo
    pkgs.rustc
    pkgs.clippy
    pkgs.rustfmt
    pkgs.rust-analyzer
    pkgs.bun
    pkgs.typeshare
    pkgs.just
    pkgs.jq
  ];

  # Cargo path dependencies cannot reach into the Nix store by absolute path without
  # pinning the store hash into a committed file. Symlinking keeps Cargo.toml stable
  # while the flake input decides which proseql revision is used.
  shellHook = ''
    mkdir -p .cache
    ln -sfn ${proseql} .cache/proseql
  '';
}
