import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/rpc": "http://127.0.0.1:4488",
      "/stream": "http://127.0.0.1:4488",
      "/healthz": "http://127.0.0.1:4488",
    },
  },
  test: {
    environment: "jsdom",
  },
})
