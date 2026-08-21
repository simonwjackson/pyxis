import { createHash } from "node:crypto"
import type { PandoraApi } from "./api"
import { PandoraError } from "./errors"
import type { PandoraConfig, PandoraSession } from "./types"

interface CachedSession {
  readonly fingerprint: string
  readonly session: PandoraSession
}

export function createSessionManager(api: PandoraApi) {
  const sessions = new Map<string, CachedSession>()

  return {
    async withSession<T>(
      accountId: string,
      config: PandoraConfig,
      operation: (session: PandoraSession) => Promise<T>,
    ): Promise<T> {
      const fingerprint = configFingerprint(config)
      let cached = sessions.get(accountId)
      if (cached?.fingerprint !== fingerprint) {
        cached = { fingerprint, session: await api.login(config) }
        sessions.set(accountId, cached)
      }
      try {
        return await operation(cached.session)
      } catch (error) {
        if (!(error instanceof PandoraError) || error.apiCode !== 1001) throw error
        const refreshed = { fingerprint, session: await api.login(config) }
        sessions.set(accountId, refreshed)
        return operation(refreshed.session)
      }
    },
    clear(accountId: string) {
      sessions.delete(accountId)
    },
  }
}

function configFingerprint(config: PandoraConfig): string {
  return createHash("sha256")
    .update(config.username)
    .update("\0")
    .update(config.password)
    .digest("hex")
}
