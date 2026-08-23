export interface ByteRange {
  readonly start: number
  readonly end: number
}

/// Parse one HTTP byte range against a known complete body.
export function parseRangeHeader(
  header: string | null,
  size: number,
): ByteRange | "invalid" | undefined {
  if (header === null || header.trim() === "") return undefined
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (match === null || size <= 0) return "invalid"
  const [, startRaw = "", endRaw = ""] = match
  if (startRaw === "" && endRaw === "") return "invalid"
  if (startRaw === "") {
    const suffix = Number(endRaw)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid"
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(startRaw)
  if (!Number.isSafeInteger(start) || start >= size) return "invalid"
  if (endRaw === "") return { start, end: size - 1 }
  const end = Number(endRaw)
  if (!Number.isSafeInteger(end) || end < start) return "invalid"
  return { start, end: Math.min(end, size - 1) }
}

/// Turn a complete cached response into the 200/206/416 response an audio element expects.
export async function rangeResponse(cached: Response, request: Request): Promise<Response> {
  const contentType = cached.headers.get("content-type") ?? "application/octet-stream"
  const candidateId = cached.headers.get("x-pyxis-candidate-id")
  const common = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    ...(candidateId === null ? {} : { "x-pyxis-candidate-id": candidateId }),
  }

  const rangeHeader = request.headers.get("range")
  if (rangeHeader === null) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        ...common,
        ...(cached.headers.get("content-length") === null
          ? {}
          : { "content-length": cached.headers.get("content-length") as string }),
      },
    })
  }
  // Legacy full-body cache entries need Blob slicing for seeks. Schema-8 downloads use
  // chunk manifests and never enter this fallback.
  const blob = await cached.blob()
  const range = parseRangeHeader(rangeHeader, blob.size)
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "content-range": `bytes */${blob.size}` },
    })
  }
  if (range === undefined) throw new Error("range parser lost a present header")
  const slice = blob.slice(range.start, range.end + 1)
  return new Response(slice, {
    status: 206,
    headers: {
      ...common,
      "content-length": String(slice.size),
      "content-range": `bytes ${range.start}-${range.end}/${blob.size}`,
    },
  })
}
