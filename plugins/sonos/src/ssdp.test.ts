import { describe, expect, test } from "bun:test"
import {
  createSsdpDiscovery,
  discoverMdnsLocations,
  locationFromSsdp,
  locationsFromAvahi,
  seedLocation,
  sonosLocation,
} from "./ssdp"

describe("Sonos SSDP network policy", () => {
  test("accepts private HTTP description locations only", () => {
    expect(sonosLocation("http://192.168.1.20:1400/xml/device_description.xml")?.hostname).toBe(
      "192.168.1.20",
    )
    expect(sonosLocation("https://192.168.1.20:1400/xml/device_description.xml")).toBeUndefined()
    expect(sonosLocation("http://example.com:1400/xml/device_description.xml")).toBeUndefined()
    expect(sonosLocation("http://192.168.1.20:8080/xml/device_description.xml")).toBeUndefined()
  })

  test("extracts and validates LOCATION case-insensitively", () => {
    expect(
      locationFromSsdp(
        "HTTP/1.1 200 OK\r\nLocation: http://10.0.0.7:1400/xml/device_description.xml\r\n",
      ),
    ).toBe("http://10.0.0.7:1400/xml/device_description.xml")
  })

  test("turns a private seed host into a description URL", () => {
    expect(seedLocation("172.16.2.9")).toBe("http://172.16.2.9:1400/xml/device_description.xml")
    expect(seedLocation("8.8.8.8")).toBeUndefined()
  })

  test("extracts private IPv4 Sonos locations from Avahi", () => {
    const output = [
      '=;eth0;IPv4;RINCON_A\\064Kitchen;_sonos._tcp;local;Sonos-A.local;192.168.1.20;1443;"location=http://192.168.1.20:1400/xml/device_description.xml"',
      '=;eth0;IPv6;RINCON_A\\064Kitchen;_sonos._tcp;local;Sonos-A.local;fe80::1;1443;"location=http://192.168.1.20:1400/xml/device_description.xml"',
      "=;eth0;IPv4;Other;_other._tcp;local;other.local;192.168.1.30;1234;",
      "=;eth0;IPv4;Public;_sonos._tcp;local;public.local;8.8.8.8;1443;",
    ].join("\n")

    expect(locationsFromAvahi(output)).toEqual([
      "http://192.168.1.20:1400/xml/device_description.xml",
    ])
  })

  test("uses mDNS when SSDP replies are suppressed", async () => {
    const browse = async () =>
      "=;eth0;IPv4;RINCON_A;_sonos._tcp;local;Sonos-A.local;192.168.1.20;1443;"

    await expect(discoverMdnsLocations(100, browse)).resolves.toEqual([
      "http://192.168.1.20:1400/xml/device_description.xml",
    ])
    await expect(createSsdpDiscovery(browse).discover(5)).resolves.toContain(
      "http://192.168.1.20:1400/xml/device_description.xml",
    )
  })
})
