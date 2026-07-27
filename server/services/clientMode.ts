import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  ApiClientMode,
  ApiClientModeAuthorization,
} from "@shared/api/contracts/clientMode.js";
import { DB_DIR } from "@shared/db/config.js";

export const CLIENT_MODE_HEADER = "x-pyxis-client-mode";
export const CLIENT_MODE_COOKIE = "pyxis_client_mode";
export const CLIENT_MODE_SECRET_PATH = join(DB_DIR, "client-mode-signing-key");

const COOKIE_PURPOSE = "client-mode-cookie-v1";
const AUTHORIZATION_PURPOSE = "client-output-authorization-v1";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type ResolvedClientMode = {
  readonly mode: ApiClientMode;
  readonly setCookie: string;
};

export type ClientModeAuthority = {
  readonly resolveDocumentMode: (request: Request) => ResolvedClientMode;
  readonly authorizeClient: (
    request: Request,
    clientId: string,
  ) => ApiClientModeAuthorization | undefined;
  readonly verifyPlayerAuthorization: (
    authorization: string,
    clientId: string,
  ) => boolean;
};

type SignedPayload = {
  readonly purpose: string;
  readonly mode: ApiClientMode;
  readonly clientId?: string;
};

function parseMode(value: string | null): ApiClientMode | undefined {
  return value === "player" || value === "console" ? value : undefined;
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const item of cookie.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim();
  }
  return undefined;
}

function loadOrCreateSecret(path = CLIENT_MODE_SECRET_PATH): Buffer {
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8").trim();
    if (/^[a-f0-9]{64}$/i.test(existing)) return Buffer.from(existing, "hex");
    throw new Error("Pyxis client-mode signing key is malformed");
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const value = randomBytes(32);
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, value.toString("hex"), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  try {
    renameSync(temporary, path);
  } catch (error) {
    if (!existsSync(path)) throw error;
    return loadOrCreateSecret(path);
  }
  return value;
}

function encodePayload(payload: SignedPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function createClientModeAuthority(
  secret: Uint8Array,
): ClientModeAuthority {
  const authorizedModes = new Map<string, ApiClientMode>();
  const sign = (payload: SignedPayload): string => {
    const encoded = encodePayload(payload);
    const signature = createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  };

  const verify = (token: string): SignedPayload | undefined => {
    const separator = token.lastIndexOf(".");
    if (separator <= 0) return undefined;
    const encoded = token.slice(0, separator);
    const supplied = token.slice(separator + 1);
    const expected = createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      return undefined;
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as Partial<SignedPayload>;
      const mode = parseMode(typeof decoded.mode === "string" ? decoded.mode : null);
      if (!mode || typeof decoded.purpose !== "string") return undefined;
      if (
        decoded.clientId !== undefined &&
        typeof decoded.clientId !== "string"
      ) {
        return undefined;
      }
      return {
        purpose: decoded.purpose,
        mode,
        ...(decoded.clientId === undefined
          ? {}
          : { clientId: decoded.clientId }),
      };
    } catch {
      return undefined;
    }
  };

  const modeForRequest = (
    request: Request,
    allowEnrollmentHeader: boolean,
  ): ApiClientMode => {
    if (
      allowEnrollmentHeader &&
      request.headers.get("sec-fetch-dest") === "document"
    ) {
      const requested = parseMode(request.headers.get(CLIENT_MODE_HEADER));
      if (requested) return requested;
    }
    const token = cookieValue(request, CLIENT_MODE_COOKIE);
    if (!token) return "player";
    const payload = verify(token);
    return payload?.purpose === COOKIE_PURPOSE ? payload.mode : "player";
  };

  return {
    resolveDocumentMode: (request) => {
      const mode = modeForRequest(request, true);
      const credential = sign({ purpose: COOKIE_PURPOSE, mode });
      return {
        mode,
        setCookie: [
          `${CLIENT_MODE_COOKIE}=${credential}`,
          "Path=/",
          "Max-Age=31536000",
          "HttpOnly",
          "Secure",
          "SameSite=Strict",
        ].join("; "),
      };
    },
    authorizeClient: (request, clientId) => {
      if (!CLIENT_ID_PATTERN.test(clientId)) return undefined;
      const mode = modeForRequest(request, false);
      authorizedModes.set(clientId, mode);
      return {
        mode,
        authorization: sign({
          purpose: AUTHORIZATION_PURPOSE,
          mode,
          clientId,
        }),
      };
    },
    verifyPlayerAuthorization: (authorization, clientId) => {
      if (!CLIENT_ID_PATTERN.test(clientId)) return false;
      const payload = verify(authorization);
      return (
        payload?.purpose === AUTHORIZATION_PURPOSE &&
        payload.mode === "player" &&
        payload.clientId === clientId &&
        authorizedModes.get(clientId) === "player"
      );
    },
  };
}

let persistentAuthority: ClientModeAuthority | undefined;

export function createPersistentClientModeAuthority(): ClientModeAuthority {
  persistentAuthority ??= createClientModeAuthority(loadOrCreateSecret());
  return persistentAuthority;
}
