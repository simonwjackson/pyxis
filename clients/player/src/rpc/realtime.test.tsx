/// Tests for the realtime socket.
///
/// The fake below is a MIRROR of the core, not an invention. Every behaviour it has was read
/// from `services/pyxis/src/rpc/realtime.rs`: the first frame must be `realtime.hello` or
/// the socket is refused, a welcome carries the resume token, events carry whole records,
/// and a failure frame is terminal because the core closes immediately after sending one.
/// This matters more than it looks: this codebase has already shipped a hand-written fake
/// that drifted from the core and hid a broken feature, so a fake that is convenient rather
/// than faithful is worse than no test at all.
///
/// What these tests cannot cover is stated rather than implied. Keepalive is invisible from
/// here: the core pings every 15s and relies on the browser's automatic pong, which lives
/// below the JS WebSocket API and cannot be observed or simulated from a test. That the
/// socket survives past the core's 45s idle timeout is a browser fact, verified by watching
/// a real one stay open, not by anything in this file.

import { expect, test } from "vitest"
import type {
  RealtimeClientMessage,
  RealtimeServerMessage,
  RpcSession,
  RpcSessionDirective,
} from "../../../../contracts/generated/pyxis"
import { RpcRealtimeTopic, RpcTransport } from "../../../../contracts/generated/pyxis"
import { connectRealtime, type RealtimeSocket, realtimeUrlFrom } from "./realtime.ts"

const session = (patch: Partial<RpcSession> = {}): RpcSession => ({
  id: "session-1",
  name: "Here",
  hostDeviceId: "device-1",
  queue: ["track-1"],
  cursor: 0,
  currentTrackId: "track-1",
  transport: RpcTransport.Playing,
  positionMs: 0,
  volume: 100,
  reachable: true,
  revision: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  ...patch,
})

/// One socket, standing in for the core at the other end of the wire.
class FakeSocket implements RealtimeSocket {
  onopen: ((event: Event) => unknown) | null = null
  onmessage: ((event: MessageEvent) => unknown) | null = null
  onclose: ((event: CloseEvent) => unknown) | null = null
  onerror: ((event: Event) => unknown) | null = null
  readonly sent: string[] = []
  closed = false

  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }

  /// The transport opened us. The core has not said anything yet.
  accept() {
    this.onopen?.(new Event("open"))
  }
  /// Deliver a server frame.
  deliver(message: RealtimeServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }
  /// The socket died, from either end.
  drop() {
    this.onclose?.(new CloseEvent("close"))
  }
  hello(): RealtimeClientMessage | undefined {
    const first = this.sent[0]
    return first === undefined ? undefined : (JSON.parse(first) as RealtimeClientMessage)
  }
  /// What the core does with a first frame: welcome it, or refuse it outright.
  welcome(resumeToken = "epoch:1", patch: { missedEventsDropped?: boolean } = {}) {
    const first = this.hello()
    if (first?._tag !== "realtime.hello") {
      this.deliver({
        _tag: "realtime.failure",
        payload: {
          code: "realtime.helloRequired",
          message: "the first message must be 'realtime.hello'",
          retryable: false,
        },
      })
      this.drop()
      return
    }
    this.deliver({
      _tag: "realtime.welcome",
      payload: {
        accountId: "account-1",
        contractId: "contract-1",
        topics: [RpcRealtimeTopic.Sessions],
        resumeToken,
        resumed: first.payload.resumeToken !== undefined,
        missedEventsDropped: patch.missedEventsDropped ?? false,
      },
    })
  }
}

interface Harness {
  readonly sockets: FakeSocket[]
  readonly ready: number[]
  readonly dropped: number[]
  readonly sessions: RpcSession[]
  readonly directives: RpcSessionDirective[]
  readonly resyncs: number[]
  readonly refusals: string[]
  readonly pending: (() => void)[]
  /// Run every scheduled reconnect, the way waiting would.
  flush(): void
  dispose(): void
}

function harness(): Harness {
  const sockets: FakeSocket[] = []
  const ready: number[] = []
  const dropped: number[] = []
  const sessions: RpcSession[] = []
  const directives: RpcSessionDirective[] = []
  const resyncs: number[] = []
  const refusals: string[] = []
  const pending: (() => void)[] = []

  const dispose = connectRealtime(
    {
      open: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
      url: "ws://core/realtime",
      token: "token-abc",
      topics: [RpcRealtimeTopic.Sessions],
      // Reconnects are run on demand rather than after a real wait.
      schedule: (run) => {
        pending.push(run)
        return () => {
          const at = pending.indexOf(run)
          if (at >= 0) pending.splice(at, 1)
        }
      },
      // Removes the randomness so a delay is a fact rather than a range.
      jitter: () => 1,
    },
    {
      onReady: () => ready.push(sockets.length),
      onDropped: () => dropped.push(sockets.length),
      onSession: (value) => sessions.push(value),
      onResyncRequired: () => resyncs.push(sockets.length),
      onDirective: (value) => directives.push(value),
      onRefused: (code, message) => refusals.push(`${code}: ${message}`),
    },
  )

  return {
    sockets,
    ready,
    dropped,
    sessions,
    directives,
    resyncs,
    refusals,
    pending,
    flush() {
      const due = [...pending]
      pending.length = 0
      for (const run of due) run()
    },
    dispose,
  }
}

test("the first frame is hello, carrying the credential and the topics", () => {
  const rig = harness()
  rig.sockets[0]?.accept()

  expect(rig.sockets[0]?.hello()).toEqual({
    _tag: "realtime.hello",
    payload: { bearerToken: "token-abc", topics: [RpcRealtimeTopic.Sessions] },
  })
  // Absent, not undefined: the core rejects unknown fields, and a first connection has no
  // cursor to resume from.
  expect(JSON.parse(rig.sockets[0]?.sent[0] ?? "{}").payload).not.toHaveProperty("resumeToken")
  rig.dispose()
})

test("readiness waits for the core's welcome, not for the socket opening", () => {
  const rig = harness()
  rig.sockets[0]?.accept()

  // The socket is open and the hello is sent, but the core has not answered. Reporting
  // ready here would be the client asserting a presence the core has not granted, and the
  // whole point of this module is that reachability is the core's to decide.
  expect(rig.ready).toEqual([])

  rig.sockets[0]?.welcome()
  expect(rig.ready).toEqual([1])
  rig.dispose()
})

test("a dropped socket stops claiming to be connected and comes back", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()
  rig.sockets[0]?.drop()

  expect(rig.dropped).toEqual([1])
  rig.flush()
  expect(rig.sockets).toHaveLength(2)

  // The cursor from the first connection is offered, so the core replays what was missed
  // instead of starting blank.
  rig.sockets[1]?.accept()
  expect(rig.sockets[1]?.hello()).toMatchObject({
    payload: { resumeToken: "epoch:1" },
  })
  rig.dispose()
})

test("session events are handed over whole", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()
  rig.sockets[0]?.deliver({
    _tag: "realtime.event",
    payload: {
      topic: RpcRealtimeTopic.Sessions,
      resumeToken: "epoch:2",
      state: { _tag: "session.state", payload: session({ revision: 9 }) },
    },
  })

  expect(rig.sessions).toHaveLength(1)
  expect(rig.sessions[0]?.revision).toBe(9)
  rig.dispose()
})

test("a gap in the replay asks for a refetch instead of pretending to be current", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome("epoch:5", { missedEventsDropped: true })

  // The core said the resume point was evicted. Carrying on would leave this client sitting
  // on a hole it cannot see.
  expect(rig.resyncs).toEqual([1])
  rig.dispose()
})

test("a permanent refusal is reported and never retried", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.deliver({
    _tag: "realtime.failure",
    payload: {
      code: "auth.invalidToken",
      message: "bearer token is invalid or revoked",
      retryable: false,
    },
  })
  rig.sockets[0]?.drop()
  rig.flush()

  expect(rig.refusals).toEqual(["auth.invalidToken: bearer token is invalid or revoked"])
  // Reconnecting against a revoked token is an infinite loop against a door that will not
  // open. A person has to do something, so this stops and says so.
  expect(rig.sockets).toHaveLength(1)
  rig.dispose()
})

test("a retryable failure reconnects, and asks for a fresh snapshot", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()
  rig.sockets[0]?.deliver({
    _tag: "realtime.failure",
    payload: {
      code: "realtime.lagged",
      message: "socket fell 200 events behind and must resubscribe",
      retryable: true,
    },
  })
  rig.sockets[0]?.drop()
  rig.flush()

  expect(rig.refusals).toEqual([])
  expect(rig.sockets).toHaveLength(2)
  rig.sockets[1]?.accept()
  // The old cursor is dropped. Replaying from a point the core has just refused would only
  // earn the same refusal again.
  expect(JSON.parse(rig.sockets[1]?.sent[0] ?? "{}").payload).not.toHaveProperty("resumeToken")
  rig.dispose()
})

test("directives are handed to the host", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()
  rig.sockets[0]?.deliver({
    _tag: "realtime.command",
    payload: {
      sessionId: "session-1",
      command: { _tag: "transport.pause", payload: {} },
      issuedBy: "device-2",
      directiveId: "directive-1",
    },
  })

  expect(rig.directives).toHaveLength(1)
  expect(rig.directives[0]?.command._tag).toBe("transport.pause")
  rig.dispose()
})

test("disposing closes the socket and stops reconnecting", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()
  rig.dispose()

  expect(rig.sockets[0]?.closed).toBe(true)
  // The claim dies with the socket rather than outliving it.
  expect(rig.dropped).toEqual([1])
  // A close fired by the disposer must not schedule a return the caller just cancelled.
  rig.sockets[0]?.drop()
  rig.flush()
  expect(rig.sockets).toHaveLength(1)
})

test("a frame arriving after disposal is not delivered", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()
  rig.dispose()

  // A socket does not go quiet the instant it is closed; a frame already in flight still
  // arrives. The caller is gone by then, so handing it over would be calling back into a
  // binding that has unmounted.
  rig.sockets[0]?.deliver({
    _tag: "realtime.event",
    payload: {
      topic: RpcRealtimeTopic.Sessions,
      resumeToken: "epoch:9",
      state: { _tag: "session.state", payload: session() },
    },
  })
  expect(rig.sessions).toEqual([])
})

test("a malformed frame is ignored rather than taking the page down", () => {
  const rig = harness()
  rig.sockets[0]?.accept()
  rig.sockets[0]?.welcome()

  expect(() => {
    rig.sockets[0]?.onmessage?.({ data: "{not json" } as MessageEvent)
    rig.sockets[0]?.onmessage?.({ data: JSON.stringify({ nope: true }) } as MessageEvent)
  }).not.toThrow()
  expect(rig.sessions).toEqual([])
  rig.dispose()
})

test("the socket url follows the page's scheme", () => {
  // A page on TLS opening ws:// is blocked as mixed content, so the scheme is derived
  // rather than fixed.
  expect(realtimeUrlFrom("https://pyxis.example.net")).toBe("wss://pyxis.example.net/realtime")
  expect(realtimeUrlFrom("http://127.0.0.1:4488")).toBe("ws://127.0.0.1:4488/realtime")
})
