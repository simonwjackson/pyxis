{
  description = "Pyxis - Personal unified music hub";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    yt-dlp-src = {
      url = "github:yt-dlp/yt-dlp";
      flake = false;
    };
  };

  outputs = {
    self,
    nixpkgs,
    yt-dlp-src,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
    defaultNpmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    hashesFile = ./nix/hashes.json;
    hashesData =
      if builtins.pathExists hashesFile
      then builtins.fromJSON (builtins.readFile hashesFile)
      else {};
    npmDepsHash = hashesData.npmDeps or defaultNpmDepsHash;
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
        overlays = [yt-dlp-overlay];
      };
    in {
      default = pkgs.buildNpmPackage {
        pname = "pyxis";
        version = "0.1.0";
        src = ./.;

        inherit npmDepsHash;
        makeCacheWritable = true;

        nativeBuildInputs = [pkgs.makeWrapper];

        buildPhase = ''
          runHook preBuild
          npm run build:web
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
        packages = with pkgs; [
          bun
          ffmpeg
          mpv
          yt-dlp
        ];
      };
    });

    homeManagerModules.default = ./nix/modules/home-manager.nix;
  };
}
