import { defineConfig, createLogger as createViteLogger } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import orchestraSource from "./plugins/vite-plugin-orchestra-source/index";
import { createLogger } from "./src/logger";

const webLogger = createLogger("web");
const viteLogger = createViteLogger();
const customLogger = {
	...viteLogger,
	info(msg: string, options?: { timestamp?: boolean }) {
		webLogger.write(msg + "\n");
		viteLogger.info(msg, options);
	},
	warn(msg: string, options?: { timestamp?: boolean }) {
		webLogger.write(`WARN ${msg}\n`);
		viteLogger.warn(msg, options);
	},
	warnOnce(msg: string, options?: { timestamp?: boolean }) {
		webLogger.write(`WARN ${msg}\n`);
		viteLogger.warnOnce(msg, options);
	},
	error(msg: string, options?: { timestamp?: boolean }) {
		webLogger.write(`ERROR ${msg}\n`);
		viteLogger.error(msg, options);
	},
};

export default defineConfig({
	plugins: [orchestraSource(), react(), tailwindcss()],
	customLogger,
	server: {
		port: 5678,
		host: "0.0.0.0",
		allowedHosts: ["pyxis.hummingbird-lake.ts.net"],
		proxy: {
			"/trpc": {
				target: "http://aka:8765",
				changeOrigin: true,
			},
			"/stream": {
				target: "http://aka:8765",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://aka:8765",
				ws: true,
			},
		},
	},
	build: {
		outDir: "dist-web",
	},
});
