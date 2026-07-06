/**
 * @module preview
 *
 * Dev-only harness: renders a single lab part full-viewport so it can be
 * screenshotted for design verification. Reached at
 * `preview.html?part=coverflow/Editorial.template.part.tsx`. Not part of the
 * lab UI; purely a render target for the screenshot loop.
 */

import "@simonwjackson/caliper/style.css";
import "../index.css";
import "./lab-surface.css";
import "./intrinsic.css";
import "./lab-neutral.css";

import { createRoot } from "react-dom/client";

type PartModule = { readonly default?: React.ComponentType };

const modules = import.meta.glob<PartModule>("./coverflow/**/*.part.tsx", {
  eager: true,
});

const search = new URLSearchParams(location.search);
const param = search.get("part") ?? "";
const key = param.startsWith("./") ? param : `./${param}`;
const mod = modules[key];
const Part = mod?.default;

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root");

// Apply lab-knob CSS vars from the query, e.g. `&vars=--pyxis-title-scale:1.3`,
// so knob wiring can be screenshotted without the full lab knob UI.
for (const pair of (search.get("vars") ?? "").split(",")) {
  const [name, value] = pair.split(":");
  if (name?.startsWith("--") && value) el.style.setProperty(name, value);
}

createRoot(el).render(
  Part ? (
    <div style={{ position: "fixed", inset: 0 }}>
      <Part />
    </div>
  ) : (
    <div style={{ padding: 24, color: "#fff", fontFamily: "system-ui" }}>
      Part not found: <code>{param}</code>
      <br />
      Available: {Object.keys(modules).join(", ")}
    </div>
  ),
);
