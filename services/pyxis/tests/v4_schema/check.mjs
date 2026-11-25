import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import Ajv2020 from "ajv/dist/2020"

const schema = JSON.parse(
  gunzipSync(readFileSync(new URL("./a0718de.schema.json.gz", import.meta.url))),
)
const ajv = new Ajv2020({ validateFormats: false })
ajv.addSchema(schema, "a0718de")
const validate = ajv.compile({ $ref: `a0718de#/$defs/${process.argv[2]}` })
if (!validate(JSON.parse(process.argv[3]))) throw new Error(ajv.errorsText(validate.errors))
