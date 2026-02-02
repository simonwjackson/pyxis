import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { trpc, createTRPCClient } from "./shared/lib/trpc";
import { PlaybackProvider } from "./shared/playback/playback-context";
import { ThemeProvider } from "./shared/theme/theme-context";
import { ErrorBoundary } from "./shared/ui/error-boundary";
import { routeTree } from "./routes/routeTree.gen";
import "./index.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Register {
		router: typeof router;
	}
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
});

function App() {
	const [trpcClient] = useState(() => createTRPCClient());

	return (
		<ErrorBoundary>
			<ThemeProvider>
				<trpc.Provider client={trpcClient} queryClient={queryClient}>
					<QueryClientProvider client={queryClient}>
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
					</QueryClientProvider>
				</trpc.Provider>
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
