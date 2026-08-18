// Toggles the pnpm patch on or off and reinstalls, so the same checkout can
// demonstrate red (stock 3.2.7) and green (patched) runs. pnpm 11 reads
// patchedDependencies from pnpm-workspace.yaml, which this repo fully owns,
// so the script just writes one of two fixed states.
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const STOCK = `allowBuilds:
  esbuild: true
`;
const PATCHED = `${STOCK}patchedDependencies:
  "@handlewithcare/react-prosemirror@3.2.7": patches/@handlewithcare__react-prosemirror@3.2.7.patch
`;

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("usage: node scripts/toggle-patch.mjs <on|off>");
  process.exit(1);
}

writeFileSync("pnpm-workspace.yaml", mode === "on" ? PATCHED : STOCK);
execSync("pnpm install", { stdio: "inherit" });
// Vite pre-bundles the dependency at dev-server startup; drop the cache so a
// fresh server cannot serve the pre-toggle bundle.
rmSync("node_modules/.vite", { recursive: true, force: true });
console.log(`patch ${mode === "on" ? "applied" : "removed"}`);
console.log("note: restart `pnpm dev` if it is running; a live Vite server keeps serving the pre-toggle bundle.");
