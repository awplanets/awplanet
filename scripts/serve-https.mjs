import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureLocalHttpsCertificate } from "./create-local-https-cert.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const mode = process.argv[2] === "preview" ? "preview" : "dev";
const certificate = ensureLocalHttpsCertificate();
const args =
  mode === "preview"
    ? [viteBin, "preview", "--host", "0.0.0.0"]
    : [viteBin, "--host", "0.0.0.0"];

console.log("\nHTTPS is enabled.");
console.log(`Trust this CA on the phone once: ${certificate.ca}`);
console.log("Then open the Network HTTPS URL ending in /phone-pilot.\n");

const child = spawn(process.execPath, args, {
  cwd: projectRoot,
  env: {
    ...process.env,
    AWPLANET_HTTPS: "1",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
