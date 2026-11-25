import { Option } from "effect"
import type { StoredWorkerSession, WorkerCollections } from "./contract"

export class SessionRows {
  private writing: Promise<void> = Promise.resolve()
  constructor(private readonly store: Pick<WorkerCollections, "sessions" | "retiredSessions">) {}

  // Persistent callers also hold the cross-tab account lock. Memory fallback needs
  // the same ordering for compound operations such as a marker check then an enqueue.
  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writing.then(operation)
    this.writing = result.then(
      () => {},
      () => {},
    )
    return result
  }

  async all(): Promise<readonly StoredWorkerSession[]> {
    const [rows, markers] = await Promise.all([
      this.store.sessions.all(),
      this.store.retiredSessions.all(),
    ])
    const retired = new Set(markers.map((row) => row.id))
    return rows.filter((row) => !retired.has(row.id))
  }
  async retired(id: string): Promise<boolean> {
    return (await this.store.retiredSessions.findById(id)) !== undefined
  }
  async get(id: string): Promise<Option.Option<StoredWorkerSession>> {
    if (await this.retired(id)) return Option.none()
    return Option.fromNullishOr(await this.store.sessions.findById(id))
  }
  async retire(id: string): Promise<boolean> {
    // Publish the marker first. Reads and writes honor it even if deletion fails.
    await this.store.retiredSessions.upsert({ id })
    return this.store.sessions.delete(id)
  }
}
