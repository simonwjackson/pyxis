import "@simonwjackson/caliper/style.css";
import "../index.css";
import "./lab-surface.css";
import "./intrinsic.css";
import "./lab-neutral.css";

import { createCaliperApp } from "pyxis-caliper-runtime";
import { coverflowLabSurfaceAdapter } from "./coverflow-adapter";
import { pyxisLabSurfaceAdapter } from "./pyxis-adapter";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element for Pyxis Caliper lab");
}

createCaliperApp(root, {
  adapters: [pyxisLabSurfaceAdapter, coverflowLabSurfaceAdapter],
  partsGlob: import.meta.glob("./coverflow/**/*.part.tsx", { eager: true }),
});
