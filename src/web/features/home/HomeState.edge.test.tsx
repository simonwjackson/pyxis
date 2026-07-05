import { beforeAll, describe, expect, test } from "bun:test";
import { RegistryProvider, useAtomInitialValues, useAtomValue } from "@effect/atom-react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot } from "react-dom/client";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { HomeState } from "./HomeState";
import {
  homeSourceAtom,
  makeHomeFixtureSource,
  type HomeFixtureState,
} from "./homeSource";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    GlobalRegistrator.register();
  }
});

describe("Home source edge", () => {
  test.each([
    ["Ready", "Ready"],
    ["Empty", "Ready"],
    ["LoadError", "LoadError"],
    ["Defect", "Defect"],
  ] as const)("pins %s through the real source atom", async (fixture, tag) => {
    const observed = await readDiscoveryShelfTag(fixture);
    expect(observed).toBe(tag);
  });
});

async function readDiscoveryShelfTag(
  fixture: HomeFixtureState,
): Promise<string> {
  const host = document.createElement("div");
  let observed: string | null = null;
  const root = createRoot(host);
  root.render(
    <RegistryProvider>
      <Probe
        fixture={fixture}
        onState={(tag) => {
          observed = tag;
        }}
      />
    </RegistryProvider>,
  );

  await eventually(() => expect(observed).not.toBeNull());
  root.unmount();
  return observed ?? "missing";
}

function Probe({
  fixture,
  onState,
}: {
  readonly fixture: HomeFixtureState;
  readonly onState: (tag: string) => void;
}) {
  useAtomInitialValues([[homeSourceAtom, makeHomeFixtureSource(fixture)]]);
  const source = useAtomValue(homeSourceAtom);
  const result = projectQueryResult(useAtomValue(source.discoveryAlbumsQueryAtom));
  const state = HomeState.albumShelfFromResult(result);
  onState(state._tag);
  return null;
}

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
