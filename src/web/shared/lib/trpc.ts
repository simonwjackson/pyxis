/**
 * @module tRPC
 * tRPC React client configuration for the Pyxis web frontend.
 * Provides typed hooks and client creation for API communication.
 */

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, splitLink, httpSubscriptionLink } from "@trpc/client";
import type { AppRouter } from "../../../../server/router.js";

/**
 * tRPC React hooks instance typed to the AppRouter.
 * Use this to access `trpc.query.useQuery()`, `trpc.mutation.useMutation()`, etc.
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates and configures the tRPC client with appropriate transport links.
 * Uses SSE subscriptions for real-time updates, HTTP batching for queries/mutations.
 *
 * @returns Configured tRPC client instance
 *
 * @example
 * ```tsx
 * const client = createTRPCClient();
 * <trpc.Provider client={client} queryClient={queryClient}>
 *   <App />
 * </trpc.Provider>
 * ```
 */
export function createTRPCClient() {
	return trpc.createClient({
		links: [
			splitLink({
				condition: (op) => op.type === "subscription",
				true: httpSubscriptionLink({
					url: "/trpc",
					eventSourceOptions() {
						return { withCredentials: true };
					},
				}),
				false: httpBatchLink({
					url: "/trpc",
					fetch(url, options) {
						return fetch(url, {
							...options,
							credentials: "include",
						});
					},
				}),
			}),
		],
	});
}
