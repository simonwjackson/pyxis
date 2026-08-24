export type SonosFetch = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>

export interface SoapFault {
  readonly faultCode?: string
  readonly faultString?: string
  readonly upnpErrorCode?: number
  readonly upnpErrorDescription?: string
}

export class SonosSoapError extends Error {
  readonly action: string
  readonly status: number
  readonly fault: SoapFault | undefined
  readonly retryable: boolean

  constructor(
    action: string,
    status: number,
    message: string,
    fault?: SoapFault,
    retryable = status >= 500 || status === 0,
  ) {
    super(message)
    this.name = "SonosSoapError"
    this.action = action
    this.status = status
    this.fault = fault
    this.retryable = retryable
  }

  get code(): string {
    return this.fault?.upnpErrorCode === undefined
      ? "sonos.soap"
      : `sonos.upnp.${this.fault.upnpErrorCode}`
  }
}

export async function sendSoapAction(
  locationUrl: string,
  service: string,
  controlPath: string,
  action: string,
  body: string,
  timeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<string> {
  const location = new URL(locationUrl)
  const endpoint = new URL(controlPath, location.origin)
  const serviceType = `urn:schemas-upnp-org:service:${service}:1`
  const envelope = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ',
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    `<s:Body><u:${action} xmlns:u="${serviceType}">${body}</u:${action}></s:Body>`,
    "</s:Envelope>",
  ].join("")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  let text: string
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": 'text/xml; charset="utf-8"',
        soapaction: `"${serviceType}#${action}"`,
      },
      body: envelope,
      redirect: "error",
      signal: controller.signal,
    })
    // Keep the same deadline through body consumption. A speaker can send headers and
    // then stall forever; that is still a timed-out SOAP call.
    text = await response.text()
  } catch (cause) {
    const timedOut = controller.signal.aborted
    throw new SonosSoapError(
      action,
      0,
      timedOut
        ? `Sonos ${action} timed out after ${timeoutMs}ms`
        : `Sonos ${action} failed: ${message(cause)}`,
      undefined,
      true,
    )
  } finally {
    clearTimeout(timeout)
  }
  const fault = parseSoapFault(text)
  if (!response.ok || fault !== undefined) {
    const description = fault?.upnpErrorDescription ?? fault?.faultString ?? response.statusText
    const numeric = fault?.upnpErrorCode === undefined ? "" : ` UPnP ${fault.upnpErrorCode}`
    throw new SonosSoapError(
      action,
      response.status,
      `Sonos ${action} failed:${numeric}${description.length === 0 ? "" : ` ${description}`}`,
      fault,
      response.status >= 500 || response.status === 408 || response.status === 429,
    )
  }
  return text
}

export function parseSoapFault(value: string): SoapFault | undefined {
  const faultCode = xmlTag(value, "faultcode")
  const faultString = xmlTag(value, "faultstring")
  const codeText = xmlTag(value, "errorCode")
  const upnpErrorCode =
    codeText !== undefined && /^\d+$/u.test(codeText.trim())
      ? Number.parseInt(codeText.trim(), 10)
      : undefined
  const upnpErrorDescription = xmlTag(value, "errorDescription")
  if (
    faultCode === undefined &&
    faultString === undefined &&
    upnpErrorCode === undefined &&
    upnpErrorDescription === undefined
  ) {
    return undefined
  }
  return {
    ...(faultCode === undefined ? {} : { faultCode }),
    ...(faultString === undefined ? {} : { faultString }),
    ...(upnpErrorCode === undefined ? {} : { upnpErrorCode }),
    ...(upnpErrorDescription === undefined ? {} : { upnpErrorDescription }),
  }
}

export function xmlTag(value: string, localName: string): string | undefined {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  const match = value.match(
    new RegExp(
      `<(?:[A-Za-z_][\\w.-]*:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${escaped}>`,
      "iu",
    ),
  )
  return match?.[1] === undefined ? undefined : decodeXml(match[1].trim())
}

export function xmlAttributes(value: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {}
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu
  for (const match of value.matchAll(pattern)) {
    const name = match[1]
    const encoded = match[2] ?? match[3]
    if (name !== undefined && encoded !== undefined) attributes[name] = decodeXml(encoded)
  }
  return attributes
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown network failure"
}
