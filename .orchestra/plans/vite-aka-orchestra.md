# Vite: Allow "aka" Host & Install Orchestra Plugin

## Goal

Enable the Vite dev server to be accessed via the `aka` hostname (mapped to `127.0.0.2` in `/etc/hosts`) and add the agentic-orchestra Vite plugin for in-page AI widget + JSX source tracking.

## Requirements

- Vite dev server must accept requests from hostname `aka` (already resolved via `/etc/hosts`)
- The `vite-plugin-orchestra-source` plugin must be copied from the agentic-orchestra repo into this project
- Plugin must be registered in vite.config.ts **before** the react() plugin
- Plugin only activates in dev mode (no production impact)

## Source Files

| Source | Type | Target |
|--------|------|--------|
| `/snowscape/code/sandbox/agentic-orchestra/packages/vite-plugin-orchestra-source/src/index.ts` | Copy | `/snowscape/code/sandbox/pyxis/plugins/vite-plugin-orchestra-source/index.ts` |
| `/snowscape/code/sandbox/agentic-orchestra/packages/vite-plugin-orchestra-source/src/babel-plugin.ts` | Copy | `/snowscape/code/sandbox/pyxis/plugins/vite-plugin-orchestra-source/babel-plugin.ts` |
| `/snowscape/code/sandbox/pyxis/vite.config.ts` | Modify | (same) |

## Changes

### 1. Copy plugin files into `plugins/vite-plugin-orchestra-source/`

Copy the two source files from agentic-orchestra. These have zero runtime dependencies beyond Vite itself (which is already a devDep). The babel-plugin.ts is only used if someone opts into the Babel approach — the default regex-based transform in index.ts works standalone.

### 2. Update `vite.config.ts`

Add `allowedHosts: ["aka"]` to `server` config and register the orchestra plugin:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import orchestraSource from "./plugins/vite-plugin-orchestra-source/index";

export default defineConfig({
  plugins: [
    orchestraSource(),   // Must come before react()
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    allowedHosts: ["aka"],
    proxy: {
      "/trpc": {
        target: "http://localhost:3847",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3847",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist-web",
  },
});
```

## Acceptance Criteria

- [ ] `bun run dev:web` serves the app accessible at `http://aka:5173` without Vite blocking the host
- [ ] Orchestra widget script tag is injected in the HTML during dev mode
- [ ] JSX elements get `data-source` attributes in dev mode
- [ ] Production build (`bun run build:web`) is unaffected by the plugin
