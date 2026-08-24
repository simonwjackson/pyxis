import dgram from "node:dgram"

const SSDP_ADDRESS = "239.255.255.250"
const SSDP_PORT = 1900
const SEARCH_TARGET = "urn:schemas-upnp-org:device:ZonePlayer:1"

export interface SsdpDiscovery {
  discover(timeoutMs: number): Promise<readonly string[]>
}

export function createSsdpDiscovery(): SsdpDiscovery {
  return { discover: discoverSsdpLocations }
}

export async function discoverSsdpLocations(timeoutMs: number): Promise<readonly string[]> {
  return new Promise((resolve) => {
    const locations = new Set<string>()
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true })
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // Socket errors can race the timeout.
      }
      resolve([...locations].sort())
    }
    const timer = setTimeout(finish, timeoutMs)

    socket.on("message", (message) => {
      const location = locationFromSsdp(message.toString("utf8"))
      if (location !== undefined) locations.add(location)
    })
    socket.on("error", finish)
    socket.bind(0, "0.0.0.0", () => {
      if (settled) return
      const payload = Buffer.from(
        [
          "M-SEARCH * HTTP/1.1",
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
          'MAN: "ssdp:discover"',
          "MX: 2",
          `ST: ${SEARCH_TARGET}`,
          "",
          "",
        ].join("\r\n"),
      )
      try {
        socket.send(payload, SSDP_PORT, SSDP_ADDRESS)
        socket.send(payload, SSDP_PORT, SSDP_ADDRESS)
      } catch {
        finish()
      }
    })
  })
}

export function locationFromSsdp(message: string): string | undefined {
  const match = message.match(/^LOCATION:\s*(.+)$/imu)
  return match?.[1] === undefined ? undefined : sonosLocation(match[1].trim())?.href
}

export function seedLocation(host: string): string | undefined {
  const candidate = host.includes("://") ? host : `http://${host}:1400/xml/device_description.xml`
  return sonosLocation(candidate)?.href
}

export function sonosLocation(value: string): URL | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (
    url.protocol !== "http:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port !== "1400" ||
    !privateIpv4(url.hostname)
  ) {
    return undefined
  }
  return url
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10))
  if (
    parts.length !== 4 ||
    parts.some(
      (part, index) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255 ||
        String(part) !== hostname.split(".")[index],
    )
  ) {
    return false
  }
  const [a, b] = parts as [number, number, number, number]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}
