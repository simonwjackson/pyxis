import { appendFileSync } from "node:fs";
import { defineConfig, createLogger as createViteLogger } from "vite";
import react from "@vitejs/plugin-react";
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
	plugins: [orchestraSource({ serverUrl: "https://aka.hummingbird-lake.ts.net" }), react(), tailwindcss()],
	customLogger,
	server: {
		port: 5678,
		host: "0.0.0.0",
		allowedHosts: ["pyxis.hummingbird-lake.ts.net"],
		proxy: {
			"/trpc": {
				target: "http://aka:8765",
				changeOrigin: true,
				configure: (proxy) => {
					proxy.on("proxyRes", (_proxyRes, _req, res) => {
						res.flushHeaders();
					});
				},
			},
			"/stream": {
				target: "http://aka:8765",
				changeOrigin: true,
				ws: false,
				configure: (proxy) => {
					proxy.on("proxyRes", (_proxyRes, _req, res) => {
						res.flushHeaders();
					});
				},
			},
		},
	},
	build: {
		outDir: "dist-web",
	},
});
