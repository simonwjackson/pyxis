import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PYXIS_E2E_PORT ?? "9876", 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "test-results/playwright",
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `PYXIS_WEB_DEV=1 PYXIS_SERVER_HOSTNAME=127.0.0.1 PYXIS_SERVER_PORT=${port} PYXIS_LOG_LEVEL=error bun server/index.ts`,
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-dev",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
