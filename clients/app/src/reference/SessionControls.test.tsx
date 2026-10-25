import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import {
  RpcRepeatMode,
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"
import { ReferenceSessionControls } from "./SessionControls"

afterEach(cleanup)

it("issues typed seek and mode intents without changing the displayed authoritative session", () => {
  const session: RpcSession = {
    id: "session",
    name: "Host",
    hostDeviceId: "device",
    queue: ["track"],
    cursor: 0,
    currentTrackId: "track",
    repeat: RpcRepeatMode.Off,
    shuffle: false,
    transport: RpcTransport.Playing,
    positionMs: 1000,
    durationMs: 10000,
    volume: 50,
    reachable: true,
    revision: 1,
    updatedAt: "now",
  }
  const commands: RpcSessionCommand[] = []
  render(
    <ReferenceSessionControls
      session={session}
      command={async (command) => {
        commands.push(command)
      }}
    />,
  )
  fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "one" } })
  fireEvent.click(screen.getByLabelText("Shuffle"))
  const input = screen.getByLabelText("Seek position (ms)")
  fireEvent.change(input, { target: { value: "5000" } })
  const form = input.closest("form")
  if (form === null) throw new Error("seek form missing")
  fireEvent.submit(form)
  expect(commands).toEqual([
    { _tag: "repeat.set", payload: { mode: RpcRepeatMode.One } },
    { _tag: "shuffle.set", payload: { enabled: true } },
    { _tag: "transport.seek", payload: { positionMs: 5000 } },
  ])
  expect(session.repeat).toBe(RpcRepeatMode.Off)
  expect(session.positionMs).toBe(1000)
})

it.each([
  { track: "track", duration: 10000, unavailable: false, seekDisabled: false },
  { track: "track", duration: undefined, unavailable: false, seekDisabled: true },
  { track: undefined, duration: 10000, unavailable: false, seekDisabled: true },
  { track: "track", duration: 0, unavailable: false, seekDisabled: true },
  { track: "track", duration: 10000, unavailable: true, seekDisabled: true },
])(
  "keeps capability and reachability separate: $track/$duration/$unavailable",
  ({ track, duration, unavailable, seekDisabled }) => {
    const session: RpcSession = {
      id: "session",
      name: "Host",
      hostDeviceId: "device",
      queue: track === undefined ? [] : [track],
      ...(track === undefined ? {} : { cursor: 0, currentTrackId: track }),
      ...(duration === undefined ? {} : { durationMs: duration }),
      repeat: RpcRepeatMode.Off,
      shuffle: false,
      transport: RpcTransport.Stopped,
      positionMs: 0,
      volume: 50,
      reachable: !unavailable,
      revision: 1,
      updatedAt: "now",
    }
    render(
      <ReferenceSessionControls
        session={session}
        disabled={unavailable}
        command={async () => {}}
      />,
    )
    expect(screen.getByRole("button", { name: "Seek" }).matches(":disabled")).toBe(seekDisabled)
    for (const label of ["Repeat", "Shuffle", "Seek position (ms)"])
      expect(screen.getByLabelText(label).matches(":disabled")).toBe(unavailable)
  },
)
