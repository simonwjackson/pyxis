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
