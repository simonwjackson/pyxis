{ pkgs, mkBunDerivation }:

mkBunDerivation {
  pname = "pyxis-plugin-soulseek";
  version = "1.0.0";
  src = pkgs.lib.cleanSource ../.;
  bunNix = ../bun.nix;
  nativeBuildInputs = [ pkgs.makeWrapper pkgs.patch ];

  buildPhase = ''
    runHook preBuild
    patch -d node_modules/soulseek-ts -p1 < ${../patches/soulseek-ts@2.1.4.patch}
    grep -q 'sharedFoldersFiles", { dirs: 0, files: 0 }' node_modules/soulseek-ts/dist/index.mjs
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    root=$out/lib/pyxis
    mkdir -p $out/bin $root/plugins/soulseek/node_modules/@pyxis $root/packages $root/contracts

    cp ${../plugins/soulseek/package.json} $root/plugins/soulseek/package.json
    cp -r ${../plugins/soulseek/src} $root/plugins/soulseek/src
    cp -r ${../packages/plugin-sdk} $root/packages/plugin-sdk
    chmod -R u+w $root/plugins/soulseek $root/packages/plugin-sdk
    rm -f $root/plugins/soulseek/src/*.test.ts
    rm -rf $root/packages/plugin-sdk/test
    rm -f $root/packages/plugin-sdk/src/*.test.ts
    cp -r ${../contracts/generated} $root/contracts/generated

    ln -s $root/packages/plugin-sdk $root/plugins/soulseek/node_modules/@pyxis/plugin-sdk
    cp -LR node_modules/soulseek-ts $root/plugins/soulseek/node_modules/soulseek-ts
    cp -LR node_modules/typed-emitter $root/plugins/soulseek/node_modules/typed-emitter

    makeWrapper ${pkgs.bun}/bin/bun $out/bin/pyxis-plugin-soulseek \
      --add-flags $root/plugins/soulseek/src/index.ts
    runHook postInstall
  '';

  meta = {
    description = "Download-only Soulseek fidelity provider for Pyxis";
    mainProgram = "pyxis-plugin-soulseek";
  };
}
