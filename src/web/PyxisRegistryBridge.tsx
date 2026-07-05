import { RegistryContext } from "@effect/atom-react";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { useContext, useEffect } from "react";

export function PyxisRegistryBridge({
  onRegistry,
}: {
  readonly onRegistry: (registry: AtomRegistry.AtomRegistry) => void;
}) {
  const registry = useContext(RegistryContext);
  useEffect(() => {
    onRegistry(registry);
  }, [registry, onRegistry]);
  return null;
}
