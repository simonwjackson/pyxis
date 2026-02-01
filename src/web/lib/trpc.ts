import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, splitLink, httpSubscriptionLink } from "@trpc/client";
import type { AppRouter } from "../../../server/router.js";

export const trpc = createTRPCReact<AppRouter>();

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
