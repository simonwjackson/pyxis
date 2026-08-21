{ pkgs, mkBunDerivation }:

mkBunDerivation {
  pname = "pyxis-plugin-pandora";
  version = "1.0.0";
  src = pkgs.lib.cleanSource ../.;
  bunNix = ../bun.nix;
  nativeBuildInputs = [ pkgs.makeWrapper ];

  buildPhase = ''
    runHook preBuild
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    root=$out/lib/pyxis
    mkdir -p $out/bin $root/plugins/pandora/node_modules/@pyxis $root/packages $root/contracts

    cp ${../plugins/pandora/package.json} $root/plugins/pandora/package.json
    cp -r ${../plugins/pandora/src} $root/plugins/pandora/src
    cp -r ${../packages/plugin-sdk} $root/packages/plugin-sdk
    chmod -R u+w $root/plugins/pandora $root/packages/plugin-sdk
    rm -f $root/plugins/pandora/src/*.test.ts
    rm -rf $root/packages/plugin-sdk/test
    rm -f $root/packages/plugin-sdk/src/*.test.ts
    cp -r ${../contracts/generated} $root/contracts/generated

    ln -s $root/packages/plugin-sdk $root/plugins/pandora/node_modules/@pyxis/plugin-sdk
    cp -LR node_modules/egoroof-blowfish \
      $root/plugins/pandora/node_modules/egoroof-blowfish

    makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis-plugin-pandora \
      --add-flags $root/plugins/pandora/src/index.ts
    runHook postInstall
  '';

  meta = {
    description = "Pandora radio source plugin for Pyxis";
    mainProgram = "pyxis-plugin-pandora";
  };
}
