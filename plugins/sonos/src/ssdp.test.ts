import { describe, expect, test } from "bun:test"
import {
  browseAvahi,
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

  test("bounds a helper that ignores graceful termination and retains its resolved lines", async () => {
    const line = "=;eth0;IPv4;RINCON_A;_sonos._tcp;local;Sonos-A.local;192.168.1.20;1443;"
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
      process.on("SIGTERM", () => {});
      console.log(${JSON.stringify(line)});
      setInterval(() => {}, 1000);
    `,
      ],
      { stdout: "pipe", stderr: "ignore" },
    )
    // Wait for the fixture's handler/output before starting the discovery deadline.
    const reader = child.stdout.getReader()
    const first = await reader.read()
    reader.releaseLock()
    const bytes = first.value
    const stdout = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        if (bytes !== undefined) controller.enqueue(bytes)
        const remaining = child.stdout.getReader()
        try {
          while (true) {
            const next = await remaining.read()
            if (next.done) break
            controller.enqueue(next.value)
          }
          controller.close()
        } finally {
          remaining.releaseLock()
        }
      },
    })
    const pending = browseAvahi(25, () => ({
      stdout,
      exited: child.exited,
      kill: (signal) => child.kill(signal),
    }))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const output = await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("discovery ignored its deadline")), 500)
        }),
      ])
      expect(locationsFromAvahi(output)).toEqual([
        "http://192.168.1.20:1400/xml/device_description.xml",
      ])
      expect(await child.exited).toBe(137)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      child.kill("SIGKILL")
      await pending
    }
  })

  test("retains normal helper output when it exits before the deadline", async () => {
    const child = Bun.spawn([process.execPath, "-e", 'process.stdout.write("complete output")'], {
      stdout: "pipe",
      stderr: "ignore",
    })
    expect(await browseAvahi(10_000, () => child)).toBe("complete output")
    expect(await child.exited).toBe(0)
  })

  test("drops an interrupted final record rather than discovering its truncated address", async () => {
    const complete = "=;eth0;IPv4;A;_sonos._tcp;local;A.local;192.168.1.20;1443;\n"
    const partial = "=;eth0;IPv4;B;_sonos._tcp;local;B.local;192.168.1.2"
    let output: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>> | undefined
    let finish: ((code: number) => void) | undefined
    const exited = new Promise<number>((resolve) => {
      finish = resolve
    })
    const stdout = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        output = controller
        controller.enqueue(new TextEncoder().encode(complete + partial))
      },
    })
    const result = await browseAvahi(5, () => ({
      stdout,
      exited,
      kill: () => {
        output?.close()
        finish?.(137)
      },
    }))
    expect(result).toBe(complete)
    expect(locationsFromAvahi(result)).toEqual([
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
