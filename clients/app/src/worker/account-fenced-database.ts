import type { WorkerDatabase } from "./contract"

/// Access must refresh the current database and hold its cross-tab lock for the operation.
export function accountFencedDatabase(
  initial: WorkerDatabase,
  expectedAccountId: string | undefined,
  access: <T>(operation: (current: WorkerDatabase) => Promise<T>) => Promise<T>,
): WorkerDatabase {
  return new Proxy(initial, {
    get(target, property, receiver) {
      const initialValue = Reflect.get(target, property, receiver)
      if (typeof initialValue !== "function") return initialValue
      return (...args: unknown[]) =>
        access(async (current) => {
          if ((await current.settings()).accountId !== expectedAccountId) {
            throw new Error("account changed while sync was in flight")
          }
          const value = Reflect.get(current, property)
          return value.apply(current, args)
        })
    },
  })
}
