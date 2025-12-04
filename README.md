# Pandora CLI

Unofficial command-line client for Pandora music service, built with TypeScript and Effect.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Nix Flake](https://img.shields.io/badge/Nix-Flake-5277C3)](https://nixos.wiki/wiki/Flakes)

## Quick Start

```bash
# Run directly
nix run github:simonwjackson/pandora -- auth login
nix run github:simonwjackson/pandora -- stations list
nix run github:simonwjackson/pandora -- playlist get "My Station" -f m3u > playlist.m3u
nix run github:simonwjackson/pandora -- search "pink floyd" --type artist
nix run github:simonwjackson/pandora -- track like <track-token> --station "My Station"
```

## Installation

### Nix Flake

```bash
# Run without installing
nix run github:simonwjackson/pandora -- --help

# Install to profile
nix profile install github:simonwjackson/pandora

# Add to flake.nix
{
  inputs.pandora.url = "github:simonwjackson/pandora";
}
```

<details>
<summary>Development shell</summary>

```bash
# Enter dev environment
nix develop github:simonwjackson/pandora

# Or clone and develop locally
git clone https://github.com/simonwjackson/pandora.git
cd pandora
nix develop
bun install
bun run build
```
</details>

## Usage

### Authentication

```bash
# Login (interactive prompt)
pandora auth login

# Login with credentials
pandora auth login -u user@example.com -p password

# Check auth status
pandora auth status

# Logout
pandora auth logout
```

### Search

```bash
# Search for artists, songs, or genres
pandora search "pink floyd"

# Filter by type
pandora search "dark side" --type song
pandora search "rock" --type genre
```

### Stations

```bash
# List all stations
pandora stations list

# Sort by name or creation date
pandora stations list -s name

# Get station details
pandora stations info "My Station Name"

# Create station from search result
pandora search "pink floyd" --type artist  # Get music token
pandora stations create <music-token> --type artist

# Rename or delete stations
pandora stations rename "Old Name" "New Name"
pandora stations delete "Station Name"

# Browse genre stations
pandora stations genres
pandora stations genres --category "Rock"

# Manage seeds
pandora stations seed add "My Station" <music-token>
pandora stations seed remove <seed-id>

# Share stations
pandora stations share "My Station" friend@example.com

# Configure QuickMix (shuffle)
pandora stations quickmix set "Station 1" "Station 2" "Station 3"
```

### Playlists

```bash
# Get full track details
pandora playlist get "Station Name"

# Get URLs only
pandora playlist get "Station Name" -f urls

# Generate M3U playlist
pandora playlist get "Station Name" -f m3u > playlist.m3u

# Specify audio quality
pandora playlist get "Station Name" -Q medium
```

### Track Feedback

```bash
# Rate tracks (tokens from playlist output)
pandora track like <track-token> --station "My Station"
pandora track dislike <track-token> --station "My Station"

# Remove a rating
pandora track unfeedback <feedback-id>

# Skip song for 30 days
pandora track sleep <track-token>

# Get track info
pandora track info <track-token>
pandora track explain <track-token>  # Music Genome attributes

# Share a track
pandora track share <music-token> friend@example.com
```

### Bookmarks

```bash
# List saved bookmarks
pandora bookmarks list
pandora bookmarks list --type artists
pandora bookmarks list --type songs

# Save from current track
pandora bookmarks add artist <track-token>
pandora bookmarks add song <track-token>

# Remove bookmark
pandora bookmarks delete <bookmark-token> --type artist
pandora bookmarks delete <bookmark-token> --type song
```

### Account

```bash
# View account info
pandora account settings
pandora account usage

# Modify settings
pandora account set explicit off
pandora account set private on
pandora account set zip 90210
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

Configuration is stored in `~/.config/pandora/config.yaml` (or `~/.pandora/config.yaml` on non-XDG systems).

```yaml
# Authentication credentials
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
pandora config init
```

View current configuration:
```bash
pandora config show
pandora config show --reveal-secrets  # Include passwords
pandora config path                    # Show config file location
```
</details>

<details>
<summary>Environment variables</summary>

- `PANDORA_USERNAME` - Pandora account email
- `PANDORA_PASSWORD` - Pandora account password
- `PANDORA_CONFIG` - Custom config file path

Environment variables take precedence over config file values.
</details>

<details>
<summary>Session caching</summary>

Authentication tokens are cached in `~/.cache/pandora/session.json` to avoid repeated logins. Sessions expire based on Pandora's token lifetime.

Disable caching with `--no-cache` flag or set `cache.enabled: false` in config.
</details>

## Command Reference

<details>
<summary>Complete command list</summary>

### Authentication
- `pandora auth login [-u email] [-p password]` - Login to Pandora
- `pandora auth logout [--all]` - Clear session (--all removes all sessions)
- `pandora auth status` - Show current authentication status

### Search
- `pandora search <query> [--type <artist|song|genre|all>]` - Search for music

### Stations
- `pandora stations list [-s sort] [-l limit]` - List all stations
  - Sort: `recent` (default), `name`, `created`
- `pandora stations info <station>` - Show detailed station information
- `pandora stations create <music-token> [--type <song|artist>]` - Create station
- `pandora stations delete <station>` - Delete station
- `pandora stations rename <station> <new-name>` - Rename station
- `pandora stations genres [--category <name>]` - Browse genre stations
- `pandora stations share <station> <email> [emails...]` - Share via email
- `pandora stations clone <station>` - Clone shared station as editable
- `pandora stations seed add <station> <music-token>` - Add seed
- `pandora stations seed remove <seed-id>` - Remove seed
- `pandora stations quickmix set <stations...>` - Configure shuffle stations
- `pandora stations quickmix show` - Show QuickMix stations

### Playlists
- `pandora playlist get <station> [-Q quality] [-f format]` - Get playlist tracks
  - Quality: `high` (default), `medium`, `low`
  - Format: `full` (default), `urls`, `m3u`

### Track
- `pandora track info <track-token>` - Show track details
- `pandora track explain <track-token>` - Show Music Genome attributes
- `pandora track like <track-token> --station <station>` - Thumbs up
- `pandora track dislike <track-token> --station <station>` - Thumbs down
- `pandora track unfeedback <feedback-id>` - Remove rating
- `pandora track sleep <track-token>` - Skip for 30 days
- `pandora track share <music-token> <email>` - Share via email

### Bookmarks
- `pandora bookmarks list [--type <artists|songs|all>]` - List bookmarks
- `pandora bookmarks add artist <track-token>` - Bookmark artist
- `pandora bookmarks add song <track-token>` - Bookmark song
- `pandora bookmarks delete <bookmark-token> --type <artist|song>` - Remove bookmark

### Account
- `pandora account settings` - View account settings
- `pandora account usage` - View listening time and limits
- `pandora account set explicit <on|off>` - Toggle explicit filter
- `pandora account set private <on|off>` - Toggle profile privacy
- `pandora account set zip <zipcode>` - Set zip code

### Configuration
- `pandora config init [--force]` - Create config file
- `pandora config show [--reveal-secrets]` - Display current configuration
- `pandora config path` - Print config file path
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
- Clear session cache: `pandora auth logout`
- Check if Pandora is experiencing service issues

**No stations listed**
- Ensure you're logged in: `pandora auth status`
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
