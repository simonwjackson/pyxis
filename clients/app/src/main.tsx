import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ReferenceApp } from "./reference/App.tsx"

const root = document.getElementById("root")
if (root === null) throw new Error("#root is missing")

createRoot(root).render(
  <StrictMode>
    <ReferenceApp />
  </StrictMode>,
)
