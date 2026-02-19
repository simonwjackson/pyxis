import { appendFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, createLogger as createViteLogger } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import orchestraSource from "./plugins/vite-plugin-orchestra-source/index";
import { getLogFile } from "./src/logger";


const logFile = getLogFile("web");
const viteLogger = createViteLogger();

function writeToLog(text: string): void {
	appendFileSync(logFile, text);
}

const customLogger = {
	...viteLogger,
	info(msg: string, options?: { timestamp?: boolean }) {
		const stripped = msg.replace(/\x1b\[[0-9;]*m/g, "");
		if (/Local:|Network:|ready in|VITE v/.test(stripped)) return;
		writeToLog(msg + "\n");
		viteLogger.info(msg, options);
	},
	warn(msg: string, options?: { timestamp?: boolean }) {
		writeToLog(`WARN ${msg}\n`);
		viteLogger.warn(msg, options);
	},
	warnOnce(msg: string, options?: { timestamp?: boolean }) {
		writeToLog(`WARN ${msg}\n`);
		viteLogger.warnOnce(msg, options);
	},
	error(msg: string, options?: { timestamp?: boolean }) {
		writeToLog(`ERROR ${msg}\n`);
		viteLogger.error(msg, options);
	},
};

const hmrNoReloadPlugin = {
	name: "hmr-no-reload-on-disconnect",
	apply: "serve" as const,
	transformIndexHtml(html: string) {
		return html.replace(
			"</head>",
			`<script type="module">
        if (import.meta.hot) {
          const originalReload = location.reload.bind(location);
          let suppressReload = false;

          import.meta.hot.on("vite:ws:disconnect", () => {
            suppressReload = true;
            console.log("[HMR] WS disconnected — suppressing auto-reload");
          });

          import.meta.hot.on("vite:ws:connect", () => {
            setTimeout(() => {
              suppressReload = false;
              console.log("[HMR] WS reconnected — reload re-enabled");
            }, 3000);
          });

          Object.defineProperty(window.location, "reload", {
            configurable: true,
            value: (...args) => {
              if (suppressReload) {
                console.log("[HMR] Reload suppressed (sleep/wake recovery)");
                return;
              }
              return originalReload(...args);
            },
          });
        }
      </script></head>`,
		);
	},
};

export default defineConfig({
	plugins: [hmrNoReloadPlugin, TanStackRouterVite(), orchestraSource({ serverUrl: "https://aka.hummingbird-lake.ts.net" }), react(), tailwindcss()],
	customLogger,
	server: {
		watch: {
			ignored: ["**/.direnv/**"],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
		},
	},
	build: {
		outDir: "dist-web",
	},
});
