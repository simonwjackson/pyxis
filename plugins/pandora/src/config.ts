import type { CapabilityContext } from "@pyxis/plugin-sdk"
import { PandoraError } from "./errors"
import type { PandoraConfig } from "./types"

export function pandoraConfig(context: CapabilityContext): PandoraConfig {
  const value = context.config
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("username" in value) ||
    typeof value.username !== "string" ||
    value.username.length === 0 ||
    !("password" in value) ||
    typeof value.password !== "string" ||
    value.password.length === 0
  ) {
    throw new PandoraError(
      "pandora.notConfigured",
      "Pandora requires username and password for this account",
      false,
    )
  }
  return { username: value.username, password: value.password }
}
