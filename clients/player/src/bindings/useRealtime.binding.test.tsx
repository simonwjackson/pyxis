/// Tests for the socket-holding binding.
///
/// The behaviour worth protecting here is not "it connects" but "it does not lie about
/// being connected", and "it does not thrash". The core counts this device present for
/// exactly as long as one socket is held, so a binding that reopened the socket on every
/// render would make the device flicker in and out of reachable -- which is worse than
/// never connecting, because it looks like it is working.

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { RpcRealtimeTopic } from "../../../../contracts/generated/pyxis"
import type { RealtimeSocket } from "../rpc/realtime.ts"
import { type RealtimeEdge, useRealtime } from "./useRealtime.binding.tsx"

afterEach(cleanup)

/// A socket standing in for the core. Mirrors the one rule that matters at this level: the
/// client is not present until the core has welcomed it.
class FakeSocket implements RealtimeSocket {
  onopen: ((event: Event) => unknown) | null = null
  onmessage: ((event: MessageEvent) => unknown) | null = null
  onclose: ((event: CloseEvent) => unknown) | null = null
  onerror: ((event: Event) => unknown) | null = null
  closed = false
  send() {}
  close() {
    this.closed = true
  }
  welcome() {
    this.onopen?.(new Event("open"))
    this.onmessage?.({
      data: JSON.stringify({
        _tag: "realtime.welcome",
        payload: {
          accountId: "account-1",
          contractId: "contract-1",
          topics: [RpcRealtimeTopic.Sessions],
          resumeToken: "epoch:1",
          resumed: false,
          missedEventsDropped: false,
        },
      }),
    } as MessageEvent)
  }
  drop() {
    this.onclose?.(new CloseEvent("close"))
  }
}

const sockets: FakeSocket[] = []
const edge: RealtimeEdge = {
  open: () => {
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  },
  url: "ws://core/realtime",
}

afterEach(() => {
  sockets.length = 0
})

function Probe({ token, tick }: { readonly token?: string; readonly tick?: number }) {
  // Inline arrows on purpose. This is how a caller naturally writes it, and it must not
  // cost a reconnect.
  const { connected } = useRealtime(edge, token, {
    onSession: () => {},
    onDirective: () => {},
    onResyncRequired: () => {},
    schedule: () => () => {},
  })
  return (
    <div>
      <span data-testid="connected">{String(connected)}</span>
      <span data-testid="tick">{tick ?? 0}</span>
    </div>
  )
}

test("presence is the core's to grant, not the client's to assume", () => {
  render(<Probe token="token-abc" />)

  // A socket exists and is opening. Saying connected here would be this device asserting a
  // presence the core has not counted.
  expect(screen.getByTestId("connected").textContent).toBe("false")

  act(() => sockets[0]?.welcome())
  expect(screen.getByTestId("connected").textContent).toBe("true")

  act(() => sockets[0]?.drop())
  // The socket is gone, so the claim goes with it, immediately.
  expect(screen.getByTestId("connected").textContent).toBe("false")
})

test("re-rendering does not churn the socket", () => {
  const { rerender } = render(<Probe token="token-abc" tick={0} />)
  act(() => sockets[0]?.welcome())
  expect(sockets).toHaveLength(1)

  for (let tick = 1; tick <= 5; tick += 1) {
    rerender(<Probe token="token-abc" tick={tick} />)
  }

  // One socket for the life of the page. Opening a new one per render would drop and retake
  // the core's presence refcount continuously.
  expect(sockets).toHaveLength(1)
  expect(sockets[0]?.closed).toBe(false)
  expect(screen.getByTestId("connected").textContent).toBe("true")
})

test("without a credential no socket is attempted", () => {
  render(<Probe />)

  // There is nothing to authenticate with, so there is nothing to try. Opening a socket
  // that can only be refused would earn a reconnect loop against a certain failure.
  expect(sockets).toHaveLength(0)
  expect(screen.getByTestId("connected").textContent).toBe("false")
})

test("unmounting releases the socket", () => {
  const { unmount } = render(<Probe token="token-abc" />)
  act(() => sockets[0]?.welcome())

  unmount()

  // The core frees this device's presence when the socket closes, so a page that goes away
  // must actually close it rather than leaving a dead host looking controllable.
  expect(sockets[0]?.closed).toBe(true)
})
