{ pkgs }:

pkgs.stdenvNoCC.mkDerivation {
  pname = "pyxis-plugin-sonos";
  version = "1.0.0";
  dontUnpack = true;
  nativeBuildInputs = [ pkgs.makeWrapper ];

  installPhase = ''
    root=$out/lib/pyxis
    mkdir -p $out/bin $root/plugins/sonos $root/packages/plugin-sdk $root/contracts $root/node_modules/@pyxis

    cp ${../plugins/sonos/package.json} $root/plugins/sonos/package.json
    cp -r ${../plugins/sonos/src} $root/plugins/sonos/src
    cp ${../packages/plugin-sdk/package.json} $root/packages/plugin-sdk/package.json
    cp -r ${../packages/plugin-sdk/src} $root/packages/plugin-sdk/src
    chmod -R u+w $root/plugins/sonos $root/packages/plugin-sdk
    rm -f $root/plugins/sonos/src/*.test.ts
    rm -f $root/packages/plugin-sdk/src/*.test.ts
    cp -r ${../contracts/generated} $root/contracts/generated
    ln -s $root/packages/plugin-sdk $root/node_modules/@pyxis/plugin-sdk

    makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis-plugin-sonos \
      --add-flags $root/plugins/sonos/src/index.ts
  '';

  meta = {
    description = "Sonos output plugin for Pyxis";
    mainProgram = "pyxis-plugin-sonos";
  };
}
