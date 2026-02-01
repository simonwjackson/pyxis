import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { trpc, createTRPCClient } from "./lib/trpc";
import { PlaybackProvider } from "./contexts/PlaybackContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ErrorBoundary } from "./components/ui/error-boundary";
import { router } from "./router";
import "./index.css";

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
