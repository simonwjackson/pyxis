import { beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NowPlayingVolumeControl } from "./NowPlayingVolumeControl";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    GlobalRegistrator.register();
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("NowPlayingVolumeControl", () => {
  test("exposes the canonical volume and emits user changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const changes: number[] = [];

    await act(async () => {
      root.render(
        <NowPlayingVolumeControl
          volume={37}
          onVolumeChange={(volume) => changes.push(volume)}
        />,
      );
    });

    const slider = host.querySelector<HTMLInputElement>(
      'input[aria-label="Volume"]',
    );
    expect(slider?.value).toBe("37");
    expect(host.textContent).toContain("37%");

    await act(async () => {
      if (!slider) throw new Error("volume slider not rendered");
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) throw new Error("input value setter unavailable");
      valueSetter.call(slider, "42");
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
    });

    expect(changes).toEqual([42]);
    await act(async () => root.unmount());
    host.remove();
  });
});
