# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Unofficial Pandora music service API client for Node.js, implementing the JSON API documented at https://6xq.net/pandora-apidoc/

## Commands

```bash
bun index.js    # Run the main client
```

No build step, tests, or linting configured.

## Architecture

### Authentication Flow

1. **Partner Login** (`auth.partnerLogin`) - Authenticate as a device type (android, iphone, palm, winmo) using hardcoded partner credentials in `keys` array
2. **Sync Time Calculation** - Decrypt server timestamp, extract unix time, calculate offset for future requests
3. **User Login** (`auth.userLogin`) - Authenticate actual user with encrypted payload

### Encryption

All post-authentication API calls use Blowfish encryption (ECB mode, hex output):
- `blowfish.js` - Dojo Toolkit Blowfish implementation
- `utils.js` - Wrapper providing `encrypt`, `encryptJson`, `decrypt` functions
- Each device type has separate encrypt/decrypt keys

### API Call Pattern

```
callPandoraMethod(dataMutate)(method)(data)
```

- `dataMutate` - Either `encryptJson` (encrypted) or identity function (plain)
- Automatically injects `syncTime`, `userAuthToken`, and auth params
- Posts to `https://tuner.pandora.com/services/json/`

### State Management

The `Pandora()` factory maintains closure state: `syncTime`, `partnerId`, `partnerAuthToken`, `userId`, `userAuthToken`

### Versioned Files

`index.v1.js`, `index.v2.js`, `index.v4.js` are historical iterations. `index.js` is current.

### Methods Directory

`methods/` contains extracted API method implementations (work in progress, uses ES modules).
- use bun