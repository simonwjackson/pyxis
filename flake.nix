{
  description = "Pyxis - Personal unified music hub";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix.url = "github:nix-community/bun2nix";
    yt-dlp-src = {
      url = "github:yt-dlp/yt-dlp";
      flake = false;
    };
  };

  outputs = {
    self,
    nixpkgs,
    bun2nix,
    yt-dlp-src,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
    yt-dlp-overlay = final: prev: {
      yt-dlp = prev.yt-dlp.overridePythonAttrs (old: {
        src = yt-dlp-src;
        version = "latest";
        patches = [];
        postPatch = "";
      });
    };
  in {
    packages = forAllSystems (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [yt-dlp-overlay bun2nix.overlays.default];
      };
    in {
      default = pkgs.stdenv.mkDerivation {
        pname = "pyxis";
        version = "0.1.0";
        src = ./.;

        nativeBuildInputs = [
          pkgs.bun2nix.hook
          pkgs.bun
          pkgs.nodejs_22
          pkgs.makeWrapper
        ];

        bunDeps = pkgs.bun2nix.fetchBunDeps {
          bunNix = ./bun.nix;
        };

        buildPhase = ''
          runHook preBuild
          bun x vite build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p $out/lib/pyxis $out/bin
          cp -r dist-web $out/lib/pyxis/
          cp -r server $out/lib/pyxis/
          cp -r src $out/lib/pyxis/
          cp -r node_modules $out/lib/pyxis/
          cp package.json $out/lib/pyxis/
          makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis \
            --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.yt-dlp pkgs.ffmpeg]} \
            --add-flags "$out/lib/pyxis/server/index.ts"
          runHook postInstall
        '';

        meta = {
          description = "Personal unified music hub";
          mainProgram = "pyxis";
        };
      };
    });

    devShells = forAllSystems (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [yt-dlp-overlay];
      };
    in {
      default = pkgs.mkShell {
        packages = [
          pkgs.bun
          pkgs.ffmpeg
          pkgs.just
          pkgs.mpv
          pkgs.yt-dlp
          bun2nix.packages.${system}.default
        ];
      };
    });

    homeManagerModules.default = ./nix/modules/home-manager.nix;
    nixosModules.default = ./nix/modules/nixos.nix;
  };
}
