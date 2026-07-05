import type { RouterHistory } from "@tanstack/history";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes/routeTree.gen";

export interface CreatePyxisRouterOptions {
  readonly history?: RouterHistory;
}

export function createPyxisRouter(options: CreatePyxisRouterOptions = {}) {
  return createRouter({
    routeTree,
    ...(options.history ? { history: options.history } : {}),
  });
}

export type PyxisRouter = ReturnType<typeof createPyxisRouter>;

const registeredRouter = createPyxisRouter();

declare module "@tanstack/react-router" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    router: typeof registeredRouter;
  }
}
