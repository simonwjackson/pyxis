import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/router.js";

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
	return trpc.createClient({
		links: [
			httpBatchLink({
				url: "/trpc",
				fetch(url, options) {
					return fetch(url, {
						...options,
						credentials: "include",
					});
				},
			}),
		],
	});
}
