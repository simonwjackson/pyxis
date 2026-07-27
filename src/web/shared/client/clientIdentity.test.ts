import { describe, expect, it } from "bun:test";
import {
  CLIENT_ID_STORAGE_KEY,
  getOrCreateClientId,
  LEGACY_CLIENT_PROFILE_STORAGE_KEY,
  migrateLegacyClientProfile,
  resolveBootstrappedClientMode,
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

describe("first-class client modes", () => {
  it("uses only the server-injected Player or Console mode", () => {
    expect(resolveBootstrappedClientMode("player")).toBe("player");
    expect(resolveBootstrappedClientMode("console")).toBe("console");
    expect(resolveBootstrappedClientMode("wall-sonos")).toBe("player");
    expect(resolveBootstrappedClientMode(undefined)).toBe("player");
  });

  it("removes the legacy query and session profile without applying it", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_CLIENT_PROFILE_STORAGE_KEY, "wall-sonos");
    const replaced: string[] = [];

    migrateLegacyClientProfile(
      new URL(
        "https://pyxis.example/albums/one?clientProfile=wall-sonos&sort=new#tracks",
      ),
      storage,
      (url) => replaced.push(url),
    );

    expect(storage.getItem(LEGACY_CLIENT_PROFILE_STORAGE_KEY)).toBeNull();
    expect(replaced).toEqual(["/albums/one?sort=new#tracks"]);
  });
});
