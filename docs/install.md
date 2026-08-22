# Install Pyxis with `nix profile`

Pyxis v2 installs per user. The aggregate package contains the Rust core, built reference
client, YouTube Music and Pandora plugins, the yt-dlp updater, the dedicated tsnet edge,
and four systemd user units.

## Existing NixOS service must leave first

The old system units and the new user units cannot run together. Both use the `pyxis`
tailnet hostname, and both bind their configured localhost port.

The M2 activation stopped these legacy units before enabling v2:

```text
pyxis.service
tsnet-proxy-pyxis.service
```

They remain declared by the current NixOS generation. Deploy the prepared `mountainous`
removal before a reboot or system switch can start them again. Verify both old units are
inactive. Do not delete `/var/lib/pyxis` or `/var/lib/borg/pyxis`. The former is the read-only
legacy source, and the latter remains rollback evidence.

## Install

From a clean committed checkout:

```sh
nix profile add .#pyxis
systemctl --user daemon-reload
systemctl --user enable --now pyxis.service
systemctl --user enable --now pyxis-ytdlp-update.timer
```

Verify localhost before starting the tailnet edge:

```sh
curl -fsS http://127.0.0.1:4488/healthz
systemctl --user status pyxis.service
systemctl --user list-timers pyxis-ytdlp-update.timer
```

Then start the edge:

```sh
systemctl --user enable --now pyxis-tsnet.service
journalctl --user -u pyxis-tsnet.service -f
```

The first start can print an authorization URL. Authorize it once. Replacing an older
`pyxis` tailnet node can briefly report a `pyxis-1` name during authorization. Restart the
edge after authorization and verify that its log reports the final origin:

```text
https://pyxis.hummingbird-lake.ts.net
```

Also verify that plain HTTP redirects to that exact HTTPS origin. Do not rename the origin.
Installed PWA state and offline downloads are origin-scoped.

## State

| Data | Default path |
|---|---|
| ProseQL, credential key, media, stream cache | `~/.local/share/pyxis/` |
| Mutable yt-dlp nightly | `~/.local/share/pyxis/yt-dlp/yt-dlp` |
| tsnet node state and certificate | `~/.config/pyxis-tsnet/` |

Plugin credentials are encrypted with XChaCha20-Poly1305. The owner-only
`credentials.key` file is required to decrypt them. Back up the whole state directory, not
only the ProseQL source file.

## Pandora configuration

Pandora configuration is account-scoped. Clients call `plugin.config.set` with plugin id
`pandora` and `{ username, password }`. The service returns no plaintext configuration and
stores only ciphertext. Do not put the password in shell history. The reference client gets
a temporary configuration form during M2 validation; the later designed client owns the
final interaction.

## Upgrade

```sh
nix profile upgrade --refresh pyxis
systemctl --user daemon-reload
systemctl --user restart pyxis.service pyxis-tsnet.service
```

The yt-dlp timer updates its mutable binary without restarting Pyxis. The pinned nixpkgs
binary remains the fallback if a nightly update fails.

## Remove

```sh
systemctl --user disable --now \
  pyxis.service pyxis-tsnet.service pyxis-ytdlp-update.timer
nix profile remove pyxis
```

Profile removal does not delete user data.
