import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		port: 5173,
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
