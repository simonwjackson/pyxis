import { beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createMemoryHistory } from "@tanstack/history";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";

beforeAll(() => {
  GlobalRegistrator.register();
  window.innerWidth = 1280;
  window.innerHeight = 720;
});

describe("mountPyxis", () => {
  test("mounts into a detached host and reports the atom registry", async () => {
    const { mountPyxis } = await import("./mountPyxis");
    const host = document.createElement("div");
    const registries: AtomRegistry.AtomRegistry[] = [];
    const mounted = mountPyxis(host, {
      navigation: {
        history: createMemoryHistory({ initialEntries: ["/sandbox/queue"] }),
      },
      onRegistry: (registry) => registries.push(registry),
    });

    await eventually(() => expect(registries.length).toBeGreaterThan(0));
    expect(host.innerHTML.length).toBeGreaterThan(0);

    mounted.dispose();
    await eventually(() => expect(host.innerHTML).toBe(""));
  });
});

async function eventually(assertion: () => void): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < 1_000) {
    try {
      assertion();
      return;
    } catch (cause) {
      lastError = cause;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
