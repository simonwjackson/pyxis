import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import Ajv2020 from "ajv/dist/2020"

const schema = JSON.parse(
  gunzipSync(readFileSync(new URL("./a0718de.schema.json.gz", import.meta.url))),
)
const ajv = new Ajv2020({ validateFormats: false })
ajv.addSchema(schema, "a0718de")
const validate = ajv.compile({ $ref: `a0718de#/$defs/${process.argv[2]}` })
const message = JSON.parse(process.argv[3])
if (validate(message) !== (process.argv[4] === "accept"))
  throw new Error(`unexpected a0718de result: ${ajv.errorsText(validate.errors)}`)
if (process.argv[4] === "reject") {
  ajv.addSchema(
    JSON.parse(
      readFileSync(new URL("../../../../contracts/generated/pyxis.schema.json", import.meta.url)),
    ),
    "current",
  )
  if (!ajv.validate(`current#/$defs/${process.argv[2]}`, message)) throw new Error(ajv.errorsText())
}
