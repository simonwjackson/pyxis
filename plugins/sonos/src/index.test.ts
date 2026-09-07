import { describe, expect, spyOn, test } from "bun:test"
import { createPluginRuntime, PluginCapability } from "@pyxis/plugin-sdk"
import { verifyPlugin } from "@pyxis/plugin-sdk/testing"
import { createSonosPlugin } from "./index"
import type { TopologyEnvironment } from "./topology"

const location = "http://192.168.1.10:1400/xml/device_description.xml"
const description =
  "<root><device><roomName>Kitchen</roomName><modelName>Era 100</modelName><UDN>uuid:RINCON_KITCHEN_MR</UDN></device></root>"
const groupState = `<ZoneGroups><ZoneGroup Coordinator="RINCON_KITCHEN" ID="group"><ZoneGroupMember UUID="RINCON_KITCHEN" Location="${location}" ZoneName="Kitchen"/></ZoneGroup></ZoneGroups>`
const topology = `<ZoneGroupState>${groupState
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")}</ZoneGroupState>`

function environment(fault = false): TopologyEnvironment {
  return {
    ssdp: { discover: async () => [location] },
    now: () => 123,
    fetch: async (_input, init) => {
      if (init?.method !== "POST") return new Response(description)
      const action = String(new Headers(init.headers).get("soapaction"))
      if (action.includes("GetZoneGroupState")) return new Response(topology)
      if (fault) {
        return new Response(
          "<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><errorCode>701</errorCode><errorDescription>Transition not available</errorDescription></detail></s:Fault>",
          { status: 500 },
        )
      }
      return new Response("<ok/>")
    },
  }
}

function call(operation: string, input: unknown, id = operation, config?: unknown): string {
  return JSON.stringify({
    id,
    request: {
      _tag: "capability.call",
      payload: {
        capability: "output",
        operation,
        input,
        ...(config === undefined ? {} : { config }),
      },
    },
  })
}

const position =
  "<RelTime>0:00:12</RelTime><TrackDuration>0:03:00</TrackDuration><TrackURI>http://192.168.1.2/stream/owned</TrackURI>"

function stateEnvironment(delayMs = 0, stall?: string, stallBody = false): TopologyEnvironment {
  const base = environment()
  return {
    ...base,
    fetch: async (input, init) => {
      const action = new Headers(init?.headers).get("soapaction")?.match(/#([^"']+)/u)?.[1]
      if (stall !== undefined && action === stall) {
        const pending = new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          })
        })
        if (!stallBody) return pending
        const response = new Response(null)
        response.text = () => pending
        return response
      }
      if (action === "GetTransportInfo")
        return new Response("<CurrentTransportState>PLAYING</CurrentTransportState>")
      if (action === "GetPositionInfo") {
        if (delayMs > 0)
          await new Promise<void>((resolve, reject) => {
            const aborted = () => {
              clearTimeout(timer)
              reject(new Error("aborted"))
            }
            const timer = setTimeout(() => {
              init?.signal?.removeEventListener("abort", aborted)
              resolve()
            }, delayMs)
            init?.signal?.addEventListener("abort", aborted, { once: true })
          })
        return new Response(position)
      }
      return base.fetch(input, init)
    },
  }
}

describe("Sonos output plugin", () => {
  test.each([
    [undefined, 3000, 8000],
    [{ requestTimeoutMs: 12000 }, 12000, 12000],
    [{ requestTimeoutMs: 100, positionTimeoutMs: 200 }, 100, 200],
  ] as const)(
    "uses position-specific budgets for config %j",
    async (config, regular, expectedPosition) => {
      const timers: (number | undefined)[] = []
      const original = globalThis.setTimeout
      const recordingTimer = Object.assign(
        (...args: Parameters<typeof setTimeout>) => {
          timers.push(args[1])
          return original(...args)
        },
        { __promisify__: original.__promisify__ },
      )
      // Parameters<> selects the final Node overload; forwarding preserves the DOM overload too.
      const spy = spyOn(globalThis, "setTimeout").mockImplementation(
        recordingTimer as typeof setTimeout,
      )
      try {
        const runtime = createPluginRuntime(createSonosPlugin(stateEnvironment()))
        await runtime.handleLine(
          call("transport.state", { targetId: "RINCON_KITCHEN" }, "state", config),
        )
        expect(timers.at(-1)).toBe(expectedPosition)
        expect(timers.slice(0, -1).length).toBeGreaterThan(0)
        expect(timers.slice(0, -1).every((ms) => ms === regular)).toBe(true)
      } finally {
        spy.mockRestore()
      }
    },
  )

  test("accepts a complete position response beyond the generic deadline", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(stateEnvironment(3100)))
    expect(
      await runtime.handleLine(call("transport.state", { targetId: "RINCON_KITCHEN" })),
    ).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "ready",
            value: {
              state: "PLAYING",
              positionMs: 12000,
              durationMs: 180000,
              streamUrl: "http://192.168.1.2/stream/owned",
            },
          },
        },
      },
    })
  })

  test.each([
    ["GetPositionInfo", false, 200],
    ["GetPositionInfo", true, 200],
    ["GetTransportInfo", false, 100],
    ["Pause", false, 100],
  ] as const)("still fails closed for stalled %s (body=%s)", async (action, body, budget) => {
    const runtime = createPluginRuntime(createSonosPlugin(stateEnvironment(0, action, body)))
    const operation = action === "Pause" ? "transport.pause" : "transport.state"
    expect(
      await runtime.handleLine(
        call(operation, { targetId: "RINCON_KITCHEN" }, "stalled", {
          requestTimeoutMs: 100,
          positionTimeoutMs: 200,
        }),
      ),
    ).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: {
              code: "sonos.soap",
              retryable: true,
              message: `Sonos ${action} timed out after ${budget}ms`,
            },
          },
        },
      },
    })
  })

  test.each([99, 30001, 100.5, "8000"])(
    "rejects invalid position deadline %j before I/O",
    async (value) => {
      let calls = 0
      const base = stateEnvironment()
      const runtime = createPluginRuntime(
        createSonosPlugin({
          ...base,
          fetch: async (...args) => {
            calls++
            return base.fetch(...args)
          },
        }),
      )
      expect(
        await runtime.handleLine(
          call("transport.state", { targetId: "RINCON_KITCHEN" }, "invalid", {
            positionTimeoutMs: value,
          }),
        ),
      ).toMatchObject({
        _tag: "response",
        envelope: {
          response: {
            outcome: {
              status: "unavailable",
              value: {
                code: "capability.invalidInput",
                retryable: false,
              },
            },
          },
        },
      })
      expect(calls).toBe(0)
    },
  )

  test("passes SDK conformance as an output-only plugin", async () => {
    await expect(
      verifyPlugin(createSonosPlugin(environment()), [
        { capability: PluginCapability.Output, operation: "discover", input: {} },
      ]),
    ).resolves.toEqual({ passed: true, checks: 4 })
  })

  test("discovers rooms and declares a compatible stream profile", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment()))

    const result = await runtime.handleLine(call("discover", {}))
    const profile = await runtime.handleLine(call("stream.profile", {}, "profile"))

    expect(profile).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "ready",
            value: { preferredFormats: ["m4a", "mp4", "mp3", "aac", "flac", "wav"] },
          },
        },
      },
    })
    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "ready",
            value: {
              refreshedAt: 123,
              groups: [
                {
                  coordinatorId: "RINCON_KITCHEN",
                  rooms: [{ id: "RINCON_KITCHEN", name: "Kitchen" }],
                },
              ],
            },
          },
        },
      },
    })
  })

  test("dispatches transport and volume operations", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment()))

    const play = await runtime.handleLine(
      call("transport.play", {
        targetId: "RINCON_KITCHEN",
        streamUrl: "http://192.168.1.2:4488/stream/track",
        metadata: { title: "Heroes" },
      }),
    )
    const volume = await runtime.handleLine(
      call("volume.set", { targetId: "RINCON_KITCHEN", volume: 35 }),
    )

    expect(play).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
    expect(volume).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready", value: { volume: 35 } } } },
    })
  })

  test("preserves a UPnP fault's numeric code", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment(true)))

    const result = await runtime.handleLine(
      call("transport.play", {
        targetId: "RINCON_KITCHEN",
        streamUrl: "http://192.168.1.2:4488/stream/track",
        metadata: { title: "Heroes" },
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "sonos.upnp.701", retryable: true },
          },
        },
      },
    })
  })

  test("rejects malformed and semantic operation input permanently", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment()))

    const result = await runtime.handleLine(call("volume.set", { volume: 101 }))
    const semantic = await runtime.handleLine(
      call("group.set", {
        coordinatorId: "RINCON_KITCHEN",
        memberIds: ["RINCON_KITCHEN", "RINCON_KITCHEN"],
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "capability.invalidInput", retryable: false },
          },
        },
      },
    })
    expect(semantic).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "capability.invalidInput", retryable: false },
          },
        },
      },
    })
  })
})
