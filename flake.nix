{
  description = "Pyxis — an account-scoped music service with plugin sources and offline clients";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    # Pinned to an explicit rev because the local proseql checkout carries uncommitted
    # work, and Nix refuses to lock a dirty local input. The rev matches the one ossicle
    # pins, so both projects build against the same engine. Bump with `just proseql-pin`.
    proseql = {
      url = "git+file:///home/simonwjackson/code/github/simonwjackson/proseql?rev=0f9c9cc46fe2a1219dc4efccaa75092518dd7724";
      flake = false;
    };
  };

  outputs =
    { nixpkgs
    , flake-utils
    , proseql
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        pluginYtmusic = import ./nix/plugin-ytmusic.nix { inherit pkgs; };
      in
      {
        packages = {
          plugin-ytmusic = pluginYtmusic;
        };
        checks = {
          plugin-ytmusic = pluginYtmusic;
        };
        devShells.default = import ./nix/devshell.nix { inherit pkgs proseql; };
      }
    );
}
