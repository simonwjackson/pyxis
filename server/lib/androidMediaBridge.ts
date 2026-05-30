import type {
  AndroidMediaBridgeCommandResult,
  AndroidMediaBridgeState,
} from "../../src/api/contracts/androidMediaBridge.js";
import type { AppConfig } from "../../src/config.js";
import { createLogger } from "../../src/logger.js";
import * as PlayerService from "../services/player.js";
import {
  parseNativeBridgeLogPayload,
  writeNativeBridgeLog,
} from "./androidMediaBridgeLog.js";
import { toAndroidMediaBridgeState } from "./androidMediaBridgeState.js";
import { toPlayerStateView } from "./playerStateView.js";

const BRIDGE_PREFIX = "/android-media-bridge";
const TOKEN_HEADER = "x-pyxis-bridge-token";
const MAX_COMMAND_BYTES = 4096;
const MAX_LOG_BYTES = 8192;
const DEFAULT_COMMAND_LIMIT = { max: 12, windowMs: 1000 } as const;

const log = createLogger("playback").child({ component: "android-bridge" });

export type AndroidMediaBridgeConfig = AppConfig["androidBridge"] & {
  readonly now?: () => number;
  readonly commandLimit?: { readonly max: number; readonly windowMs: number };
};

export function isAndroidMediaBridgeRequest(url: URL): boolean {
  return (
    url.pathname === BRIDGE_PREFIX ||
    url.pathname.startsWith(`${BRIDGE_PREFIX}/`)
  );
}

export function createAndroidMediaBridge(
  config: AndroidMediaBridgeConfig,
): AndroidMediaBridgeHandler {
  return new AndroidMediaBridgeHandler(config);
}

export class AndroidMediaBridgeHandler {
  private readonly token: string | undefined;
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly commandLimit: {
    readonly max: number;
    readonly windowMs: number;
  };
  private commandWindowStartedAt = 0;
  private commandCount = 0;
  private lastStateIdentity = "";
  private stateRevision = 0;

  constructor(config: AndroidMediaBridgeConfig) {
    this.enabled = config.enabled;
    this.token = config.token;
    this.now = config.now ?? Date.now;
    this.commandLimit = config.commandLimit ?? DEFAULT_COMMAND_LIMIT;
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (!isAndroidMediaBridgeRequest(url)) return notFound();
    if (!this.enabled || !this.token) return notFound();
    const unauthorized = this.authorize(req);
    if (unauthorized) return unauthorized;

    if (url.pathname === `${BRIDGE_PREFIX}/state` && req.method === "GET") {
      return jsonResponse(this.projectState());
    }

    if (url.pathname === `${BRIDGE_PREFIX}/events` && req.method === "GET") {
      return this.eventFeed();
    }

    if (url.pathname === `${BRIDGE_PREFIX}/commands` && req.method === "POST") {
      return this.command(req);
    }

    if (url.pathname === `${BRIDGE_PREFIX}/logs` && req.method === "POST") {
      return this.nativeLog(req);
    }

    return notFound();
  }

  private authorize(req: Request): Response | null {
    const provided = req.headers.get(TOKEN_HEADER);
    if (provided !== this.token) {
      log.warn(
        {
          method: req.method,
          path: new URL(req.url).pathname,
          origin: req.headers.get("origin") ?? "none",
        },
        "bridge unauthorized",
      );
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    return null;
  }

  private projectState(): AndroidMediaBridgeState {
    const view = toPlayerStateView(PlayerService.getState());
    const identity = `${view.status}:${view.currentTrack?.id ?? "none"}:${view.updatedAt}`;
    if (identity !== this.lastStateIdentity) {
      this.lastStateIdentity = identity;
      this.stateRevision += 1;
    }
    const publishedAt = this.now();
    const audio = PlayerService.getAudioRealization();
    return toAndroidMediaBridgeState(view, {
      publishedAt,
      stateRevision: this.stateRevision,
      audio,
    });
  }

  private eventFeed(): Response {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const sendState = () => {
          controller.enqueue(
            encoder.encode(formatSse("state", this.projectState())),
          );
        };
        sendState();
        unsubscribe = PlayerService.subscribe(sendState);
      },
      cancel: () => {
        unsubscribe?.();
        unsubscribe = null;
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    });
  }

  private async command(req: Request): Promise<Response> {
    if (!this.consumeCommandSlot()) {
      log.warn(
        { path: new URL(req.url).pathname },
        "bridge command rate limited",
      );
      return jsonResponse({ error: "rate_limited" }, 429);
    }
    const payload = await readJson(req, MAX_COMMAND_BYTES);
    if (!payload.ok) return jsonResponse({ error: payload.error }, 400);
    const command = parseCommand(payload.value);
    if (!command.ok) return jsonResponse({ error: command.error }, 400);

    const before = PlayerService.getState();
    let outcome: AndroidMediaBridgeCommandResult["outcome"] = "noop";
    switch (command.value.action) {
      case "pause":
        if (before.status === "playing") {
          PlayerService.pause();
          outcome = "applied";
        }
        break;
      case "play":
        if (before.status === "paused") {
          PlayerService.resume();
          outcome = "applied";
        } else if (before.status === "stopped") {
          outcome = "unavailable";
        }
        break;
      case "next": {
        const next = before.currentTrack ? PlayerService.skip() : undefined;
        outcome =
          next || PlayerService.getState().status === "stopped"
            ? "applied"
            : "unavailable";
        break;
      }
      case "previous": {
        const previous = before.currentTrack
          ? PlayerService.previousTrack()
          : undefined;
        outcome = previous ? "applied" : "unavailable";
        break;
      }
    }

    const result: AndroidMediaBridgeCommandResult = {
      outcome,
      state: this.projectState(),
      correlationId: command.value.correlationId,
    };
    log.info(
      {
        action: command.value.action,
        outcome,
        source: command.value.source,
        correlationId: command.value.correlationId,
      },
      "bridge command",
    );
    return jsonResponse(result);
  }

  private async nativeLog(req: Request): Promise<Response> {
    const payload = await readJson(req, MAX_LOG_BYTES);
    if (!payload.ok) return jsonResponse({ error: payload.error }, 400);
    const parsed = parseNativeBridgeLogPayload(payload.value);
    if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
    writeNativeBridgeLog(parsed.value);
    return jsonResponse({ ok: true });
  }

  private consumeCommandSlot(): boolean {
    const now = this.now();
    if (now - this.commandWindowStartedAt > this.commandLimit.windowMs) {
      this.commandWindowStartedAt = now;
      this.commandCount = 0;
    }
    this.commandCount += 1;
    return this.commandCount <= this.commandLimit.max;
  }
}

function parseCommand(payload: unknown):
  | {
      readonly ok: true;
      readonly value: {
        readonly action: "play" | "pause" | "next" | "previous";
        readonly correlationId: string;
        readonly source: string;
      };
    }
  | { readonly ok: false; readonly error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false, error: "payload must be an object" };
  const object = payload as Record<string, unknown>;
  const allowedKeys = new Set(["action", "correlationId", "source"]);
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key))
      return { ok: false, error: `unknown field: ${key}` };
  }
  const action = object.action;
  if (
    action !== "play" &&
    action !== "pause" &&
    action !== "next" &&
    action !== "previous"
  ) {
    return { ok: false, error: "invalid action" };
  }
  const correlationId =
    typeof object.correlationId === "string" &&
    object.correlationId.length <= 120
      ? object.correlationId
      : crypto.randomUUID();
  const source =
    typeof object.source === "string" && object.source.length <= 120
      ? object.source
      : "android";
  return { ok: true, value: { action, correlationId, source } };
}

async function readJson(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const text = await req.text();
  if (text.length > maxBytes) return { ok: false, error: "payload too large" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "invalid json" };
  }
}

function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function notFound(): Response {
  return new Response("Not Found", { status: 404 });
}
