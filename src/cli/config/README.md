# Configuration System

Type-safe YAML configuration loader with environment variable support and Zod validation.

## Files

- **schema.ts** - Zod schema definition and TypeScript types
- **loader.ts** - Configuration loading logic with priority merging
- **paths.ts** - XDG Base Directory specification path helpers

## Usage

```typescript
import { loadConfig, loadConfigFromEnv } from './config/loader.js';

// Load from file + environment (async)
const config = await loadConfig();
const configCustomPath = await loadConfig('/path/to/config.yaml');

// Load from environment only (sync)
const envConfig = loadConfigFromEnv();
```

## Configuration Priority

Later sources override earlier ones:

1. Default values (from `DEFAULT_CONFIG` in schema.ts)
2. YAML config file (~/.config/pandora/config.yaml)
3. Environment variables (PANDORA_*)

## Configuration Schema

```typescript
{
  auth?: {
    username?: string;
    password?: string;
  };
  output?: {
    format: 'human' | 'json';  // default: 'human'
    verbose: boolean;          // default: false
    color: boolean;            // default: true
  };
  cache?: {
    enabled: boolean;          // default: true
    ttl: number;               // default: 3600 (seconds)
    path?: string;
  };
  playlist?: {
    quality: 'high' | 'medium' | 'low';  // default: 'high'
    additionalUrl?: string;
  };
  stations?: {
    sort: 'name' | 'created' | 'recent';  // default: 'recent'
    limit?: number;
  };
}
```

## Environment Variables

All config values can be overridden via environment variables:

### Authentication
- `PANDORA_USERNAME` - Pandora account username
- `PANDORA_PASSWORD` - Pandora account password

### Output
- `PANDORA_OUTPUT_FORMAT` - Output format: `human` or `json`
- `PANDORA_OUTPUT_VERBOSE` - Verbose output: `true` or `false`
- `PANDORA_OUTPUT_COLOR` - Colored output: `true` or `false`

### Cache
- `PANDORA_CACHE_ENABLED` - Enable caching: `true` or `false`
- `PANDORA_CACHE_TTL` - Cache TTL in seconds (positive integer)
- `PANDORA_CACHE_PATH` - Custom cache directory path

### Playlist
- `PANDORA_PLAYLIST_QUALITY` - Audio quality: `high`, `medium`, or `low`
- `PANDORA_PLAYLIST_ADDITIONAL_URL` - Additional playlist URL

### Stations
- `PANDORA_STATIONS_SORT` - Station sort order: `name`, `created`, or `recent`
- `PANDORA_STATIONS_LIMIT` - Maximum number of stations (positive integer)

## Example Config File

Default location: `~/.config/pandora/config.yaml`

```yaml
# Authentication
auth:
  username: user@example.com
  # password: secret  # Better to use PANDORA_PASSWORD env var

# Output preferences
output:
  format: human
  verbose: false
  color: true

# Cache settings
cache:
  enabled: true
  ttl: 3600

# Playlist settings
playlist:
  quality: high

# Station settings
stations:
  sort: recent
  limit: 50
```

## Error Handling

The loader throws `ConfigError` for:
- Invalid YAML syntax
- Validation failures (via Zod)
- File read errors (except missing files, which are silently ignored)

All errors include helpful context:

```typescript
try {
  const config = await loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    // Shows validation errors like:
    // Configuration validation failed:
    //   - cache.ttl: Number must be greater than 0
  }
}
```

## Type Safety

Configuration is fully type-safe using Zod schema inference:

- Types derived from schema (`z.infer<typeof AppConfigSchema>`)
- No manual type duplication
- Runtime validation ensures type safety
- Follows TypeScript strict mode with `exactOptionalPropertyTypes`
