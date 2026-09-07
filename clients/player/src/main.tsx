import { mountFoundations } from "./preview/mount.tsx"

// Local foundation milestone entry. Product routes replace this entry after screen work.
const root = document.getElementById("root")
if (!root) throw new Error("Missing root")
mountFoundations(root)
