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
            --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.yt-dlp pkgs.ffmpeg-headless]} \
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
        config = {
          android_sdk.accept_license = true;
          allowUnfree = true;
        };
      };
      androidShell =
        if pkgs.stdenv.isLinux
        then let
          androidComposition = pkgs.androidenv.composeAndroidPackages {
            buildToolsVersions = ["34.0.0"];
            platformVersions = ["31" "34"];
            abiVersions = ["arm64-v8a" "x86_64"];
            includeEmulator = false;
            includeSystemImages = false;
            includeNDK = false;
          };
          androidSdk = androidComposition.androidsdk;
        in
          pkgs.mkShell {
            packages = [
              androidSdk
              pkgs.jdk17
              pkgs.gradle
            ];

            ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
            ANDROID_SDK_ROOT = "${androidSdk}/libexec/android-sdk";
            JAVA_HOME = "${pkgs.jdk17}";
            GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdk}/libexec/android-sdk/build-tools/34.0.0/aapt2";

            shellHook = ''
              export PATH="${androidSdk}/libexec/android-sdk/platform-tools:$PATH"
              echo "Android development environment ready for Pyxis kiosk"
            '';
          }
        else
          pkgs.mkShell {
            packages = [pkgs.jdk17 pkgs.gradle];
            shellHook = ''
              echo "Android connected-device builds are supported from the Linux dev shell."
            '';
          };
    in {
      default = pkgs.mkShell {
        packages = [
          pkgs.bun
          pkgs.ffmpeg-headless
          pkgs.just
          pkgs.mpv
          pkgs.yt-dlp
          bun2nix.packages.${system}.default
        ];
      };

      android = androidShell;
    });

    homeManagerModules.default = ./nix/modules/home-manager.nix;
    nixosModules.default = ./nix/modules/nixos.nix;
  };
}
