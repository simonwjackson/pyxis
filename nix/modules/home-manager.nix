{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.pyxis;

  # Generate YAML config (without password - that's handled via wrapper)
  configYaml = pkgs.writeText "pyxis-config.yaml" (
    lib.generators.toYAML { } (
      lib.filterAttrsRecursive (_: v: v != null) {
        auth = lib.optionalAttrs (cfg.username != null) {
          username = cfg.username;
        };

        output = {
          format = cfg.output.format;
          verbose = cfg.output.verbose;
          color = cfg.output.color;
        };

        cache = {
          enabled = cfg.cache.enable;
          ttl = cfg.cache.ttl;
        } // lib.optionalAttrs (cfg.cache.path != null) {
          path = cfg.cache.path;
        };

        playlist = {
          quality = cfg.playlist.quality;
        } // lib.optionalAttrs (cfg.playlist.additionalUrl != null) {
          additionalUrl = cfg.playlist.additionalUrl;
        };

        stations = {
          sort = cfg.stations.sort;
        } // lib.optionalAttrs (cfg.stations.limit != null) {
          limit = cfg.stations.limit;
        };
      }
    )
  );

  # Wrapper script that reads password from file and sets env var
  wrappedPyxis = pkgs.writeShellScriptBin "pyxis" ''
    set -euo pipefail

    ${lib.optionalString (cfg.passwordFile != null) ''
      if [[ -f "${cfg.passwordFile}" ]]; then
        export PANDORA_PASSWORD="$(cat "${cfg.passwordFile}")"
      else
        echo "Error: Password file not found: ${cfg.passwordFile}" >&2
        exit 1
      fi
    ''}

    exec ${cfg.package}/bin/pyxis "$@"
  '';
in
{
  options.programs.pyxis = {
    enable = lib.mkEnableOption "Pyxis Pandora CLI client";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The pyxis package to use";
    };

    # Auth options
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
        The file should contain only the password with no trailing newline.
        This is read at runtime, so it works with secret managers like agenix or sops-nix.
      '';
      example = "/run/secrets/pandora-password";
    };

    # Output options
    output = {
      format = lib.mkOption {
        type = lib.types.enum [ "human" "json" ];
        default = "human";
        description = "Output format";
      };

      verbose = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Enable verbose output";
      };

      color = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Enable colored output";
      };
    };

    # Cache options
    cache = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Enable session caching";
      };

      ttl = lib.mkOption {
        type = lib.types.ints.positive;
        default = 3600;
        description = "Cache time-to-live in seconds";
      };

      path = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Custom cache directory path";
      };
    };

    # Playlist options
    playlist = {
      quality = lib.mkOption {
        type = lib.types.enum [ "high" "medium" "low" ];
        default = "high";
        description = "Audio quality for playlists";
      };

      additionalUrl = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Additional URL for playlists";
      };
    };

    # Station options
    stations = {
      sort = lib.mkOption {
        type = lib.types.enum [ "recent" "name" "created" ];
        default = "recent";
        description = "Default station sort order";
      };

      limit = lib.mkOption {
        type = lib.types.nullOr lib.types.ints.positive;
        default = null;
        description = "Limit number of stations displayed";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ wrappedPyxis ];

    xdg.configFile."pyxis/config.yaml".source = configYaml;
  };
}
