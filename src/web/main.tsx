/**
 * @module Main
 * Application entry point. Production is the same Pyxis app mounted by Caliper,
 * with no fixture data or registry callback supplied.
 */

import { mountPyxis } from "./mountPyxis";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

mountPyxis(rootElement);
