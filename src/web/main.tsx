/**
 * @module Main
 * Application entry point. Production is the same Pyxis app mounted by Caliper,
 * with no fixture data or registry callback supplied.
 */

import { mountPyxis } from "./mountPyxis";
import {
  initializeWebClientAuthorization,
  migrateLegacyClientProfile,
} from "./shared/client/clientIdentity";
import "./index.css";

migrateLegacyClientProfile(
  new URL(window.location.href),
  window.sessionStorage,
  (url) => window.history.replaceState(window.history.state, "", url),
);
await initializeWebClientAuthorization();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

mountPyxis(rootElement);
