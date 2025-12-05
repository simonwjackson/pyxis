# Architecture

## System Overview

```
CLI Layer (src/cli/)
  commands/     Command handlers (auth, stations, etc)
  config/       YAML config loading + validation
  cache/        Session persistence
  output/       Formatters (table, JSON, M3U)
  errors/       Error handling + display
            ↓
Client Layer (src/client.ts)
  Public API facade
  Session management
  Quality selection
            ↓
API Layer (src/api/)
  auth.ts       Partner + user login
  station.ts    Station CRUD, seeds, feedback
  user.ts       Settings, bookmarks, usage
  music.ts      Search, track info, sharing
  bookmark.ts   Bookmark add/delete
  track.ts      Track explanations
  call.ts       Base API call abstraction
            ↓
Crypto Layer (src/crypto/)
  blowfish.ts   Blowfish cipher (Dojo Toolkit)
  index.ts      encrypt/decrypt wrappers
            ↓
HTTP Layer (src/http/client.ts)
  fetch wrapper with Effect error handling
            ↓
Pandora JSON API v5
  https://tuner.pandora.com/services/json/
```

## Authentication Flow

1. **Partner Login** (unencrypted)
   - POST auth.partnerLogin
   - Send device credentials (android/iphone/palm)
   - Receive encrypted syncTime + partnerAuthToken
   - Decrypt syncTime, calculate offset

2. **User Login** (encrypted)
   - POST auth.userLogin
   - Encrypt payload with partner key
   - Include syncTime offset
   - Receive userAuthToken + userId

3. **Authenticated Calls**
   - POST <method>
   - Include auth_token, partner_id, user_id in URL
   - Encrypt JSON payload with Blowfish ECB
   - Include syncTime in payload

## Data Flow

```
User Input → Commander.js → Command Handler
                                    ↓
                              Load Session
                                    ↓
                              API Call (Effect pipeline)
                                → Build request params
                                → Encrypt payload (if needed)
                                → HTTP POST
                                → Parse response
                                    ↓
                              Format Output
                                    ↓
                              stdout (table/JSON/M3U)
```

## Module Structure

**src/cli/** - Command-line interface
- index.ts - Entry point, command registration
- commands/ - Command handlers by domain (auth, stations, playlist, search, bookmarks, track, account, config)
- config/ - schema.ts (Zod), loader.ts (YAML + env), paths.ts (XDG)
- cache/ - session.ts (persistence with file locking)

**src/api/** - One file per API domain
- auth.ts, station.ts, user.ts, music.ts, bookmark.ts, track.ts, call.ts

**src/crypto/** - Blowfish encryption
- blowfish.ts (Dojo Toolkit cipher), index.ts (wrappers)

**src/http/** - HTTP client wrapper

**src/types/** - TypeScript types
- api.ts (request/response), errors.ts (tagged errors), config.ts

**src/** - Root modules
- client.ts (public API facade), quality.ts (audio mapping), constants.ts (API URL, device credentials)

## Error Handling

All errors use Effect's tagged error pattern:

```typescript
// Defined in src/types/errors.ts
ApiCallError | SessionError | EncryptionError | DecryptionError |
PartnerLoginError | UserLoginError | ConfigError | NotFoundError

// Handled in src/cli/errors/handler.ts
runEffect() wraps Effect execution with formatted error output
```

## Key Patterns

1. **Effect-TS everywhere** - All async ops return `Effect.Effect<T, E>`
2. **Readonly types** - All API types use `readonly` modifiers
3. **Tagged errors** - Discriminated union for type-safe error handling
4. **Session caching** - Auth tokens persisted to `~/.cache/pyxis/`
5. **Config priority** - Defaults → YAML file → Environment variables
