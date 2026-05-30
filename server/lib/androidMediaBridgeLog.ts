import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({
  component: "android-bridge-native",
});

const ALLOWED_EVENTS = new Set([
  "bridge_started",
  "bridge_stopped",
  "bridge_state_received",
  "bridge_state_stale",
  "command_sent",
  "command_acknowledged",
  "command_rejected",
  "controller_connected",
  "feed_disconnected",
  "feed_reconnected",
]);

const ALLOWED_LEVELS = new Set(["debug", "info", "warn", "error"]);
const MAX_MESSAGE_LENGTH = 500;
const MAX_FIELD_LENGTH = 300;
const MAX_FIELDS = 16;
const SENSITIVE_KEY =
  /(token|secret|password|credential|streamurl|stream_url|authorization)/i;
const URL_SHAPED = /^https?:\/\//i;

type NativeBridgeLog = {
  readonly event: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message?: string;
  readonly correlationId?: string;
  readonly fields?: Record<string, string | number | boolean | null>;
};

type ParseFailure = { readonly ok: false; readonly error: string };
type ParseResult =
  | { readonly ok: true; readonly value: NativeBridgeLog }
  | ParseFailure;

export function parseNativeBridgeLogPayload(payload: unknown): ParseResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "payload must be an object" };
  }
  const object = payload as Record<string, unknown>;
  const allowedKeys = new Set([
    "event",
    "level",
    "message",
    "correlationId",
    "fields",
  ]);
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key))
      return { ok: false, error: `unknown field: ${key}` };
  }

  const event = object.event;
  if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    return { ok: false, error: "unknown event" };
  }
  const rawLevel = object.level ?? "info";
  if (typeof rawLevel !== "string" || !ALLOWED_LEVELS.has(rawLevel)) {
    return { ok: false, error: "invalid level" };
  }

  const message = boundedOptionalString(
    object.message,
    MAX_MESSAGE_LENGTH,
    "message",
  );
  if (!message.ok) return message;
  const correlationId = boundedOptionalString(
    object.correlationId,
    120,
    "correlationId",
  );
  if (!correlationId.ok) return correlationId;
  const fields = parseFields(object.fields);
  if (!fields.ok) return fields;

  return {
    ok: true,
    value: {
      event,
      level: rawLevel as NativeBridgeLog["level"],
      ...(message.value !== undefined
        ? { message: redactString(message.value, "message") }
        : {}),
      ...(correlationId.value !== undefined
        ? { correlationId: correlationId.value }
        : {}),
      ...(fields.value !== undefined ? { fields: fields.value } : {}),
    },
  };
}

export function writeNativeBridgeLog(entry: NativeBridgeLog): void {
  const data = {
    event: entry.event,
    correlationId: entry.correlationId,
    fields: entry.fields,
    message: entry.message,
  };
  switch (entry.level) {
    case "debug":
      log.debug(data, "native bridge log");
      break;
    case "warn":
      log.warn(data, "native bridge log");
      break;
    case "error":
      log.error(data, "native bridge log");
      break;
    case "info":
      log.info(data, "native bridge log");
      break;
  }
}

function boundedOptionalString(
  value: unknown,
  maxLength: number,
  field: string,
): ParseFailure | { ok: true; value?: string } {
  if (value === undefined) return { ok: true };
  if (typeof value !== "string")
    return { ok: false, error: `${field} must be a string` };
  if (value.length > maxLength)
    return { ok: false, error: `${field} too long` };
  return { ok: true, value };
}

function parseFields(
  value: unknown,
):
  | ParseFailure
  | { ok: true; value?: Record<string, string | number | boolean | null> } {
  if (value === undefined) return { ok: true };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "fields must be an object" };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_FIELDS)
    return { ok: false, error: "too many fields" };
  const fields: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of entries) {
    if (key.length > 80) return { ok: false, error: "field key too long" };
    if (raw === null || typeof raw === "number" || typeof raw === "boolean") {
      fields[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : raw;
      continue;
    }
    if (typeof raw !== "string")
      return { ok: false, error: "invalid field value" };
    if (raw.length > MAX_FIELD_LENGTH)
      return { ok: false, error: "field value too long" };
    fields[key] = redactString(raw, key);
  }
  return { ok: true, value: fields };
}

function redactString(value: string, key: string): string {
  if (SENSITIVE_KEY.test(key) || URL_SHAPED.test(value)) return "[redacted]";
  return value;
}
