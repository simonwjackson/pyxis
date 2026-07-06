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
import "./lab-neutral.css";

import { createRoot } from "react-dom/client";

type PartModule = { readonly default?: React.ComponentType };

const modules = import.meta.glob<PartModule>("./coverflow/**/*.part.tsx", {
  eager: true,
});

const param = new URLSearchParams(location.search).get("part") ?? "";
const key = param.startsWith("./") ? param : `./${param}`;
const mod = modules[key];
const Part = mod?.default;

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root");

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
