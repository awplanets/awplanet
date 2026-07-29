import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createPhonePilotMiddleware } from "./server/phonePilotMiddleware.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const localHttps =
  process.env.AWPLANET_HTTPS === "1"
    ? {
        cert: readFileSync(
          path.join(projectRoot, ".cert", "awplanet-local.pem")
        ),
        key: readFileSync(
          path.join(projectRoot, ".cert", "awplanet-local-key.pem")
        ),
      }
    : undefined;

const phonePilotPlugin = () => {
  const middleware = createPhonePilotMiddleware();

  return {
    name: "ai-native-phone-pilot",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
};

export default defineConfig({
  plugins: [react(), phonePilotPlugin()],
  server: {
    ...(localHttps ? { https: localHttps } : {}),
  },
  preview: {
    ...(localHttps ? { https: localHttps } : {}),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor-runtime";
          return undefined;
        },
      },
    },
  },
});
