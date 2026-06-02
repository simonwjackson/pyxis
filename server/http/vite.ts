import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { ViteDevServer } from "vite";

export type ViteMiddlewareResult = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: ArrayBuffer;
};

function copyArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copied = new Uint8Array(buffer.length);
  copied.set(buffer);
  return copied.buffer;
}

function collectHeaders(res: ServerResponse): Record<string, string> {
  const responseHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.getHeaders())) {
    if (value != null) responseHeaders[key] = String(value);
  }
  return responseHeaders;
}

function appendChunk(chunks: Buffer[], chunk?: string | Uint8Array): void {
  if (!chunk) return;
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

function responseResult(
  res: ServerResponse,
  chunks: readonly Buffer[],
): ViteMiddlewareResult {
  return {
    status: res.statusCode,
    headers: collectHeaders(res),
    body: copyArrayBuffer(Buffer.concat(chunks)),
  };
}

function viteNotFoundResult(): ViteMiddlewareResult {
  return {
    status: 404,
    headers: { "content-type": "text/plain" },
    body: new TextEncoder().encode("Not Found").buffer,
  };
}

function incomingMessage(
  method: string,
  url: string,
  headers: Record<string, string>,
): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  req.url = url;
  req.headers = {};
  for (const [key, value] of Object.entries(headers)) {
    req.headers[key.toLowerCase()] = value;
  }
  req.push(null);
  return req;
}

/** Bridge a web request through Vite's Connect middleware stack. */
export function handleViteRequest(
  middleware: ViteDevServer["middlewares"],
  method: string,
  url: string,
  headers: Record<string, string>,
): Promise<ViteMiddlewareResult> {
  return new Promise((resolve, reject) => {
    const req = incomingMessage(method, url, headers);
    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    res.write = ((chunk: string | Uint8Array) => {
      appendChunk(chunks, chunk);
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: string | Uint8Array) => {
      appendChunk(chunks, chunk);
      resolve(responseResult(res, chunks));
      return res;
    }) as typeof res.end;

    middleware.handle(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve(viteNotFoundResult());
    });
  });
}
