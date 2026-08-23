import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { registerPwa } from "./pwa/register.ts"
import { ReferenceApp } from "./reference/App.tsx"
import { spawnWorkerClient } from "./worker/client.ts"

const root = document.getElementById("root")
if (root === null) throw new Error("#root is missing")

// Create infrastructure outside StrictMode. React invokes component initializers twice in
// development, and starting two database workers would give one page two storage owners.
const worker = spawnWorkerClient(true)
void registerPwa()

createRoot(root).render(
  <StrictMode>
    <ReferenceApp worker={worker} />
  </StrictMode>,
)
