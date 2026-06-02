import { afterEach, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SourceManager } from "@shared/sources/index.js";
import { createServerFetchHandler } from "./router.js";
import type { ServerFetchHandlerConfig } from "./types.js";

const tempDirs: string[] = [];

const log = {
  info: () => {},
  error: () => {},
};

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://pyxis.test${path}`, init);
}

function createBridge(status = 299) {
  return {
    handle: async () => new Response("bridge", { status }),
  } as ServerFetchHandlerConfig["androidMediaBridge"];
}

function createConfig(
  overrides: Partial<ServerFetchHandlerConfig> = {},
): ServerFetchHandlerConfig {
  return {
    cors: {
      origin: "http://pyxis.test:8765",
      headers: {
        "Access-Control-Allow-Origin": "http://pyxis.test:8765",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Allow-Credentials": "true",
      },
    },
    androidMediaBridge: createBridge(),
    stream: {
      log,
      resolveTrackForStream: async (id) => `ytmusic:${id}`,
      ensureSourceManager: async () => ({}) as SourceManager,
      handleStreamRequest: async () => new Response("stream"),
      prefetchToCache: async () => undefined,
    },
    rpc: {
      log,
      handleRpcRequest: async () => new Response("rpc"),
    },
    web: {
      distDir: "/tmp/pyxis-router-test-missing",
      serveStaticFiles: false,
      viteDevServer: null,
      handleViteRequest: async () => ({
        status: 404,
        headers: { "content-type": "text/plain" },
        body: new TextEncoder().encode("Not Found").buffer,
      }),
    },
    ...overrides,
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

it("answers CORS preflight before route matching", async () => {
  const fetch = createServerFetchHandler(createConfig());

  const response = await fetch(
    request("/stream/anything", { method: "OPTIONS" }),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://pyxis.test:8765",
  );
  expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
    "Range",
  );
});

it("serves health checks through the health adapter", async () => {
  const fetch = createServerFetchHandler(createConfig());

  const response = await fetch(request("/healthz"));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(await response.json()).toEqual({ service: "pyxis", status: "ok" });
});

it("routes Android bridge requests before web fallback", async () => {
  const fetch = createServerFetchHandler(
    createConfig({ androidMediaBridge: createBridge(202) }),
  );

  const response = await fetch(request("/android-media-bridge/state"));

  expect(response.status).toBe(202);
  expect(await response.text()).toBe("bridge");
});

it("normalizes /rpc/ to /rpc and applies RPC CORS headers", async () => {
  let seenPath = "";
  const fetch = createServerFetchHandler(
    createConfig({
      rpc: {
        log,
        handleRpcRequest: async (req) => {
          seenPath = new URL(req.url).pathname;
          expect(await req.text()).toBe("payload");
          return new Response("ok", { status: 201 });
        },
      },
    }),
  );

  const response = await fetch(
    request("/rpc/", { method: "POST", body: "payload" }),
  );

  expect(seenPath).toBe("/rpc");
  expect(response.status).toBe(201);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://pyxis.test:8765",
  );
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
});

it("fails stale /trpc clients closed before frontend fallback", async () => {
  const fetch = createServerFetchHandler(
    createConfig({
      web: {
        ...createConfig().web,
        viteDevServer: { middlewares: {} } as never,
        handleViteRequest: async () => ({
          status: 200,
          headers: {},
          body: new TextEncoder().encode("spa").buffer,
        }),
      },
    }),
  );

  const response = await fetch(request("/trpc/player.state"));

  expect(response.status).toBe(410);
  expect(await response.text()).toMatch(/removed\. Use \/rpc/);
});

it("passes stream range, format, and prefetch hints without changing byte behavior", async () => {
  const calls: string[] = [];
  const prefetched: string[] = [];
  const fetch = createServerFetchHandler(
    createConfig({
      stream: {
        log,
        resolveTrackForStream: async (id) => {
          calls.push(id);
          return `ytmusic:${id}`;
        },
        ensureSourceManager: async () => ({}) as SourceManager,
        handleStreamRequest: async (
          _manager,
          compositeId,
          rangeHeader,
          options,
        ) => {
          expect(compositeId).toBe("ytmusic:current");
          expect(rangeHeader).toBe("bytes=1-2");
          expect(options?.requestedFormat).toBe("mp3");
          return new Response("partial", { status: 206 });
        },
        prefetchToCache: async (_manager, compositeId) => {
          prefetched.push(compositeId);
        },
      },
    }),
  );

  const response = await fetch(
    request("/stream/current?next=upcoming&format=mp3", {
      headers: { Range: "bytes=1-2" },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(response.status).toBe(206);
  expect(await response.text()).toBe("partial");
  expect(calls).toEqual(["current", "upcoming"]);
  expect(prefetched).toEqual(["ytmusic:upcoming"]);
});

it("rejects unsupported stream formats before resolving tracks", async () => {
  let resolved = false;
  const fetch = createServerFetchHandler(
    createConfig({
      stream: {
        ...createConfig().stream,
        resolveTrackForStream: async () => {
          resolved = true;
          return "ytmusic:anything";
        },
      },
    }),
  );

  const response = await fetch(request("/stream/current?format=flac"));

  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Unsupported format: flac");
  expect(resolved).toBe(false);
});

it("maps stream resolution failures to the public 502 stream error", async () => {
  const fetch = createServerFetchHandler(
    createConfig({
      stream: {
        ...createConfig().stream,
        resolveTrackForStream: async () => {
          throw new Error("Unknown track");
        },
      },
    }),
  );

  const response = await fetch(request("/stream/missing"));

  expect(response.status).toBe(502);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(await response.text()).toBe("Unknown track");
});

it("serves production assets and falls back to index.html", async () => {
  const distDir = await mkdtemp(`${process.cwd()}/tmp-router-dist-`);
  tempDirs.push(distDir);
  await writeFile(join(distDir, "index.html"), "<main>app</main>");
  await writeFile(join(distDir, "asset.txt"), "asset");
  const fetch = createServerFetchHandler(
    createConfig({
      web: { ...createConfig().web, distDir, serveStaticFiles: true },
    }),
  );

  const asset = await fetch(request("/asset.txt"));
  const fallback = await fetch(request("/albums/123"));

  expect(await asset.text()).toBe("asset");
  expect(await fallback.text()).toBe("<main>app</main>");
});

it("delegates dev fallback requests to Vite middleware", async () => {
  const fetch = createServerFetchHandler(
    createConfig({
      web: {
        ...createConfig().web,
        viteDevServer: { middlewares: {} } as never,
        handleViteRequest: async (_middleware, method, url, headers) => {
          expect(method).toBe("GET");
          expect(url).toBe("/albums/123?q=one");
          expect(headers.accept).toBe("text/html");
          return {
            status: 203,
            headers: { "content-type": "text/html" },
            body: new TextEncoder().encode("vite").buffer,
          };
        },
      },
    }),
  );

  const response = await fetch(
    request("/albums/123?q=one", { headers: { Accept: "text/html" } }),
  );

  expect(response.status).toBe(203);
  expect(await response.text()).toBe("vite");
});
