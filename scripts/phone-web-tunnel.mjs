import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const cloudflaredCheck = spawnSync("cloudflared", ["--version"], {
  stdio: "ignore",
});

if (cloudflaredCheck.status !== 0) {
  console.error("cloudflared is required for the one-command public HTTPS URL.");
  console.error("macOS: brew install cloudflared");
  console.error("Then run: npm run phone:web");
  process.exit(1);
}

const vite = spawn(
  process.execPath,
  [viteBin, "--host", "0.0.0.0", "--port", "5173", "--strictPort"],
  {
    cwd: projectRoot,
    stdio: "inherit",
  }
);
const tunnel = spawn(
  "cloudflared",
  [
    "tunnel",
    "--url",
    "http://127.0.0.1:5173",
    "--no-autoupdate",
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
  }
);

const shutdown = (signal = "SIGTERM") => {
  vite.kill(signal);
  tunnel.kill(signal);
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

vite.on("exit", (code) => {
  tunnel.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
tunnel.on("exit", (code) => {
  vite.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
