import type { AndroidMediaBridgeHandler } from "../../lib/androidMediaBridge.js";
import { isAndroidMediaBridgeRequest } from "../../lib/androidMediaBridge.js";
import type { ServerRouteAdapter } from "../types.js";

export function createAndroidMediaBridgeRoute(
  androidMediaBridge: AndroidMediaBridgeHandler,
): ServerRouteAdapter {
  return ({ req, url }) =>
    isAndroidMediaBridgeRequest(url) ? androidMediaBridge.handle(req) : null;
}
