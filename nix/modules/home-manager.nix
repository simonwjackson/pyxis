{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.pyxis;
  shared = import ../lib/shared.nix { inherit lib pkgs; };
  configYaml = shared.mkConfigYaml cfg;
  configPath = config.xdg.configHome + "/pyxis/config.yaml";
  wrappedPyxis = shared.mkWrapper { inherit cfg configPath; };
in
{
  options.programs.pyxis = shared.mkPyxisOptions;

  config = lib.mkIf cfg.enable {
    home.packages = [ wrappedPyxis ];

    xdg.configFile."pyxis/config.yaml".source = configYaml;

    systemd.user.services.pyxis = {
      Unit = {
        Description = "Pyxis music streaming server";
        After = [ "network-online.target" ];
      };
      Service = {
        ExecStart = "${wrappedPyxis}/bin/pyxis";
        Restart = "on-failure";
        RestartSec = "5s";
      };
      Install = {
        WantedBy = [ "default.target" ];
      };
    };
  };
}
