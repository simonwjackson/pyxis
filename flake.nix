{
  description = "Pyxis — an account-scoped music service with plugin sources and offline clients";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix?ref=refs/tags/1.5.2";
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
    , bun2nix
    , proseql
    , ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        mkBunDerivation = bun2nix.lib.${system}.mkBunDerivation;
        client = import ./nix/client.nix { inherit pkgs mkBunDerivation; };
        core = import ./nix/core.nix { inherit pkgs proseql; };
        plugins = import ./nix/plugins.nix { inherit pkgs mkBunDerivation; };
        tsnet = import ./nix/pyxis-tsnet.nix { inherit pkgs; };
        pyxis = import ./nix/package.nix {
          inherit pkgs core client tsnet;
          pluginYtmusic = plugins.ytmusic;
          pluginPandora = plugins.pandora;
        };
      in
      {
        packages = {
          inherit core client pyxis;
          plugin-ytmusic = plugins.ytmusic;
          plugin-pandora = plugins.pandora;
          pyxis-tsnet = tsnet;
          default = pyxis;
        };
        checks = {
          inherit core client pyxis;
          plugin-ytmusic = plugins.ytmusic;
          plugin-pandora = plugins.pandora;
          pyxis-tsnet = tsnet;
        };
        devShells.default = import ./nix/devshell.nix {
          inherit pkgs proseql;
          bun2nixPkgs = bun2nix.packages.${system};
        };
      }
    );
}
