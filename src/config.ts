import { Config, Effect, Layer } from "effect"
import type { PandoraConfig } from "./types/config.js"
import { ConfigError } from "./types/errors.js"

const PandoraConfigTag = Effect.Tag<PandoraConfig>()

export const PandoraConfigLive = Layer.effect(
  PandoraConfigTag,
  Effect.gen(function* () {
    const username = yield* Config.string("PANDORA_USERNAME").pipe(
      Config.withDefault("")
    )
    const password = yield* Config.string("PANDORA_PASSWORD").pipe(
      Config.withDefault("")
    )

    if (!username || !password) {
      return yield* Effect.fail(
        new ConfigError({ message: "PANDORA_USERNAME and PANDORA_PASSWORD required" })
      )
    }

    return { username, password }
  })
)

export { PandoraConfigTag as PandoraConfig }
