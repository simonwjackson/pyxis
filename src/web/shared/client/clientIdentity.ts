export const CLIENT_ID_STORAGE_KEY = "pyxis.client-id.v1";
export const CLIENT_PROFILE_STORAGE_KEY = "pyxis.client-profile.v1";
export const CLIENT_PROFILE_QUERY_PARAM = "clientProfile";

export type ClientProfileName = "standard" | "wall-sonos";

export type ClientProfile = {
  readonly name: ClientProfileName;
  readonly localOutputAllowed: boolean;
  readonly sonosRequired: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const CLIENT_PROFILES: Readonly<Record<ClientProfileName, ClientProfile>> = {
  standard: {
    name: "standard",
    localOutputAllowed: true,
    sonosRequired: false,
  },
  "wall-sonos": {
    name: "wall-sonos",
    localOutputAllowed: false,
    sonosRequired: true,
  },
};

function parseClientProfileName(
  value: string | null,
): ClientProfileName | null {
  return value === "standard" || value === "wall-sonos" ? value : null;
}

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

export function resolveClientProfile(
  search: string,
  storage: StorageLike,
): ClientProfile {
  const params = new URLSearchParams(search);
  const requestedValue = params.get(CLIENT_PROFILE_QUERY_PARAM);

  if (requestedValue !== null) {
    const requestedProfile = parseClientProfileName(requestedValue);
    if (requestedProfile !== null) {
      try {
        storage.setItem(CLIENT_PROFILE_STORAGE_KEY, requestedProfile);
      } catch {
        // The explicit URL profile still applies when session storage is blocked.
      }
      return CLIENT_PROFILES[requestedProfile];
    }

    try {
      storage.removeItem(CLIENT_PROFILE_STORAGE_KEY);
    } catch {
      // Unknown profiles always resolve to the standard closed set.
    }
    return CLIENT_PROFILES.standard;
  }

  try {
    const storedProfile = parseClientProfileName(
      storage.getItem(CLIENT_PROFILE_STORAGE_KEY),
    );
    return storedProfile === null
      ? CLIENT_PROFILES.standard
      : CLIENT_PROFILES[storedProfile];
  } catch {
    return CLIENT_PROFILES.standard;
  }
}

let pageClientId: string | undefined;

export function getWebClientId(): string {
  pageClientId ??= getOrCreateClientId(window.localStorage, () =>
    window.crypto.randomUUID(),
  );
  return pageClientId;
}

export function getWebClientProfile(): ClientProfile {
  return resolveClientProfile(window.location.search, window.sessionStorage);
}
