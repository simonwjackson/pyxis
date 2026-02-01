import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { trpc, createTRPCClient } from "./lib/trpc";
import { PlaybackProvider } from "./contexts/PlaybackContext";
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
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<PlaybackProvider>
					<RouterProvider router={router} />
					<Toaster
						theme="dark"
						position="bottom-right"
						toastOptions={{
							style: {
								background: "#18181b",
								border: "1px solid #27272a",
								color: "#f4f4f5",
							},
						}}
					/>
				</PlaybackProvider>
			</QueryClientProvider>
		</trpc.Provider>
	);
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
