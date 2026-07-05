import "@simonwjackson/caliper/style.css";
import "../index.css";
import "./lab-surface.css";

import { createCaliperApp } from "pyxis-caliper-runtime";
import { pyxisLabSurfaceAdapter } from "./pyxis-adapter";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element for Pyxis Caliper lab");
}

createCaliperApp(root, {
  adapters: [pyxisLabSurfaceAdapter],
});
