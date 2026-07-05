/**
 * @module mountCoverflow
 *
 * Standalone mount for the Queue cover-flow surface so Caliper can render it as
 * its own lab surface (`themeId=coverflow`) at true device size, isolated from
 * the full Pyxis app shell/router. It is the real page component reading the
 * real swappable source edge — only the surrounding chrome is omitted.
 */

import { QueueCoverflowPage } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowPage";
import { RegistryProvider, useAtomInitialValues } from "@effect/atom-react";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PyxisRegistryBridge } from "../PyxisRegistryBridge";
import { ThemeProvider } from "../shared/theme/ThemeContext";

type AtomInitialValues = Parameters<typeof useAtomInitialValues>[0];

export interface MountCoverflowOptions {
  readonly initialValues?: AtomInitialValues;
  readonly onRegistry?:
    | ((registry: AtomRegistry.AtomRegistry) => void)
    | undefined;
}

export interface MountedCoverflow {
  readonly dispose: () => void;
}

function CoverflowSurfaceApp({
  initialValues,
  onRegistry,
}: {
  readonly initialValues: AtomInitialValues;
  readonly onRegistry?:
    | ((registry: AtomRegistry.AtomRegistry) => void)
    | undefined;
}) {
  useAtomInitialValues(initialValues);
  return (
    <>
      {onRegistry ? <PyxisRegistryBridge onRegistry={onRegistry} /> : null}
      <QueueCoverflowPage />
    </>
  );
}

export function mountCoverflow(
  host: HTMLElement,
  options: MountCoverflowOptions = {},
): MountedCoverflow {
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <ThemeProvider>
        <RegistryProvider>
          <CoverflowSurfaceApp
            initialValues={options.initialValues ?? []}
            onRegistry={options.onRegistry}
          />
        </RegistryProvider>
      </ThemeProvider>
    </StrictMode>,
  );
  return {
    dispose: () => root.unmount(),
  };
}
