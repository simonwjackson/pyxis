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

        log = {
          level = cfg.log.level;
        };
      }
    )
  );

  # Wrapper script that reads password from file and sets env var
  wrappedPyxis = pkgs.writeShellScriptBin "pyxis" ''
    set -euo pipefail

    ${lib.optionalString (cfg.sources.pandora.passwordFile != null) ''
      if [[ -f "${cfg.sources.pandora.passwordFile}" ]]; then
        export PYXIS_PANDORA_PASSWORD="$(cat "${cfg.sources.pandora.passwordFile}")"
      else
        echo "Error: Password file not found: ${cfg.sources.pandora.passwordFile}" >&2
        exit 1
      fi
    ''}

    ${lib.optionalString (cfg.sources.discogs.tokenFile != null) ''
      if [[ -f "${cfg.sources.discogs.tokenFile}" ]]; then
        export PYXIS_DISCOGS_TOKEN="$(cat "${cfg.sources.discogs.tokenFile}")"
      else
        echo "Warning: Discogs token file not found: ${cfg.sources.discogs.tokenFile}" >&2
      fi
    ''}

    exec ${cfg.package}/bin/pyxis "$@"
  '';
in
{
  options.programs.pyxis = {
    enable = lib.mkEnableOption "Pyxis music streaming daemon";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The pyxis package to use";
    };

    # Server options
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

    # Web frontend options
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

    # Source options
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
            The file should contain only the password with no trailing newline.
            This is read at runtime, so it works with secret managers like agenix or sops-nix.
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
            This is read at runtime, so it works with secret managers like agenix or sops-nix.
            Sets the PYXIS_DISCOGS_TOKEN environment variable.
          '';
          example = "/run/secrets/discogs-token";
        };
      };
    };

    # Log options
    log = {
      level = lib.mkOption {
        type = lib.types.enum [ "trace" "debug" "info" "warn" "error" "fatal" ];
        default = "info";
        description = "Log level";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ wrappedPyxis ];

    xdg.configFile."pyxis/config.yaml".source = configYaml;
  };
}
