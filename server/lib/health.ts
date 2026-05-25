const HEALTH_PATH = "/healthz";
const HEALTH_BODY = { service: "pyxis", status: "ok" } as const;

export function isHealthRequest(url: URL, method: string): boolean {
	return method === "GET" && url.pathname === HEALTH_PATH;
}

export function createHealthResponse(): Response {
	return new Response(JSON.stringify(HEALTH_BODY), {
		status: 200,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store",
		},
	});
}
