import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { FoundationsBinding } from "../bindings/Foundations.binding.tsx"
import artworkUrl from "./assets/get-color.jpg"
import "../system-next/components.css"
import "./preview.css"

// Consumer-owned mount API. No Caliper imports, globals, data overrides or special renderer.
export function mountFoundations(
  host: HTMLElement,
  options: { readonly theme?: "light" | "dark" } = {},
) {
  const scope = document.createElement("div")
  scope.className = "px-scope px-specimen"
  scope.dataset.theme = options.theme ?? "dark"
  host.append(scope)
  const scopeId = `pyxis-${crypto.randomUUID()}`
  const root = createRoot(scope, { identifierPrefix: scopeId })
  root.render(createElement(FoundationsBinding, { scopeId, artworkUrl }))
  return {
    unmount() {
      root.unmount()
      scope.remove()
    },
  }
}
