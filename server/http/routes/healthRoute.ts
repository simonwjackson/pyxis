import { createHealthResponse, isHealthRequest } from "../../lib/health.js";
import type { ServerRouteAdapter } from "../types.js";

export function createHealthRoute(): ServerRouteAdapter {
  return ({ req, url }) =>
    isHealthRequest(url, req.method) ? createHealthResponse() : null;
}
