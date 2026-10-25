import {
  RpcRepeatMode,
  type RpcSession,
  type RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"

// Plain reference affordances. The host still owns validation, confirmation and receipts.
export function ReferenceSessionControls({
  session,
  disabled = false,
  command,
}: {
  readonly session: RpcSession
  readonly disabled?: boolean
  readonly command: (command: RpcSessionCommand) => Promise<void>
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Playback commands</legend>
      <label>
        Repeat{" "}
        <select
          value={session.repeat}
          onChange={(event) => {
            const mode = Object.values(RpcRepeatMode).find(
              (mode) => mode === event.currentTarget.value,
            )
            if (mode !== undefined) void command({ _tag: "repeat.set", payload: { mode } })
          }}
        >
          {Object.values(RpcRepeatMode).map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={session.shuffle}
          onChange={(event) =>
            void command({ _tag: "shuffle.set", payload: { enabled: event.currentTarget.checked } })
          }
        />
        Shuffle
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const positionMs = Number(new FormData(event.currentTarget).get("positionMs"))
          void command({ _tag: "transport.seek", payload: { positionMs } })
        }}
      >
        <label>
          Seek position (ms){" "}
          <input
            name="positionMs"
            type="number"
            min="0"
            max={session.durationMs}
            step="1"
            required
          />
        </label>
        <button
          type="submit"
          disabled={session.currentTrackId === undefined || (session.durationMs ?? 0) <= 0}
        >
          Seek
        </button>
      </form>
    </fieldset>
  )
}
