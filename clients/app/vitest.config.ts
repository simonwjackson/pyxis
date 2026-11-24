import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { dedupe: ["effect"] },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
  },
})
