import { describe, expect, it } from "bun:test";
import {
  parseSoapFault,
  sendSoapAction,
  SonosSoapError,
} from "./soap.js";

const location = "http://192.168.1.241:1400/xml/device_description.xml";
const faultEnvelope = `
  <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
    <s:Body><s:Fault>
      <faultcode>s:Client</faultcode>
      <faultstring>UPnPError</faultstring>
      <detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
        <errorCode>701</errorCode><errorDescription>Transition not available</errorDescription>
      </UPnPError></detail>
    </s:Fault></s:Body>
  </s:Envelope>`;

describe("Sonos SOAP", () => {
  it("parses namespaced UPnP faults", () => {
    expect(parseSoapFault(faultEnvelope)).toEqual({
      faultCode: "s:Client",
      faultString: "UPnPError",
      upnpErrorCode: 701,
      upnpErrorDescription: "Transition not available",
    });
  });

  it("rejects redirects and exposes structured faults", async () => {
    let redirect: RequestRedirect | undefined;
    const result = sendSoapAction(
      location,
      "AVTransport",
      "/MediaRenderer/AVTransport/Control",
      "Play",
      "<InstanceID>0</InstanceID>",
      1000,
      async (_input, init) => {
        redirect = init?.redirect;
        return new Response(faultEnvelope, { status: 500 });
      },
    );

    expect(redirect).toBe("error");
    await expect(result).rejects.toBeInstanceOf(SonosSoapError);
    await result.catch((error: SonosSoapError) => {
      expect(error.action).toBe("Play");
      expect(error.status).toBe(500);
      expect(error.fault?.upnpErrorCode).toBe(701);
    });
  });

  it("rejects a SOAP fault even when the HTTP response is successful", async () => {
    await expect(
      sendSoapAction(
        location,
        "AVTransport",
        "/MediaRenderer/AVTransport/Control",
        "Play",
        "",
        1000,
        async () => new Response(faultEnvelope),
      ),
    ).rejects.toThrow("UPnP 701");
  });
});
