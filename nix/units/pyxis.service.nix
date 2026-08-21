{ pkgs }:

pkgs.writeTextDir "share/systemd/user/pyxis.service" ''
  [Unit]
  Description=Pyxis music service
  Wants=network-online.target
  After=network-online.target

  [Service]
  ExecSearchPath=%h/.nix-profile/bin
  ExecStart=pyxis
  Restart=on-failure
  RestartSec=3
  TimeoutStopSec=30

  [Install]
  WantedBy=default.target
''
