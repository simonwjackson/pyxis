import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import orchestraSource from "./plugins/vite-plugin-orchestra-source/index";

export default defineConfig({
	plugins: [orchestraSource(), react(), tailwindcss()],
	server: {
		port: 5678,
		host: "0.0.0.0",
		allowedHosts: ["aka"],
		proxy: {
			"/trpc": {
				target: "http://localhost:8765",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://localhost:8765",
				ws: true,
			},
		},
	},
	build: {
		outDir: "dist-web",
	},
});
