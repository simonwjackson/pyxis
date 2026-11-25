import type { McpServer } from "@modelcontextprotocol/server"
import type { PyxisClient } from "../pyxis-client"
import { registerSystem } from "./system"

export function registerTools(server: McpServer, pyxis: PyxisClient) {
  registerSystem(server, pyxis)
}
