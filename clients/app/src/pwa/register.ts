export interface ServiceWorkerContainerLike {
  register(scriptURL: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration>
}

/// Start the offline shell without taking update choice away from the person using it.
/// The worker may claim this page, but the existing update banner still decides when the
/// document reloads onto a new bundle.
export async function registerPwa(
  serviceWorkers: ServiceWorkerContainerLike | undefined = globalThis.navigator?.serviceWorker,
): Promise<ServiceWorkerRegistration | undefined> {
  if (serviceWorkers === undefined) return undefined
  try {
    return await serviceWorkers.register("/service-worker.js", {
      scope: "/",
      type: "module",
      updateViaCache: "none",
    })
  } catch (cause) {
    console.warn("Pyxis offline shell could not start", cause)
    return undefined
  }
}
