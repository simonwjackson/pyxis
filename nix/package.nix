{
  pkgs,
  core,
  tsnet,
  pluginYtmusic,
  pluginPandora,
  pluginSonos,
  pluginSoulseek,
}:

pkgs.stdenvNoCC.mkDerivation {
  pname = "pyxis";
  version = "2.0.0";
  dontUnpack = true;
  nativeBuildInputs = [ pkgs.makeWrapper ];

  installPhase = ''
    mkdir -p $out/bin

    makeWrapper ${core}/bin/pyxis $out/bin/pyxis \
      --set-default PYXIS_HOST 127.0.0.1 \
      --set-default PYXIS_PORT 4488 \
      --prefix PATH : ${pkgs.lib.makeBinPath [ pluginYtmusic pluginPandora pluginSonos pluginSoulseek pkgs.ffmpeg-headless ]}

    ln -s ${tsnet}/bin/pyxis-tsnet $out/bin/pyxis-tsnet
    ln -s ${pluginYtmusic}/bin/pyxis-plugin-ytmusic $out/bin/pyxis-plugin-ytmusic
    ln -s ${pluginYtmusic}/bin/pyxis-ytdlp-update $out/bin/pyxis-ytdlp-update
    ln -s ${pluginPandora}/bin/pyxis-plugin-pandora $out/bin/pyxis-plugin-pandora
    ln -s ${pluginSonos}/bin/pyxis-plugin-sonos $out/bin/pyxis-plugin-sonos
    ln -s ${pluginSoulseek}/bin/pyxis-plugin-soulseek $out/bin/pyxis-plugin-soulseek
  '';

  meta = {
    description = "Pyxis core and source/output plugins";
    mainProgram = "pyxis";
  };
}
