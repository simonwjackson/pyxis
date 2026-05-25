/**
 * @module Main
 * Application entry point and root component setup.
 * Configures providers for routing, state management, theming, and playback.
 */

import { RegistryProvider } from "@effect/atom-react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { routeTree } from "./routes/routeTree.gen";
import { PlaybackProvider } from "./shared/playback/playback-context";
import { ThemeProvider } from "./shared/theme/theme-context";
import { ErrorBoundary } from "./shared/ui/error-boundary";
import "./index.css";

/** TanStack Router instance configured with the generated route tree */
const router = createRouter({ routeTree });

/**
 * Module augmentation for TanStack Router type safety.
 * Registers the router instance for type inference in route hooks.
 */
declare module "@tanstack/react-router" {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Register {
		router: typeof router;
	}
}

/**
 * Root application component with all required providers.
 * Sets up the provider hierarchy: ErrorBoundary > Theme > Effect Registry > Playback > Router.
 * Includes toast notifications styled to match the theme.
 */
function App() {
	return (
		<ErrorBoundary>
			<ThemeProvider>
				<RegistryProvider>
					<PlaybackProvider>
						<RouterProvider router={router} />
						<Toaster
							theme="dark"
							position="bottom-right"
							toastOptions={{
								style: {
									background: "var(--color-bg)",
									border: "1px solid var(--color-border)",
									color: "var(--color-text)",
								},
							}}
						/>
					</PlaybackProvider>
				</RegistryProvider>
			</ThemeProvider>
		</ErrorBoundary>
	);
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
