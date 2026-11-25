import { AsyncLocalStorage } from "node:async_hooks"

const origin = "https://music.youtube.com"
const userAgent = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"
export class YtMusicProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

const properties = {
  requestsPerSecond: { type: "integer", minimum: 1, maximum: 100, default: 5 },
  burstSize: { type: "integer", minimum: 1, maximum: 50, default: 5 },
  maxRetries: { type: "integer", minimum: 0, maximum: 5, default: 2 },
}
export const transportSchema = { type: "object", properties, additionalProperties: false }
const configScope = new AsyncLocalStorage<unknown>()
export function withTransportConfig<T>(config: unknown, call: () => T): T {
  return configScope.run(config, call)
}
function setting(key: keyof typeof properties) {
  const config = configScope.getStore()
  const value = config && typeof config === "object" ? Reflect.get(config, key) : undefined
  const { minimum, maximum, default: fallback } = properties[key]
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new YtMusicProviderError("ytmusic.invalidConfig", `Invalid ${key}`, false)
  return Number(value)
}
const clock = {
  now: Date.now,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
}
export function createTransport(
  fetcher: (url: URL, options: RequestInit) => Promise<Response> = fetch,
  time = clock,
) {
  // Reserve from a shared virtual timeline before yielding, including retries and bootstrap.
  let next = 0
  let coolingUntil = 0
  let visitor: Promise<string> | undefined
  async function post(
    endpoint: string,
    body: Record<string, unknown>,
    visitorData?: string,
    android = false,
    token?: string,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const step = 1000 / setting("requestsPerSecond"),
        now = time.now()
      if (coolingUntil - now > 30000)
        throw new YtMusicProviderError(
          "ytmusic.cooldown",
          "Upstream Retry-After is still in effect",
          true,
        )
      next = Math.max(next, now - (setting("burstSize") - 1) * step, coolingUntil || -Infinity)
      const delay = next - now
      next += step
      if (delay > 0) await time.sleep(delay)
      while (time.now() < coolingUntil) {
        const remaining = coolingUntil - time.now()
        if (remaining > 30000)
          throw new YtMusicProviderError(
            "ytmusic.cooldown",
            "Upstream Retry-After is still in effect",
            true,
          )
        await time.sleep(remaining)
      }
      const version = android
        ? "7.27.52"
        : `1.${new Date(time.now()).toISOString().slice(0, 10).replaceAll("-", "")}.01.00`
      const client = {
        hl: "en",
        gl: "US",
        clientName: android ? "ANDROID_MUSIC" : "WEB_REMIX",
        clientVersion: version,
        visitorData,
        ...(android
          ? { androidSdkVersion: 30, osName: "Android", platform: "MOBILE" }
          : {
              deviceMake: "",
              deviceModel: "",
              osName: "X11",
              osVersion: "",
              platform: "DESKTOP",
              clientFormFactor: "UNKNOWN_FORM_FACTOR",
              userInterfaceTheme: "USER_INTERFACE_THEME_DARK",
              timeZone: "UTC",
              utcOffsetMinutes: 0,
              browserName: "Firefox",
              browserVersion: "131.0",
              screenWidthPoints: 1317,
              screenHeightPoints: 787,
              screenPixelDensity: 1,
              userAgent,
            }),
      }
      const url = new URL(`/youtubei/v1/${endpoint}`, origin)
      url.searchParams.set("prettyPrint", "false")
      if (token) {
        url.searchParams.set("ctoken", token)
        url.searchParams.set("continuation", token)
        url.searchParams.set("type", "next")
      }
      let response: Response
      try {
        response = await fetcher(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Alt-Used": "music.youtube.com",
            Connection: "keep-alive",
            DNT: "1",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "same-origin",
            "Sec-Fetch-Site": "same-origin",
            "Sec-GPC": "1",
            "X-Goog-AuthUser": "0",
            "X-Origin": origin,
            "X-Youtube-Bootstrap-Logged-In": "false",
            "X-Youtube-Client-Name": android ? "21" : "67",
            "X-Youtube-Client-Version": version,
            Origin: origin,
            Referer: `${origin}/library`,
            "User-Agent": android
              ? "com.google.android.apps.youtube.music/7.27.52 (Linux; Android 11) gzip"
              : userAgent,
            ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
          },
          body: JSON.stringify({
            context: {
              client,
              user: { lockedSafetyMode: false },
              request: { useSsl: true, internalExperimentFlags: [], consistencyTokenJars: [] },
            },
            ...body,
          }),
          signal: AbortSignal.timeout(30000),
        })
      } catch (error) {
        throw new YtMusicProviderError("ytmusic.network", String(error), true)
      }
      if (response.ok) {
        try {
          return await response.json()
        } catch {
          throw new YtMusicProviderError(
            "ytmusic.invalidResponse",
            "Invalid YouTube Music JSON",
            false,
          )
        }
      }
      const retry = response.status === 429 || response.status >= 500
      const error = new YtMusicProviderError(
        `ytmusic.http${response.status}`,
        `YouTube Music ${endpoint} returned HTTP ${response.status}`,
        retry || response.status === 408,
      )
      await response.body?.cancel()
      if (!retry) throw error
      const header = response.headers.get("Retry-After")
      const retryAt = header
        ? /^\d+$/.test(header)
          ? time.now() + Number(header) * 1000
          : Date.parse(header)
        : 0
      coolingUntil = Math.max(
        coolingUntil,
        Number.isFinite(retryAt) ? retryAt : 0,
        time.now() + 2 ** attempt * 250 + time.random() * 250,
      )
      if (attempt >= setting("maxRetries") || coolingUntil - time.now() > 30000) throw error
    }
  }
  return async (
    endpoint: string,
    body: Record<string, unknown>,
    android = false,
    token?: string,
  ) => {
    visitor ??= post("browse", {})
      .then((data) => {
        const v = (data as { responseContext?: { visitorData?: unknown } })?.responseContext
          ?.visitorData
        if (typeof v !== "string" || !v)
          throw new YtMusicProviderError(
            "ytmusic.noVisitor",
            "Empty browse did not supply visitor data",
            true,
          )
        return v
      })
      .catch((error) => {
        visitor = undefined
        throw error
      })
    return post(endpoint, body, await visitor, android, token)
  }
}
