import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import orchestraSource from "./plugins/vite-plugin-orchestra-source/index";

export default defineConfig({
	plugins: [orchestraSource(), react(), tailwindcss()],
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
