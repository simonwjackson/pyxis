import { ANDROID_DEVICE, PANDORA_API_URL } from "./constants"
import { decrypt, encryptJson } from "./crypto"
import { PandoraError } from "./errors"
import type { PandoraConfig, PandoraPlaylistItem, PandoraSession, PandoraStation } from "./types"

interface PandoraOk<T> {
  readonly stat: "ok"
  readonly result: T
}

interface PandoraFail {
  readonly stat: "fail"
  readonly code: number
  readonly message: string
}

export type PandoraEnvelope<T> = PandoraOk<T> | PandoraFail

export interface PandoraTransport {
  request<T>(method: string, url: string, body: string): Promise<PandoraEnvelope<T>>
}

export interface PandoraApi {
  login(config: PandoraConfig): Promise<PandoraSession>
  stations(session: PandoraSession): Promise<readonly PandoraStation[]>
  stationTracks(session: PandoraSession, stationId: string): Promise<readonly PandoraPlaylistItem[]>
  search(session: PandoraSession, query: string): Promise<unknown>
}

export function createLiveTransport(fetcher: typeof fetch = fetch): PandoraTransport {
  return {
    async request<T>(method: string, url: string, body: string) {
      let response: Response
      try {
        response = await fetcher(url, {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body,
        })
      } catch (error) {
        throw new PandoraError("pandora.network", `Pandora ${method} network failure`, true, {
          cause: error,
        })
      }
      if (!response.ok) {
        throw new PandoraError(
          "pandora.http",
          `Pandora ${method} returned HTTP ${response.status}`,
          response.status >= 500 || response.status === 429,
        )
      }
      try {
        return (await response.json()) as PandoraEnvelope<T>
      } catch (error) {
        throw new PandoraError("pandora.invalidResponse", `${method} returned invalid JSON`, true, {
          cause: error,
        })
      }
    },
  }
}

export function createPandoraApi(transport: PandoraTransport): PandoraApi {
  const call = async <T>(
    session: PandoraSession,
    method: string,
    data: Record<string, unknown>,
  ): Promise<T> => {
    const params = new URLSearchParams({
      method,
      auth_token: session.userAuthToken,
      partner_id: session.partnerId,
      user_id: session.userId,
    })
    const body = encryptJson(ANDROID_DEVICE.encryptKey, {
      ...data,
      userAuthToken: session.userAuthToken,
      syncTime: unixTime() + session.syncOffset,
    })
    return resultOf(
      method,
      await transport.request<T>(method, `${PANDORA_API_URL}?${params}`, body),
    )
  }

  return {
    async login(config) {
      const partnerMethod = "auth.partnerLogin"
      const partner = await transport.request<{
        syncTime: string
        partnerId: string
        partnerAuthToken: string
      }>(
        partnerMethod,
        `${PANDORA_API_URL}?${new URLSearchParams({ method: partnerMethod })}`,
        JSON.stringify({
          username: ANDROID_DEVICE.username,
          password: ANDROID_DEVICE.password,
          deviceModel: ANDROID_DEVICE.deviceId,
          version: "5",
          includeUrls: true,
        }),
      )
      const partnerResult = resultOf(partnerMethod, partner)
      const decrypted = decrypt(ANDROID_DEVICE.decryptKey, partnerResult.syncTime)
      const serverTime = Number.parseInt(decrypted.slice(4), 10)
      if (!Number.isFinite(serverTime)) {
        throw new PandoraError("pandora.syncTime", "Pandora returned an invalid sync time", false)
      }
      const syncOffset = unixTime() - serverTime
      const userMethod = "auth.userLogin"
      const params = new URLSearchParams({
        method: userMethod,
        auth_token: partnerResult.partnerAuthToken,
        partner_id: partnerResult.partnerId,
      })
      const user = await transport.request<{ userId: string; userAuthToken: string }>(
        userMethod,
        `${PANDORA_API_URL}?${params}`,
        encryptJson(ANDROID_DEVICE.encryptKey, {
          loginType: "user",
          username: config.username,
          password: config.password,
          partnerAuthToken: partnerResult.partnerAuthToken,
          syncTime: unixTime() + syncOffset,
        }),
      )
      const userResult = resultOf(userMethod, user, "pandora.invalidCredentials")
      return {
        syncOffset,
        partnerId: partnerResult.partnerId,
        partnerAuthToken: partnerResult.partnerAuthToken,
        userId: userResult.userId,
        userAuthToken: userResult.userAuthToken,
      }
    },

    async stations(session) {
      const result = await call<{ stations: readonly PandoraStation[] }>(
        session,
        "user.getStationList",
        { includeStationArtUrl: true },
      )
      return result.stations
    },

    async stationTracks(session, stationId) {
      const result = await call<{ items: readonly PandoraPlaylistItem[] }>(
        session,
        "station.getPlaylist",
        { stationToken: stationId, additionalAudioUrl: "HTTP_128_MP3" },
      )
      return result.items
    },

    search: (session, query) => call(session, "music.search", { searchText: query }),
  }
}

function resultOf<T>(method: string, response: PandoraEnvelope<T>, failureCode = "pandora.api"): T {
  if (response.stat === "ok") return response.result
  throw new PandoraError(failureCode, `${method}: ${response.message}`, false, {
    apiCode: response.code,
  })
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000)
}
