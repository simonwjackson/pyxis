type CanonicalPrimitive = string | number | boolean | null;
export type CanonicalParityValue =
  | CanonicalPrimitive
  | readonly CanonicalParityValue[]
  | { readonly [key: string]: CanonicalParityValue };

export type ContractParityOptions = {
  readonly volatileKeys?: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalizeRecord(
  value: Record<string, unknown>,
  options: Required<ContractParityOptions>,
): { readonly [key: string]: CanonicalParityValue } {
  const volatile = new Set(options.volatileKeys);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => !volatile.has(key) && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [
        key,
        canonicalizeContractPayload(entry, options),
      ]),
  );
}

export function canonicalizeContractPayload(
  value: unknown,
  options: ContractParityOptions = {},
): CanonicalParityValue {
  const normalizedOptions = { volatileKeys: options.volatileKeys ?? [] };

  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError(
        "Parity payloads must not contain non-finite numbers",
      );
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) =>
      canonicalizeContractPayload(entry, normalizedOptions),
    );
  }
  if (isRecord(value)) return canonicalizeRecord(value, normalizedOptions);
  if (value === undefined) return null;
  throw new TypeError(`Unsupported parity payload value: ${typeof value}`);
}
