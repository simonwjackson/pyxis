# Pyxis

Unofficial command-line client for Pandora music service, built with TypeScript and Effect.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Nix Flake](https://img.shields.io/badge/Nix-Flake-5277C3)](https://nixos.wiki/wiki/Flakes)

## Quick Start

```bash
# Run directly
nix run github:simonwjackson/pyxis -- auth login
nix run github:simonwjackson/pyxis -- stations list
nix run github:simonwjackson/pyxis -- playlist get "My Station" -f m3u > playlist.m3u
nix run github:simonwjackson/pyxis -- search "pink floyd" --type artist
nix run github:simonwjackson/pyxis -- track like <track-token> --station "My Station"
```

## Installation

### Nix Flake

```bash
# Run without installing
nix run github:simonwjackson/pyxis -- --help

# Install to profile
nix profile install github:simonwjackson/pyxis

# Add to flake.nix
{
  inputs.pyxis.url = "github:simonwjackson/pyxis";
}
```

<details>
<summary>Development shell</summary>

```bash
# Enter dev environment
nix develop github:simonwjackson/pyxis

# Or clone and develop locally
git clone https://github.com/simonwjackson/pyxis.git
cd pyxis
nix develop
bun install
bun run build
```
</details>

<details>
<summary>Development commands</summary>

This project uses [just](https://just.systems/) for common tasks:

```bash
just build        # Build the nix package
just test         # Run tests
just typecheck    # Run TypeScript type checking
just dev          # Watch mode for TypeScript

# After changing package.json dependencies:
just update-hashes
```

The `update-hashes` command automatically discovers the correct npm dependency hash for Nix builds by running a build with a dummy hash and extracting the correct one from the error output.
</details>

## Usage

### Authentication

```bash
# Login (interactive prompt)
pyxis auth login

# Login with credentials
pyxis auth login -u user@example.com -p password

# Check auth status
pyxis auth status

# Logout
pyxis auth logout
```

### Search

```bash
# Search for artists, songs, or genres
pyxis search "pink floyd"

# Filter by type
pyxis search "dark side" --type song
pyxis search "rock" --type genre
```

### Stations

```bash
# List all stations
pyxis stations list

# Sort by name or creation date
pyxis stations list -s name

# Get station details
pyxis stations info "My Station Name"

# Create station from search result
pyxis search "pink floyd" --type artist  # Get music token
pyxis stations create <music-token> --type artist

# Rename or delete stations
pyxis stations rename "Old Name" "New Name"
pyxis stations delete "Station Name"

# Browse genre stations
pyxis stations genres
pyxis stations genres --category "Rock"

# Manage seeds
pyxis stations seed add "My Station" <music-token>
pyxis stations seed remove <seed-id>

# Share stations
pyxis stations share "My Station" friend@example.com

# Configure QuickMix (shuffle)
pyxis stations quickmix set "Station 1" "Station 2" "Station 3"
```

### Playlists

```bash
# Get full track details
pyxis playlist get "Station Name"

# Get URLs only
pyxis playlist get "Station Name" -f urls

# Generate M3U playlist
pyxis playlist get "Station Name" -f m3u > playlist.m3u

# Specify audio quality
pyxis playlist get "Station Name" -Q medium
```

#### Streaming with mpv

```bash
# Basic endless loop
while true; do
  pyxis playlist get "Station Name" -f urls | mpv --playlist=-
done

# Using a named pipe for continuous playback
mkfifo /tmp/pyxis-urls

# Terminal 1: Feed URLs continuously
while true; do
  pyxis playlist get "Station Name" -f urls >> /tmp/pyxis-urls
  sleep 1
done

# Terminal 2: Play from pipe
mpv --playlist=/tmp/pyxis-urls --prefetch-playlist=yes
```

### Track Feedback

```bash
# Rate tracks (tokens from playlist output)
pyxis track like <track-token> --station "My Station"
pyxis track dislike <track-token> --station "My Station"

# Remove a rating
pyxis track unfeedback <feedback-id>

# Skip song for 30 days
pyxis track sleep <track-token>

# Get track info
pyxis track info <track-token>
pyxis track explain <track-token>  # Music Genome attributes

# Share a track
pyxis track share <music-token> friend@example.com
```

### Bookmarks

```bash
# List saved bookmarks
pyxis bookmarks list
pyxis bookmarks list --type artists
pyxis bookmarks list --type songs

# Save from current track
pyxis bookmarks add artist <track-token>
pyxis bookmarks add song <track-token>

# Remove bookmark
pyxis bookmarks delete <bookmark-token> --type artist
pyxis bookmarks delete <bookmark-token> --type song
```

### Account

```bash
# View account info
pyxis account settings
pyxis account usage

# Modify settings
pyxis account set explicit off
pyxis account set private on
pyxis account set zip 90210
```

### Global Options

All commands support these options:

- `-j, --json` - Output in JSON format
- `-c, --config <path>` - Use custom config file
- `--no-cache` - Skip session caching
- `-v, --verbose` - Enable verbose logging
- `-q, --quiet` - Suppress non-essential output

## Configuration

<details>
<summary>Configuration file format</summary>

Configuration is stored in `~/.config/pyxis/config.yaml` (or `~/.pyxis/config.yaml` on non-XDG systems).

```yaml
# Pandora credentials
auth:
  username: user@example.com
  # password: optional  # Use env var PANDORA_PASSWORD instead

# Output preferences
output:
  format: human  # human | json
  verbose: false
  color: true

# Cache settings
cache:
  enabled: true
  ttl: 3600  # seconds

# Playlist settings
playlist:
  quality: high  # high | medium | low

# Station listing preferences
stations:
  sort: recent  # recent | name | created
```

Initialize config file:
```bash
pyxis config init
```

View current configuration:
```bash
pyxis config show
pyxis config show --reveal-secrets  # Include passwords
pyxis config path                    # Show config file location
```
</details>

<details>
<summary>Environment variables</summary>

- `PANDORA_USERNAME` - Pandora account email
- `PANDORA_PASSWORD` - Pandora account password
- `PYXIS_CONFIG` - Custom config file path

Environment variables take precedence over config file values.
</details>

<details>
<summary>Session caching</summary>

Authentication tokens are cached in `~/.cache/pyxis/session.json` to avoid repeated logins. Sessions expire based on Pandora's token lifetime.

Disable caching with `--no-cache` flag or set `cache.enabled: false` in config.
</details>

## Command Reference

<details>
<summary>Complete command list</summary>

### Authentication
- `pyxis auth login [-u email] [-p password]` - Login to Pandora
- `pyxis auth logout [--all]` - Clear session (--all removes all sessions)
- `pyxis auth status` - Show current authentication status

### Search
- `pyxis search <query> [--type <artist|song|genre|all>]` - Search for music

### Stations
- `pyxis stations list [-s sort] [-l limit]` - List all stations
  - Sort: `recent` (default), `name`, `created`
- `pyxis stations info <station>` - Show detailed station information
- `pyxis stations create <music-token> [--type <song|artist>]` - Create station
- `pyxis stations delete <station>` - Delete station
- `pyxis stations rename <station> <new-name>` - Rename station
- `pyxis stations genres [--category <name>]` - Browse genre stations
- `pyxis stations share <station> <email> [emails...]` - Share via email
- `pyxis stations clone <station>` - Clone shared station as editable
- `pyxis stations seed add <station> <music-token>` - Add seed
- `pyxis stations seed remove <seed-id>` - Remove seed
- `pyxis stations quickmix set <stations...>` - Configure shuffle stations
- `pyxis stations quickmix show` - Show QuickMix stations

### Playlists
- `pyxis playlist get <station> [-Q quality] [-f format]` - Get playlist tracks
  - Quality: `high` (default), `medium`, `low`
  - Format: `full` (default), `urls`, `m3u`

### Track
- `pyxis track info <track-token>` - Show track details
- `pyxis track explain <track-token>` - Show Music Genome attributes
- `pyxis track like <track-token> --station <station>` - Thumbs up
- `pyxis track dislike <track-token> --station <station>` - Thumbs down
- `pyxis track unfeedback <feedback-id>` - Remove rating
- `pyxis track sleep <track-token>` - Skip for 30 days
- `pyxis track share <music-token> <email>` - Share via email

### Bookmarks
- `pyxis bookmarks list [--type <artists|songs|all>]` - List bookmarks
- `pyxis bookmarks add artist <track-token>` - Bookmark artist
- `pyxis bookmarks add song <track-token>` - Bookmark song
- `pyxis bookmarks delete <bookmark-token> --type <artist|song>` - Remove bookmark

### Account
- `pyxis account settings` - View account settings
- `pyxis account usage` - View listening time and limits
- `pyxis account set explicit <on|off>` - Toggle explicit filter
- `pyxis account set private <on|off>` - Toggle profile privacy
- `pyxis account set zip <zipcode>` - Set zip code

### Configuration
- `pyxis config init [--force]` - Create config file
- `pyxis config show [--reveal-secrets]` - Display current configuration
- `pyxis config path` - Print config file path
</details>

## API

This package can also be used as a library:

```typescript
import * as Pandora from './src/index.js'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const session = yield* Pandora.login('user@example.com', 'password')
  const { stations } = yield* Pandora.getStationList(session)

  for (const station of stations) {
    console.log(station.stationName)
  }
})

Effect.runPromise(program)
```

## How It Works

This client implements the [unofficial Pandora JSON API](https://6xq.net/pandora-apidoc/), handling:

- **Partner authentication** - Authenticates as an Android/iOS device
- **Blowfish encryption** - All API calls use ECB-mode Blowfish encryption
- **Time synchronization** - Maintains server time offset for request signing
- **Session management** - Handles auth tokens and session persistence

Built with [Effect](https://effect.website/) for functional error handling and type-safe async operations.

## Troubleshooting

<details>
<summary>Common issues</summary>

**Authentication fails**
- Verify credentials are correct
- Clear session cache: `pyxis auth logout`
- Check if Pandora is experiencing service issues

**No stations listed**
- Ensure you're logged in: `pyxis auth status`
- Try refreshing with `--no-cache` flag

**Playlist URLs don't work**
- URLs expire quickly; generate fresh playlists as needed
- Try lower quality setting if high quality fails
</details>

## Contributing

Contributions welcome! Please read the [API documentation](https://6xq.net/pandora-apidoc/) to understand the Pandora API before submitting changes.

## License

MIT

## Disclaimer

This is an unofficial client and is not affiliated with Pandora Media, LLC. Use at your own risk. Ensure compliance with Pandora's Terms of Service.
