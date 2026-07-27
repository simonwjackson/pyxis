import { isIP } from "node:net";

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isAllowedSonosHost(hostname: string): boolean {
  if (isIP(hostname) === 4) return isPrivateIpv4(hostname);
  return hostname === "localhost" || hostname.endsWith(".local");
}

export function parseSonosLocation(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return undefined;
    if (url.username !== "" || url.password !== "") return undefined;
    if (!isAllowedSonosHost(url.hostname)) return undefined;
    if (url.port !== "1400") return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function seedHostToLocation(host: string): string | undefined {
  const trimmed = host.trim();
  if (!isAllowedSonosHost(trimmed)) return undefined;
  return `http://${trimmed}:1400/xml/device_description.xml`;
}
