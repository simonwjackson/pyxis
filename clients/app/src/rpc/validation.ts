import Ajv2020, { type ValidateFunction } from "ajv/dist/2020"
import type { RpcRequest, RpcResponse } from "../../../../contracts/generated/pyxis"
import contractSchema from "../../../../contracts/generated/pyxis.schema.json"

const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  formats: {
    uint8: {
      type: "number",
      validate: (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 0xff,
    },
    uint16: {
      type: "number",
      validate: (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffff,
    },
    uint32: {
      type: "number",
      validate: (value: number) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff,
    },
    uint64: {
      type: "number",
      validate: (value: number) => Number.isSafeInteger(value) && value >= 0,
    },
    int64: {
      type: "number",
      validate: (value: number) => Number.isSafeInteger(value),
    },
    float: { type: "number", validate: (value: number) => Number.isFinite(value) },
    double: { type: "number", validate: (value: number) => Number.isFinite(value) },
  },
})
ajv.addSchema(contractSchema, "pyxis-contract")

function validator<T>(definition: "RpcRequest" | "RpcResponse"): ValidateFunction<T> {
  return ajv.compile<T>({ $ref: `pyxis-contract#/$defs/${definition}` })
}

const requestValidator = validator<RpcRequest>("RpcRequest")
const responseValidator = validator<RpcResponse>("RpcResponse")

export function assertRpcRequest(value: unknown): asserts value is RpcRequest {
  assertValid(requestValidator, value, "request")
}

export function assertRpcResponse(value: unknown): asserts value is RpcResponse {
  assertValid(responseValidator, value, "response")
}

function assertValid<T>(
  validate: ValidateFunction<T>,
  value: unknown,
  kind: string,
): asserts value is T {
  if (validate(value)) return
  const detail = validate.errors?.[0]
  throw new Error(
    detail === undefined
      ? `Invalid RPC ${kind}`
      : `Invalid RPC ${kind} at ${detail.instancePath || "/"}: ${detail.message}`,
  )
}
