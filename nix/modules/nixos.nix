{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.pyxis;
  shared = import ../lib/shared.nix { inherit lib pkgs; };
  configYaml = shared.mkConfigYaml cfg;
  wrappedPyxis = shared.mkWrapper {
    inherit cfg;
    configPath = "/etc/pyxis/config.yaml";
  };
in
{
  options.services.pyxis = shared.mkPyxisOptions // {
    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open firewall port for the Pyxis server";
    };
  };

  config = lib.mkIf cfg.enable {
    environment.etc."pyxis/config.yaml".source = configYaml;

    networking.firewall.allowedTCPPorts =
      lib.mkIf cfg.openFirewall [ cfg.server.port ];

    systemd.services.pyxis = {
      description = "Pyxis music streaming server";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        ExecStart = "${wrappedPyxis}/bin/pyxis";
        Restart = "on-failure";
        RestartSec = "5s";

        DynamicUser = true;
        StateDirectory = "pyxis";
        CacheDirectory = "pyxis";
        LogsDirectory = "pyxis";

        Environment = [
          "XDG_DATA_HOME=/var/lib/pyxis"
          "XDG_CACHE_HOME=/var/cache/pyxis"
          "XDG_STATE_HOME=/var/log/pyxis"
          "HOME=/var/lib/pyxis"
        ];

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        RestrictNamespaces = true;
        LockPersonality = true;
        MemoryDenyWriteExecute = false; # Bun JIT needs W+X memory
        RestrictRealtime = true;
      };
    };
  };
}
