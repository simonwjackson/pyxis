import {
  RegistryProvider,
  useAtomInitialValues,
} from "@effect/atom-react";
import type { RouterHistory } from "@tanstack/history";
import { RouterProvider } from "@tanstack/react-router";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { PyxisRegistryBridge } from "./PyxisRegistryBridge";
import { createPyxisRouter, type PyxisRouter } from "./router";
import { PlaybackProvider } from "./shared/playback/PlaybackContext";
import { ThemeProvider } from "./shared/theme/ThemeContext";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary";

type AtomInitialValues = Parameters<typeof useAtomInitialValues>[0];

export interface MountPyxisData {
  readonly initialValues?: AtomInitialValues;
}

export interface MountPyxisNavigation {
  readonly history?: RouterHistory;
  readonly router?: PyxisRouter;
}

export interface MountPyxisOptions {
  readonly data?: MountPyxisData;
  readonly navigation?: MountPyxisNavigation;
  readonly beforeRouter?: ReactNode | undefined;
  readonly onRegistry?: ((registry: AtomRegistry.AtomRegistry) => void) | undefined;
}

export interface MountedPyxisSurface {
  readonly router: PyxisRouter;
  readonly dispose: () => void;
}

export function PyxisSurfaceApp({
  initialValues,
  router,
  beforeRouter,
  onRegistry,
}: {
  readonly initialValues: AtomInitialValues;
  readonly router: PyxisRouter;
  readonly beforeRouter?: ReactNode | undefined;
  readonly onRegistry?: ((registry: AtomRegistry.AtomRegistry) => void) | undefined;
}) {
  useAtomInitialValues(initialValues);
  return (
    <PlaybackProvider>
      {onRegistry ? <PyxisRegistryBridge onRegistry={onRegistry} /> : null}
      {beforeRouter}
      <RouterProvider router={router} />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          },
        }}
      />
    </PlaybackProvider>
  );
}

export function mountPyxis(
  host: HTMLElement,
  options: MountPyxisOptions = {},
): MountedPyxisSurface {
  const router =
    options.navigation?.router ??
    createPyxisRouter(
      options.navigation?.history ? { history: options.navigation.history } : {},
    );
  const root = createRoot(host);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <RegistryProvider>
            <PyxisSurfaceApp
              initialValues={options.data?.initialValues ?? []}
              router={router}
              beforeRouter={options.beforeRouter}
              onRegistry={options.onRegistry}
            />
          </RegistryProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );

  return {
    router,
    dispose: () => root.unmount(),
  };
}
