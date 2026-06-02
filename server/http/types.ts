import type { SourceManager } from "@shared/sources/index.js";
import type { ViteDevServer } from "vite";
import type { AndroidMediaBridgeHandler } from "../lib/androidMediaBridge.js";

export type ServerRouteLogger = {
  readonly info: (payload: Record<string, unknown>, message: string) => void;
  readonly error: (payload: Record<string, unknown>, message: string) => void;
};

export type CorsConfig = {
  readonly origin: string;
  readonly headers: Record<string, string>;
};

export type ViteRequestHandler = (
  middleware: ViteDevServer["middlewares"],
  method: string,
  url: string,
  headers: Record<string, string>,
) => Promise<{
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: ArrayBuffer;
}>;

export type StaticWebConfig = {
  readonly distDir: string;
  readonly serveStaticFiles: boolean;
  readonly viteDevServer: ViteDevServer | null;
  readonly handleViteRequest: ViteRequestHandler;
};

export type StreamRouteDeps = {
  readonly log: ServerRouteLogger;
  readonly resolveTrackForStream: (opaqueId: string) => Promise<string>;
  readonly ensureSourceManager: () => Promise<SourceManager>;
  readonly handleStreamRequest: (
    sourceManager: SourceManager,
    compositeId: string,
    rangeHeader: string | null,
    options?: {
      readonly abortSignal?: AbortSignal;
      readonly requestedFormat?: "mp3";
    },
  ) => Promise<Response>;
  readonly prefetchToCache: (
    sourceManager: SourceManager,
    compositeId: string,
  ) => Promise<unknown>;
};

export type RpcRouteDeps = {
  readonly log: ServerRouteLogger;
  readonly handleRpcRequest: (request: Request) => Promise<Response>;
};

export type ServerFetchHandlerConfig = {
  readonly cors: CorsConfig;
  readonly androidMediaBridge: AndroidMediaBridgeHandler;
  readonly stream: StreamRouteDeps;
  readonly rpc: RpcRouteDeps;
  readonly web: StaticWebConfig;
};

export type ServerRouteContext = {
  readonly req: Request;
  readonly url: URL;
  readonly cors: CorsConfig;
};

export type ServerRouteAdapter = (
  context: ServerRouteContext,
) => Response | null | Promise<Response | null>;
