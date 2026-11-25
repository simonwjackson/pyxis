import type { McpServer } from "@modelcontextprotocol/server"
import type { PyxisClient } from "../../pyxis-client"
import { registerAlbums } from "./albums"
import { registerCatalog } from "./catalog"
import { registerCollections } from "./collections"
import { registerHistory } from "./history"
import { registerOrganizer } from "./organizer"

export function registerLibrary(server: McpServer, pyxis: PyxisClient) {
  registerAlbums(server, pyxis)
  registerCatalog(server, pyxis)
  registerCollections(server, pyxis)
  registerHistory(server, pyxis)
  registerOrganizer(server, pyxis)
}
