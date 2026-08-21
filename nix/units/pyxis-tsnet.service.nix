{ pkgs }:

pkgs.writeTextDir "share/systemd/user/pyxis-tsnet.service" ''
  [Unit]
  Description=Pyxis tailnet edge — https://pyxis.<tailnet>.ts.net
  Wants=network-online.target pyxis.service
  After=network-online.target pyxis.service

  [Service]
  ExecSearchPath=%h/.nix-profile/bin
  ExecStart=pyxis-tsnet
  Restart=on-failure
  RestartSec=3

  [Install]
  WantedBy=default.target
''
