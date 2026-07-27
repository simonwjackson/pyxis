import type {
  ApiClientMode,
  ApiClientModeAuthorization,
} from "../../../api/contracts/clientMode.js";

export const CLIENT_ID_STORAGE_KEY = "pyxis.client-id.v1";
export const LEGACY_CLIENT_PROFILE_STORAGE_KEY = "pyxis.client-profile.v1";
export const LEGACY_CLIENT_PROFILE_QUERY_PARAM = "clientProfile";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

declare global {
  interface Window {
    __PYXIS_CLIENT_MODE__?: ApiClientMode;
  }
}

export type ClientMode = ApiClientMode;

export function getOrCreateClientId(
  storage: Pick<StorageLike, "getItem" | "setItem">,
  randomUuid: () => string,
): string {
  try {
    const stored = storage.getItem(CLIENT_ID_STORAGE_KEY);
    if (stored !== null && CLIENT_ID_PATTERN.test(stored)) return stored;
  } catch {
    // Storage can be disabled. The browser accessor below retains a page-stable ID.
  }

  const generated = `client_${randomUuid().replaceAll("-", "")}`;
  try {
    storage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  } catch {
    // The in-memory browser accessor remains stable for this page lifecycle.
  }
  return generated;
}

export function migrateLegacyClientProfile(
  currentUrl: URL,
  storage: Pick<StorageLike, "removeItem">,
  replaceUrl: (url: string) => void,
): void {
  try {
    storage.removeItem(LEGACY_CLIENT_PROFILE_STORAGE_KEY);
  } catch {
    // Migration remains best-effort when session storage is unavailable.
  }
  if (!currentUrl.searchParams.has(LEGACY_CLIENT_PROFILE_QUERY_PARAM)) return;
  currentUrl.searchParams.delete(LEGACY_CLIENT_PROFILE_QUERY_PARAM);
  replaceUrl(`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}

export function resolveBootstrappedClientMode(value: unknown): ClientMode {
  return value === "console" ? "console" : "player";
}

let pageClientId: string | undefined;
let pageAuthorization: ApiClientModeAuthorization | undefined;
let authorizationPromise: Promise<ApiClientModeAuthorization> | undefined;

export function getWebClientId(): string {
  pageClientId ??= getOrCreateClientId(window.localStorage, () =>
    window.crypto.randomUUID(),
  );
  return pageClientId;
}

export function getWebClientMode(): ClientMode {
  return resolveBootstrappedClientMode(window.__PYXIS_CLIENT_MODE__);
}

export async function initializeWebClientAuthorization(
  fetchImpl: typeof fetch = fetch,
): Promise<ApiClientModeAuthorization> {
  if (pageAuthorization) return pageAuthorization;
  authorizationPromise ??= (async () => {
    const clientId = getWebClientId();
    const response = await fetchImpl(
      `/client-mode/authorize?clientId=${encodeURIComponent(clientId)}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Client mode authorization failed (${response.status})`);
    }
    const value =
      (await response.json()) as Partial<ApiClientModeAuthorization>;
    if (
      (value.mode !== "player" && value.mode !== "console") ||
      typeof value.authorization !== "string" ||
      value.authorization.length < 20
    ) {
      throw new Error("Client mode authorization response is invalid");
    }
    const bootstrappedMode = getWebClientMode();
    if (value.mode !== bootstrappedMode) {
      throw new Error("Client mode authorization does not match document mode");
    }
    pageAuthorization = {
      mode: value.mode,
      authorization: value.authorization,
    };
    return pageAuthorization;
  })();
  return authorizationPromise;
}

export function getWebClientAuthorization(): string {
  if (!pageAuthorization) {
    throw new Error("Client mode authorization was not initialized");
  }
  return pageAuthorization.authorization;
}
