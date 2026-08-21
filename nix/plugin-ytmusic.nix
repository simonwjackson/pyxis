{ pkgs }:

let
  # YouTube rotates client challenges faster than a flake pin can follow. The mutable
  # nightly wins when present; the nixpkgs yt-dlp in the plugin wrapper remains the floor,
  # so a failed update never makes the plugin worse than it was before.
  updater = pkgs.writeShellApplication {
    name = "pyxis-ytdlp-update";
    runtimeInputs = [ pkgs.coreutils pkgs.curl pkgs.python3 ];
    text = ''
      dir="''${PYXIS_YT_DLP_DATA_DIR:-''${XDG_DATA_HOME:-$HOME/.local/share}/pyxis/yt-dlp}"
      url="''${PYXIS_YT_DLP_UPDATE_URL:-https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp}"
      mkdir -p "$dir"
      temporary="$dir/.yt-dlp.download.$$"
      trap 'rm -f "$temporary"' EXIT
      curl -fsSL --max-time 600 -o "$temporary" "$url"
      chmod +x "$temporary"
      version=$(python3 "$temporary" --version)
      mv -f "$temporary" "$dir/yt-dlp"
      echo "yt-dlp nightly $version installed at $dir/yt-dlp"
    '';
  };
  units = import ./units/pyxis-ytdlp-update.timer.nix { inherit pkgs; };
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "pyxis-plugin-ytmusic";
  version = "1.0.0";
  dontUnpack = true;
  nativeBuildInputs = [ pkgs.makeWrapper ];

  installPhase = ''
    root=$out/lib/pyxis
    mkdir -p $out/bin $out/share/systemd $root/plugins/ytmusic $root/packages/plugin-sdk $root/contracts $root/node_modules/@pyxis

    cp ${../plugins/ytmusic/package.json} $root/plugins/ytmusic/package.json
    cp -r ${../plugins/ytmusic/src} $root/plugins/ytmusic/src
    cp ${../packages/plugin-sdk/package.json} $root/packages/plugin-sdk/package.json
    cp -r ${../packages/plugin-sdk/src} $root/packages/plugin-sdk/src
    # Source paths from the Nix store are read-only. The output tree must be writable
    # before pruning test-only modules from the runtime package.
    chmod -R u+w $root/plugins/ytmusic $root/packages/plugin-sdk
    rm -f $root/plugins/ytmusic/src/*.test.ts
    rm -f $root/packages/plugin-sdk/src/*.test.ts
    cp -r ${../contracts/generated} $root/contracts/generated
    ln -s $root/packages/plugin-sdk $root/node_modules/@pyxis/plugin-sdk

    makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis-plugin-ytmusic \
      --add-flags $root/plugins/ytmusic/src/index.ts \
      --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.yt-dlp pkgs.ffmpeg-headless pkgs.python3 ]}
    ln -s ${updater}/bin/pyxis-ytdlp-update $out/bin/pyxis-ytdlp-update
    cp -r ${units}/share/systemd/user $out/share/systemd/
  '';

  meta = {
    description = "YouTube Music source plugin for Pyxis";
    mainProgram = "pyxis-plugin-ytmusic";
  };
}
