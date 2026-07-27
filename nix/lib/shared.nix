{ lib, pkgs }:
{
  # Option definitions shared between Home Manager and NixOS modules
  mkPyxisOptions = {
    enable = lib.mkEnableOption "Pyxis music streaming server";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The pyxis package to use";
    };

    server = {
      port = lib.mkOption {
        type = lib.types.port;
        default = 8765;
        description = "Backend server port";
      };

      hostname = lib.mkOption {
        type = lib.types.str;
        default = "localhost";
        description = "Server hostname for CORS and proxy target";
        example = "aka";
      };

    };

    web = {
      port = lib.mkOption {
        type = lib.types.port;
        default = 5678;
        description = "Vite dev server port";
      };

      allowedHosts = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Additional allowed hosts for Vite dev server";
        example = [ "pyxis.hummingbird-lake.ts.net" ];
      };
    };

    sources = {
      pandora = {
        username = lib.mkOption {
          type = lib.types.nullOr lib.types.str;
          default = null;
          description = "Pandora account email";
          example = "user@example.com";
        };

        passwordFile = lib.mkOption {
          type = lib.types.nullOr lib.types.path;
          default = null;
          description = ''
            Path to a file containing the Pandora password.
            Read at runtime — works with agenix, sops-nix, etc.
            Sets the PYXIS_PANDORA_PASSWORD environment variable.
          '';
          example = "/run/secrets/pandora-password";
        };
      };

      discogs = {
        tokenFile = lib.mkOption {
          type = lib.types.nullOr lib.types.path;
          default = null;
          description = ''
            Path to a file containing the Discogs API token.
            Read at runtime — works with agenix, sops-nix, etc.
            Sets the PYXIS_DISCOGS_TOKEN environment variable.
          '';
          example = "/run/secrets/discogs-token";
        };
      };
    };

    sonos = {
      enabled = lib.mkEnableOption "Sonos playback output";

      lanStreamBaseUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "LAN HTTP base URL Sonos speakers use to fetch Pyxis streams";
        example = "http://192.168.1.243:8765";
      };

      seedHosts = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Known Sonos hosts used when SSDP discovery is unavailable";
        example = [ "192.168.1.118" ];
      };

      discoveryIntervalSeconds = lib.mkOption {
        type = lib.types.ints.positive;
        default = 30;
        description = "Seconds to cache Sonos topology discovery";
      };

      pollIntervalMs = lib.mkOption {
        type = lib.types.ints.positive;
        default = 1000;
        description = "Sonos transport polling interval in milliseconds";
      };

      requestTimeoutMs = lib.mkOption {
        type = lib.types.ints.positive;
        default = 3000;
        description = "Timeout for Sonos HTTP and SOAP requests";
      };
    };

    log = {
      level = lib.mkOption {
        type = lib.types.enum [ "trace" "debug" "info" "warn" "error" "fatal" ];
        default = "info";
        description = "Log level";
      };
    };
  };

  # Generate config.yaml derivation from resolved options
  mkConfigYaml = cfg:
    pkgs.writeText "pyxis-config.yaml" (
      lib.generators.toYAML { } (
        lib.filterAttrsRecursive (_: v: v != null) {
          server = {
            port = cfg.server.port;
            hostname = cfg.server.hostname;
          };

          web = {
            port = cfg.web.port;
          } // lib.optionalAttrs (cfg.web.allowedHosts != []) {
            allowedHosts = cfg.web.allowedHosts;
          };

          sources = lib.optionalAttrs (cfg.sources.pandora.username != null) {
            pandora = {
              username = cfg.sources.pandora.username;
            };
          };

          sonos = {
            enabled = cfg.sonos.enabled;
            lanStreamBaseUrl = cfg.sonos.lanStreamBaseUrl;
            seedHosts = cfg.sonos.seedHosts;
            discoveryIntervalSeconds = cfg.sonos.discoveryIntervalSeconds;
            pollIntervalMs = cfg.sonos.pollIntervalMs;
            requestTimeoutMs = cfg.sonos.requestTimeoutMs;
          };

          log = {
            level = cfg.log.level;
          };
        }
      )
    );

  # Generate wrapper script that reads secrets at runtime and execs pyxis
  mkWrapper = { cfg, configPath }:
    pkgs.writeShellScriptBin "pyxis" ''
      set -euo pipefail

      ${lib.optionalString (cfg.sources.pandora.passwordFile != null) ''
        if [[ -f "${cfg.sources.pandora.passwordFile}" ]]; then
          export PYXIS_PANDORA_PASSWORD="$(cat "${cfg.sources.pandora.passwordFile}")"
        else
          echo "Warning: Pandora password file not found: ${cfg.sources.pandora.passwordFile}" >&2
        fi
      ''}

      ${lib.optionalString (cfg.sources.discogs.tokenFile != null) ''
        if [[ -f "${cfg.sources.discogs.tokenFile}" ]]; then
          export PYXIS_DISCOGS_TOKEN="$(cat "${cfg.sources.discogs.tokenFile}")"
        else
          echo "Warning: Discogs token file not found: ${cfg.sources.discogs.tokenFile}" >&2
        fi
      ''}

      exec ${cfg.package}/bin/pyxis --config ${configPath} "$@"
    '';
}
