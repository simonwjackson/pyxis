import { describe, expect, it } from "bun:test";
import {
  CLIENT_ID_STORAGE_KEY,
  CLIENT_PROFILE_STORAGE_KEY,
  getOrCreateClientId,
  resolveClientProfile,
} from "./clientIdentity.js";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("web client identity", () => {
  it("persists one stable random client ID in local storage", () => {
    const storage = new MemoryStorage();
    let randomCalls = 0;
    const randomUuid = () => {
      randomCalls += 1;
      return "12345678-1234-4234-8234-123456789abc";
    };

    const first = getOrCreateClientId(storage, randomUuid);
    const second = getOrCreateClientId(storage, randomUuid);

    expect(first).toBe("client_12345678123442348234123456789abc");
    expect(second).toBe(first);
    expect(storage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(first);
    expect(randomCalls).toBe(1);
  });

  it("replaces malformed persisted client IDs", () => {
    const storage = new MemoryStorage();
    storage.setItem(CLIENT_ID_STORAGE_KEY, "../../not-a-client");

    expect(
      getOrCreateClientId(
        storage,
        () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      ),
    ).toBe("client_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee");
  });
});

describe("closed web client profiles", () => {
  it("makes wall-sonos explicitly Sonos-only", () => {
    const storage = new MemoryStorage();

    expect(resolveClientProfile("?clientProfile=wall-sonos", storage)).toEqual({
      name: "wall-sonos",
      localOutputAllowed: false,
      sonosRequired: true,
    });
    expect(storage.getItem(CLIENT_PROFILE_STORAGE_KEY)).toBe("wall-sonos");
  });

  it("restores the selected profile from session storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(CLIENT_PROFILE_STORAGE_KEY, "wall-sonos");

    expect(resolveClientProfile("", storage).name).toBe("wall-sonos");
  });

  it("does not permit unknown URL or stored profiles", () => {
    const storage = new MemoryStorage();
    storage.setItem(CLIENT_PROFILE_STORAGE_KEY, "wall-sonos");

    expect(
      resolveClientProfile("?clientProfile=administrator", storage),
    ).toEqual({
      name: "standard",
      localOutputAllowed: true,
      sonosRequired: false,
    });
    expect(storage.getItem(CLIENT_PROFILE_STORAGE_KEY)).toBeNull();

    storage.setItem(CLIENT_PROFILE_STORAGE_KEY, "unknown");
    expect(resolveClientProfile("", storage).name).toBe("standard");
  });

  it("allows an explicit standard profile to leave kiosk mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(CLIENT_PROFILE_STORAGE_KEY, "wall-sonos");

    expect(resolveClientProfile("?clientProfile=standard", storage).name).toBe(
      "standard",
    );
    expect(storage.getItem(CLIENT_PROFILE_STORAGE_KEY)).toBe("standard");
  });
});
