{ pkgs }:

# Unit files ship inside the YouTube Music plugin package. Installing or removing the
# plugin therefore carries its operational services without adding anything to core.
pkgs.runCommand "pyxis-ytdlp-update-units" { } ''
  mkdir -p $out/share/systemd/user

  cat > $out/share/systemd/user/pyxis-ytdlp-update.service <<'EOF'
  [Unit]
  Description=Refresh the Pyxis YouTube Music plugin to the latest yt-dlp nightly
  Wants=network-online.target
  After=network-online.target

  [Service]
  Type=oneshot
  ExecStart=%h/.nix-profile/bin/pyxis-ytdlp-update
  EOF

  cat > $out/share/systemd/user/pyxis-ytdlp-update.timer <<'EOF'
  [Unit]
  Description=Nightly yt-dlp refresh for the Pyxis YouTube Music plugin

  [Timer]
  OnCalendar=*-*-* 03:30
  RandomizedDelaySec=45min
  Persistent=true

  [Install]
  WantedBy=timers.target
  EOF
''
