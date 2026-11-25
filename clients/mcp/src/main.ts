import { serveMcp } from "./server"

const port = Number(process.env.PYXIS_MCP_PORT ?? "4489")
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PYXIS_MCP_PORT")
const baseUrl = new URL(process.env.PYXIS_BASE_URL ?? "http://127.0.0.1:4488")
if (
  !["http:", "https:"].includes(baseUrl.protocol) ||
  baseUrl.username ||
  baseUrl.password ||
  baseUrl.pathname !== "/" ||
  baseUrl.search ||
  baseUrl.hash
)
  throw new Error("PYXIS_BASE_URL must be an HTTP(S) origin without credentials")
serveMcp({ hostname: process.env.PYXIS_MCP_HOST ?? "127.0.0.1", port, baseUrl })
