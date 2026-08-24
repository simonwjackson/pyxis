import { describe, expect, test } from "bun:test"
import { parseSoapFault, SonosSoapError, sendSoapAction } from "./soap"

const location = "http://192.168.1.241:1400/xml/device_description.xml"
const faultEnvelope = `
  <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Body><s:Fault>
      <faultcode>s:Client</faultcode>
      <faultstring>UPnPError</faultstring>
      <detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
        <errorCode>701</errorCode><errorDescription>Transition not available</errorDescription>
      </UPnPError></detail>
    </s:Fault></s:Body>
  </s:Envelope>`

describe("Sonos SOAP", () => {
  test("parses namespaced UPnP faults", () => {
    expect(parseSoapFault(faultEnvelope)).toEqual({
      faultCode: "s:Client",
      faultString: "UPnPError",
      upnpErrorCode: 701,
      upnpErrorDescription: "Transition not available",
    })
  })

  test("rejects redirects and preserves the numeric fault code", async () => {
    let redirect: RequestRedirect | undefined
    const result = sendSoapAction(
      location,
      "AVTransport",
      "/MediaRenderer/AVTransport/Control",
      "Play",
      "<InstanceID>0</InstanceID>",
      1_000,
      async (_input, init) => {
        redirect = init?.redirect
        return new Response(faultEnvelope, { status: 500 })
      },
    )

    expect(redirect).toBe("error")
    await expect(result).rejects.toBeInstanceOf(SonosSoapError)
    await result.catch((error: SonosSoapError) => {
      expect(error.code).toBe("sonos.upnp.701")
      expect(error.fault?.upnpErrorCode).toBe(701)
      expect(error.retryable).toBe(true)
    })
  })

  test("keeps the timeout active while reading the response body", async () => {
    const result = sendSoapAction(
      location,
      "AVTransport",
      "/MediaRenderer/AVTransport/Control",
      "Play",
      "",
      10,
      async (_input, init) =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () =>
            new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
            }),
        }) as Response,
    )

    await expect(result).rejects.toThrow("timed out")
  })

  test("rejects a SOAP fault even under HTTP 200", async () => {
    await expect(
      sendSoapAction(
        location,
        "AVTransport",
        "/MediaRenderer/AVTransport/Control",
        "Play",
        "",
        1_000,
        async () => new Response(faultEnvelope),
      ),
    ).rejects.toThrow("UPnP 701")
  })
})
