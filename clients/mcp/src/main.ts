import { serveMcp } from "./server"

// Service managers pass `--host` and `--port`; the environment is the fallback for local runs.
function flag(name: string): string | undefined {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === `--${name}`) return args[i + 1]
    if (arg?.startsWith(`--${name}=`)) return arg.slice(name.length + 3)
  }
  return undefined
}

const port = Number(flag("port") ?? process.env.PYXIS_MCP_PORT ?? "4489")
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
serveMcp({ hostname: flag("host") ?? process.env.PYXIS_MCP_HOST ?? "127.0.0.1", port, baseUrl })
