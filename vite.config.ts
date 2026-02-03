import { appendFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, createLogger as createViteLogger } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import orchestraSource from "./plugins/vite-plugin-orchestra-source/index";
import { getLogFile } from "./src/logger";
import { resolveConfig } from "./src/config";

const appConfig = resolveConfig();
const proxyTarget = `http://${appConfig.server.hostname}:${appConfig.server.port}`;

const logFile = getLogFile("web");
const viteLogger = createViteLogger();

function writeToLog(text: string): void {
	appendFileSync(logFile, text);
}

const customLogger = {
	...viteLogger,
	info(msg: string, options?: { timestamp?: boolean }) {
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

export default defineConfig({
	plugins: [TanStackRouterVite(), orchestraSource({ serverUrl: "https://aka.hummingbird-lake.ts.net" }), react(), tailwindcss()],
	customLogger,
	server: {
		port: appConfig.web.port,
		host: "0.0.0.0",
		allowedHosts: appConfig.web.allowedHosts.length > 0 ? appConfig.web.allowedHosts : true,
		proxy: {
			"/trpc": {
				target: proxyTarget,
				changeOrigin: true,
				configure: (proxy) => {
					proxy.on("proxyRes", (proxyRes, _req, res) => {
						const ct = proxyRes.headers["content-type"];
						if (ct) res.setHeader("content-type", ct);
						res.flushHeaders();
					});
				},
			},
			"/stream": {
				target: proxyTarget,
				changeOrigin: true,
				ws: false,
				configure: (proxy) => {
					proxy.on("proxyRes", (proxyRes, _req, res) => {
						const ct = proxyRes.headers["content-type"];
						if (ct) res.setHeader("content-type", ct);
						res.flushHeaders();
					});
				},
			},
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
