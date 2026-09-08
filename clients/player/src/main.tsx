/// The composition root: the only place that builds the object graph.
///
/// It spawns the real worker and hands it to the shell as a plain port. Nothing below here
/// knows the worker exists, which is what makes the whole tree testable without one.

import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { spawnWorkerClient } from "../../app/src/worker/client.ts"
import { App } from "./bindings/App.binding.tsx"
import "./system-next/tokens.css"

const host = document.getElementById("root")
if (!host) throw new Error("Missing root")

// The token scope is also the container-query container, so it has to be a real element
// wrapping the tree rather than something a component applies to itself.
host.classList.add("px-scope")
host.dataset.theme = "dark"

// Built once, outside render. A worker client rebuilt on every render would restart
// reconciliation forever, which is exactly the trap the binding's stable-identity note warns
// about.
const edge = spawnWorkerClient(true)

createRoot(host).render(createElement(App, { edge }))
