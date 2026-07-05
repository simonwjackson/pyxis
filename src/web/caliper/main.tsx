import "@simonwjackson/caliper/style.css";
import "../index.css";

import { pyxisLabSurfaceAdapter } from "./pyxis-adapter";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element for Pyxis Caliper lab");
}

const caliperPackage = "@simonwjackson/caliper";
const { createCaliperApp } = await import(caliperPackage);

createCaliperApp(root, {
  adapters: [pyxisLabSurfaceAdapter],
});
