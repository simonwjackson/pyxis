import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  // ProseQL schemas are matched by class identity, so a second copy of Effect would make
  // the engine fail to recognise the schemas this client hands it.
  resolve: { dedupe: ["effect"] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/rpc": "http://127.0.0.1:4488",
      "/stream": "http://127.0.0.1:4488",
      "/healthz": "http://127.0.0.1:4488",
      "/realtime": { target: "ws://127.0.0.1:4488", ws: true },
    },
  },
  test: {
    environment: "jsdom",
  },
})
