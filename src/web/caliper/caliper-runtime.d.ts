declare module "pyxis-caliper-runtime" {
  export interface MountedCaliperApp {
    readonly dispose: () => void;
  }

  export function createCaliperApp(
    host: HTMLElement,
    options: {
      readonly adapters: readonly unknown[];
      readonly partsGlob?: Record<string, unknown>;
      readonly beforeMount?: () => void;
    },
  ): MountedCaliperApp;
}
