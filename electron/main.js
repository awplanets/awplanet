import { app, BrowserWindow, Menu, shell } from "electron";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createPhonePilotMiddleware } from "../server/phonePilotMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const phonePilotMiddleware = createPhonePilotMiddleware();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

let desktopServer = null;
let desktopUrl = null;
let mainWindow = null;

const sendFile = (request, response, filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  response.statusCode = 200;
  response.setHeader("Content-Type", MIME_TYPES[extension] ?? "application/octet-stream");
  response.setHeader(
    "Cache-Control",
    filePath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-store"
  );
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    })
    .pipe(response);
};

const serveRenderer = (request, response) => {
  if (!["GET", "HEAD"].includes(request.method ?? "")) {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidatePath = path.resolve(distRoot, relativePath);
  const isInsideDist =
    candidatePath === distRoot || candidatePath.startsWith(`${distRoot}${path.sep}`);

  if (isInsideDist && existsSync(candidatePath) && statSync(candidatePath).isFile()) {
    sendFile(request, response, candidatePath);
    return;
  }

  const indexPath = path.join(distRoot, "index.html");
  if (existsSync(indexPath)) {
    sendFile(request, response, indexPath);
    return;
  }

  response.statusCode = 503;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("awplanet renderer build is missing. Run npm run build before launch.");
};

const startDesktopServer = () =>
  new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      phonePilotMiddleware(request, response, () => serveRenderer(request, response));
    });

    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve the desktop server port."));
        return;
      }
      desktopServer = server;
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });

const createWindow = async () => {
  const rendererUrl = desktopUrl ?? (await startDesktopServer());
  desktopUrl = rendererUrl;

  mainWindow = new BrowserWindow({
    title: "awplanet",
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#696969",
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(rendererUrl)) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(rendererUrl);
};

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await createWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    desktopServer?.close();
    desktopServer = null;
    desktopUrl = null;
  });
}
