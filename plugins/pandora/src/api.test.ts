import { describe, expect, test } from "bun:test"
import { createPandoraApi, type PandoraTransport } from "./api"
import { ANDROID_DEVICE } from "./constants"
import { encrypt } from "./crypto"
import { PandoraError } from "./errors"

function transport(responses: unknown[]): PandoraTransport & { methods: string[] } {
  const methods: string[] = []
  return {
    methods,
    async request(method) {
      methods.push(method)
      const response = responses.shift()
      if (response === undefined) throw new Error(`no response for ${method}`)
      if (response instanceof Error) throw response
      return response as never
    },
  }
}

function loginResponses(
  user: unknown = { stat: "ok", result: { userId: "u", userAuthToken: "ut" } },
) {
  const serverTime = Math.floor(Date.now() / 1000) - 5
  return [
    {
      stat: "ok",
      result: {
        syncTime: encrypt(ANDROID_DEVICE.decryptKey, `0000${serverTime}`),
        partnerId: "p",
        partnerAuthToken: "pt",
      },
    },
    user,
  ]
}

describe("Pandora API", () => {
  test("partner then user login produces a usable session", async () => {
    const controlled = transport(loginResponses())
    const api = createPandoraApi(controlled)

    const session = await api.login({ username: "user", password: "pass" })

    expect(session).toMatchObject({
      partnerId: "p",
      partnerAuthToken: "pt",
      userId: "u",
      userAuthToken: "ut",
    })
    expect(controlled.methods).toEqual(["auth.partnerLogin", "auth.userLogin"])
  })

  test("invalid credentials are a typed auth failure", async () => {
    const controlled = transport(
      loginResponses({ stat: "fail", code: 1012, message: "Invalid login" }),
    )
    const api = createPandoraApi(controlled)

    await expect(api.login({ username: "bad", password: "bad" })).rejects.toMatchObject({
      code: "pandora.invalidCredentials",
      retryable: false,
    })
  })

  test("transport 5xx remains a retryable provider failure", async () => {
    const api = createPandoraApi(transport([new PandoraError("pandora.http", "HTTP 503", true)]))

    await expect(api.login({ username: "user", password: "pass" })).rejects.toMatchObject({
      code: "pandora.http",
      retryable: true,
    })
  })
})
