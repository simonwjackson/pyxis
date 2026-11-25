{
  description = "Pyxis — an account-scoped music service with plugin sources and offline clients";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    bun2nix.url = "github:nix-community/bun2nix?ref=refs/tags/1.5.2";
    # Pinned to an explicit GitHub rev so any builder (aka, CI) can fetch it; a local
    # git+file input only resolves on the workstation. Bump with `just proseql-pin`,
    # which pins the current origin/main.
    #
    # Consumed twice: as source for the Rust crates, and as a flake for the browser bundle,
    # which carries the worker WASM runtime the published npm packages leave out.
    proseql = {
      url = "github:simonwjackson/proseql/4a7893f3701d2bbe96e7a6483462304876e065c6";
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
        proseqlBrowser = proseql.packages.${system}.browser;
        core = import ./nix/core.nix {
          inherit pkgs proseql;
        };
        mcp = import ./nix/mcp.nix { inherit pkgs mkBunDerivation; };
        plugins = import ./nix/plugins.nix { inherit pkgs mkBunDerivation; };
        tsnet = import ./nix/pyxis-tsnet.nix { inherit pkgs; };
        mcpApp = import ./nix/mcp-app.nix { inherit pkgs mcp tsnet; };
        pyxis = import ./nix/package.nix {
          inherit pkgs core tsnet;
          pluginYtmusic = plugins.ytmusic;
          pluginPandora = plugins.pandora;
          pluginSonos = plugins.sonos;
          pluginSoulseek = plugins.soulseek;
        };
      in
      {
        packages = {
          inherit core pyxis;
          pyxis-mcp = mcp;
          pyxis-mcp-app = mcpApp;
          plugin-ytmusic = plugins.ytmusic;
          plugin-pandora = plugins.pandora;
          plugin-sonos = plugins.sonos;
          plugin-soulseek = plugins.soulseek;
          pyxis-tsnet = tsnet;
          default = pyxis;
        };
        checks = {
          inherit core pyxis;
          pyxis-mcp = mcp;
          plugin-ytmusic = plugins.ytmusic;
          plugin-pandora = plugins.pandora;
          plugin-sonos = plugins.sonos;
          plugin-soulseek = plugins.soulseek;
          pyxis-tsnet = tsnet;
        };
        devShells.default = import ./nix/devshell.nix {
          inherit pkgs proseql proseqlBrowser;
          bun2nixPkgs = bun2nix.packages.${system};
        };
      }
    );
}
