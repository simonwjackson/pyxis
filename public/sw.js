const CACHE_NAME = "pyxis-shell-v1";
const STATIC_ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key)),
			),
		),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Network-only for API calls
	if (url.pathname.startsWith("/trpc") || url.pathname.startsWith("/ws")) {
		return;
	}

	// Cache-first for hashed static assets (JS, CSS)
	if (url.pathname.startsWith("/assets/")) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ||
					fetch(request).then((response) => {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
						return response;
					}),
			),
		);
		return;
	}

	// Cache-first for icons and images
	if (
		url.pathname.startsWith("/icons/") ||
		/\.(png|jpg|jpeg|svg|webp|gif)$/i.test(url.pathname)
	) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ||
					fetch(request).then((response) => {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
						return response;
					}),
			),
		);
		return;
	}

	// Network-first for HTML (app shell)
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
					return response;
				})
				.catch(() => caches.match("/") || caches.match(request)),
		);
		return;
	}
});
