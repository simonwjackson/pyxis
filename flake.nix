{
  description = "Pyxis - Pandora music service CLI client";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    beads = {
      url = "github:steveyegge/beads";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    beads,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.buildNpmPackage {
        pname = "pyxis";
        version = "0.1.0";
        src = ./.;

        npmDepsHash = "sha256-cdOKoKfGQarop5HHAQyyYLI1iZ2dk/H3M3TiAFVoUlc=";
        makeCacheWritable = true;

        nativeBuildInputs = [pkgs.makeWrapper];

        buildPhase = ''
          runHook preBuild
          npm run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p $out/lib/pyxis $out/bin
          cp -r dist $out/lib/pyxis/
          cp -r node_modules $out/lib/pyxis/
          cp package.json $out/lib/pyxis/
          makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis \
            --add-flags "$out/lib/pyxis/dist/cli/bin.js"
          runHook postInstall
        '';

        meta = {
          description = "Unofficial Pandora music service CLI client";
          mainProgram = "pyxis";
        };
      };
    });

    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          mpv
          beads.packages.${system}.default
        ];
      };
    });
  };
}
