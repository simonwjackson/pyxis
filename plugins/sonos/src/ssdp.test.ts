import { describe, expect, test } from "bun:test"
import { locationFromSsdp, seedLocation, sonosLocation } from "./ssdp"

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
})
