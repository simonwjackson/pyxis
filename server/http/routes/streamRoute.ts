import type { ServerRouteAdapter, StreamRouteDeps } from "../types.js";

type StreamRequest = {
  readonly opaqueId: string;
  readonly rangeHeader: string | null;
  readonly decodedNextHint: string | null;
  readonly requestedFormat?: "mp3";
};

function parseRequestedFormat(
  value: string | null,
): "mp3" | Response | undefined {
  if (value === null) return undefined;
  if (value === "mp3") return "mp3";
  return new Response(`Unsupported format: ${value}`, {
    status: 400,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

function parseStreamRequest(req: Request, url: URL): StreamRequest | Response {
  const requestedFormat = parseRequestedFormat(url.searchParams.get("format"));
  if (requestedFormat instanceof Response) return requestedFormat;

  const nextHint = url.searchParams.get("next");
  return {
    opaqueId: decodeURIComponent(url.pathname.slice("/stream/".length)),
    rangeHeader: req.headers.get("range"),
    decodedNextHint: nextHint ? decodeURIComponent(nextHint) : null,
    ...(requestedFormat ? { requestedFormat } : {}),
  };
}

function logIncoming(deps: StreamRouteDeps, stream: StreamRequest): void {
  deps.log.info(
    {
      opaqueId: stream.opaqueId,
      range: stream.rangeHeader ?? "none",
      next: stream.decodedNextHint ?? "none",
      format: stream.requestedFormat ?? "none",
    },
    "incoming",
  );
}

function prefetchNextHint(
  deps: StreamRouteDeps,
  sourceManager: Awaited<ReturnType<StreamRouteDeps["ensureSourceManager"]>>,
  decodedNextHint: string | null,
): void {
  if (!decodedNextHint) return;
  void deps
    .resolveTrackForStream(decodedNextHint)
    .then((nextCompositeId) =>
      deps.prefetchToCache(sourceManager, nextCompositeId),
    )
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      deps.log.error({ next: decodedNextHint, err: msg }, "prefetch error");
    });
}

function streamErrorResponse(
  deps: StreamRouteDeps,
  opaqueId: string,
  err: unknown,
): Response {
  const message = err instanceof Error ? err.message : "Stream error";
  deps.log.error({ opaqueId, err: message }, "stream error");
  return new Response(message, {
    status: 502,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export function createStreamRoute(deps: StreamRouteDeps): ServerRouteAdapter {
  return async ({ req, url }) => {
    if (!url.pathname.startsWith("/stream/")) return null;

    const stream = parseStreamRequest(req, url);
    if (stream instanceof Response) return stream;
    logIncoming(deps, stream);

    try {
      const compositeId = await deps.resolveTrackForStream(stream.opaqueId);
      const sourceManager = await deps.ensureSourceManager();
      prefetchNextHint(deps, sourceManager, stream.decodedNextHint);
      return await deps.handleStreamRequest(
        sourceManager,
        compositeId,
        stream.rangeHeader,
        {
          abortSignal: req.signal,
          ...(stream.requestedFormat
            ? { requestedFormat: stream.requestedFormat }
            : {}),
        },
      );
    } catch (err: unknown) {
      return streamErrorResponse(deps, stream.opaqueId, err);
    }
  };
}
