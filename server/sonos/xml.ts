export function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function extractXmlTag(xml: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, "i"),
  );
  return match?.[1] === undefined
    ? undefined
    : decodeXmlEntities(match[1].trim());
}

export function extractXmlLocalTag(
  xml: string,
  localName: string,
): string | undefined {
  const escapedTag = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<(?:[\\w-]+:)?${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escapedTag}>`,
      "i",
    ),
  );
  return match?.[1] === undefined
    ? undefined
    : decodeXmlEntities(match[1].trim());
}

export function parseXmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const value = match[2] ?? match[3];
    if (name !== undefined && value !== undefined) {
      attributes[name] = decodeXmlEntities(value);
    }
  }
  return attributes;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
