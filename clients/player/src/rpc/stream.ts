/// Where audio bytes come from.
///
/// Media never crosses a typed RPC call. This resolves a URL that an `<audio>` element
/// fetches over ordinary HTTP, and the whole difficulty is authorisation: an audio element
/// cannot send an `Authorization` header, so the credential has to reach the request some
/// other way.
///
/// The preferred way is the service worker. It already holds this device's credentials, so
/// the page asks it to authorise one track and then hands the element a plain same-origin
/// URL; the worker attaches the credential as the request passes through it. Nothing
/// secret ends up in the URL, and the element streams and seeks as normal.
///
/// The fallback downloads the whole track with a bearer header and hands back a blob URL.
/// It works everywhere, and it is worse: no range requests, so no seeking into an
/// unbuffered part and no playback until the entire track has arrived. It exists so a
/// browser without a controlling worker still plays music, not because it is equivalent.
///
/// The controller is read through a getter rather than captured. A service worker activates
/// after the page loads, so a value captured at construction is very often the `null` from
/// before it took control -- which would silently mean every stream used the slow path.

export interface StreamCredentials {
  readonly token: string
  readonly accountId: string
  readonly deviceId: string
  /// The account-switch fence. The worker refuses credentials from an older epoch, so a
  /// stream authorised before an account switch cannot play afterwards.
  readonly streamEpoch: number
}

/// The narrow slice of a service worker this needs: something that can be posted to.
export interface StreamAuthorizer {
  postMessage(message: unknown, transfer: readonly Transferable[]): void
}

export interface StreamLoaderConfig {
  readonly request: (input: string, init?: RequestInit) => Promise<Response>
  /// Read at call time, never captured. Returns undefined before a worker controls the page.
  readonly controller: () => StreamAuthorizer | undefined
  readonly createObjectUrl?: (blob: Blob) => string
  /// How long to wait for the worker to answer before using the fallback. A worker that is
  /// slow to answer is treated as absent, because a person waiting on audio is better
  /// served by a slower path than by no path.
  readonly authorizeTimeoutMs?: number
}

export interface StreamLoader {
  load(trackId: string, credentials: StreamCredentials): Promise<string>
}

interface Authorization {
  readonly candidateUrl?: string
  readonly cacheName?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export function createStreamLoader(config: StreamLoaderConfig): StreamLoader {
  const {
    request,
    controller,
    createObjectUrl = (blob: Blob) => URL.createObjectURL(blob),
    authorizeTimeoutMs = 1000,
  } = config

  const authorize = async (
    trackId: string,
    credentials: StreamCredentials,
  ): Promise<Authorization | undefined> => {
    const worker = controller()
    if (worker === undefined || typeof MessageChannel === "undefined") return undefined
    const channel = new MessageChannel()
    return new Promise<Authorization | undefined>((resolve) => {
      // Resolving undefined rather than rejecting: a worker that does not answer is a
      // reason to take the other path, not an error to report to someone listening.
      const timeout = setTimeout(() => resolve(undefined), authorizeTimeoutMs)
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timeout)
        const value = event.data
        if (!isRecord(value) || value.authorized !== true) {
          resolve(undefined)
          return
        }
        resolve({
          ...(typeof value.candidateUrl === "string" ? { candidateUrl: value.candidateUrl } : {}),
          ...(typeof value.cacheName === "string" ? { cacheName: value.cacheName } : {}),
        })
      }
      worker.postMessage({ _tag: "pyxis.stream.authorize", trackId, ...credentials }, [
        channel.port2,
      ])
    })
  }

  return {
    async load(trackId, credentials) {
      const granted = await authorize(trackId, credentials).catch(() => undefined)
      if (granted !== undefined) {
        // Identity only. The token is not here: the worker matches these against the
        // credentials it already holds, so a URL that leaks cannot be replayed elsewhere.
        const query = new URLSearchParams({
          pyxisAccount: credentials.accountId,
          pyxisDevice: credentials.deviceId,
          pyxisEpoch: String(credentials.streamEpoch),
          ...(granted.candidateUrl === undefined ? {} : { pyxisCandidate: granted.candidateUrl }),
          ...(granted.cacheName === undefined ? {} : { pyxisCache: granted.cacheName }),
        })
        return `/stream/${encodeURIComponent(trackId)}?${query}`
      }

      const response = await request(`/stream/${encodeURIComponent(trackId)}`, {
        headers: {
          authorization: `Bearer ${credentials.token}`,
          "x-pyxis-account-id": credentials.accountId,
          "x-pyxis-device-id": credentials.deviceId,
        },
      })
      if (!response.ok) {
        throw new Error(`stream request failed with HTTP ${response.status}`)
      }
      return createObjectUrl(await response.blob())
    },
  }
}
