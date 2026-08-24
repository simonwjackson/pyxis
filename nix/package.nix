{
  pkgs,
  core,
  client,
  tsnet,
  pluginYtmusic,
  pluginPandora,
  pluginSonos,
}:

let
  coreUnit = import ./units/pyxis.service.nix { inherit pkgs; };
  tsnetUnit = import ./units/pyxis-tsnet.service.nix { inherit pkgs; };
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "pyxis";
  version = "2.0.0";
  dontUnpack = true;
  nativeBuildInputs = [ pkgs.makeWrapper ];

  installPhase = ''
    mkdir -p $out/bin $out/share/systemd/user

    makeWrapper ${core}/bin/pyxis $out/bin/pyxis \
      --set PYXIS_WEB_ROOT ${client} \
      --set-default PYXIS_HOST 127.0.0.1 \
      --set-default PYXIS_PORT 4488 \
      --prefix PATH : ${pkgs.lib.makeBinPath [ pluginYtmusic pluginPandora pluginSonos ]}

    ln -s ${tsnet}/bin/pyxis-tsnet $out/bin/pyxis-tsnet
    ln -s ${pluginYtmusic}/bin/pyxis-plugin-ytmusic $out/bin/pyxis-plugin-ytmusic
    ln -s ${pluginYtmusic}/bin/pyxis-ytdlp-update $out/bin/pyxis-ytdlp-update
    ln -s ${pluginPandora}/bin/pyxis-plugin-pandora $out/bin/pyxis-plugin-pandora
    ln -s ${pluginSonos}/bin/pyxis-plugin-sonos $out/bin/pyxis-plugin-sonos

    cp ${coreUnit}/share/systemd/user/pyxis.service $out/share/systemd/user/
    cp ${tsnetUnit}/share/systemd/user/pyxis-tsnet.service $out/share/systemd/user/
    cp ${pluginYtmusic}/share/systemd/user/pyxis-ytdlp-update.service $out/share/systemd/user/
    cp ${pluginYtmusic}/share/systemd/user/pyxis-ytdlp-update.timer $out/share/systemd/user/
  '';

  meta = {
    description = "Pyxis core, reference client, source/output plugins, and user services";
    mainProgram = "pyxis";
  };
}
