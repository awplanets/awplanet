import { networkInterfaces } from "node:os";

const createPhonePilotState = () => ({
  frame: null,
  sessionId: null,
  updatedAt: 0,
  scene: null,
  cameraPose: null,
  cameraPoseUpdatedAt: 0,
  sceneSignature: "",
  sceneUpdatedAt: 0,
  settings: {
    phonePilotMoveScale: 7.5,
    source: "desktop",
    updatedAt: 0,
  },
  recordingCommand: null,
  recordingCommandSeq: 0,
  recordingAckSeq: 0,
  recordingState: "idle",
  recordingStatus: "Ready for remote capture.",
  recordingUpdatedAt: 0,
});

const PHONE_PILOT_CONNECTION_TIMEOUT_MS = 5000;
const PHONE_PILOT_RECORDING_STATUS_TIMEOUT_MS = 3200;

const readJsonBody = (request, maxBytes = 32_768) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Phone Pilot payload is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const sendJson = (response, payload, statusCode = 200) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
};

const getLocalAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry?.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);

const sanitizeNumber = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const sanitizeNumberArray = (value, length) => {
  if (!Array.isArray(value) || value.length < length) return null;
  const next = value.slice(0, length).map((entry) => sanitizeNumber(entry, NaN));
  return next.every(Number.isFinite) ? next : null;
};

export const createPhonePilotMiddleware = () => {
  const state = createPhonePilotState();
  const cameraClients = new Set();

  const sendCameraEvent = (response) => {
    response.write(
      `event: camera\n` +
        `data: ${JSON.stringify({
          cameraPose: state.cameraPose,
          cameraPoseUpdatedAt: state.cameraPoseUpdatedAt,
        })}\n\n`
    );
  };

  const broadcastCameraEvent = () => {
    for (const client of cameraClients) {
      try {
        sendCameraEvent(client);
      } catch {
        cameraClients.delete(client);
      }
    }
  };

  return async (request, response, next) => {
    if (!request.url?.startsWith("/__phone-pilot")) {
      next();
      return;
    }

    const url = new URL(request.url, "http://phone-pilot.local");
    const now = Date.now();

    if (request.method === "GET" && url.pathname === "/__phone-pilot/host") {
      const host = request.headers.host ?? "127.0.0.1:5173";
      const forwardedHost = String(
        request.headers["x-forwarded-host"] ?? ""
      ).split(",")[0].trim();
      const forwardedProtocol = String(
        request.headers["x-forwarded-proto"] ?? ""
      ).split(",")[0].trim();
      const protocol =
        forwardedProtocol === "https" || request.socket?.encrypted
          ? "https"
          : "http";
      const publicHost = forwardedHost || host;
      const parsedHost = new URL(`${protocol}://${host}`);
      const port = parsedHost.port || (protocol === "https" ? "443" : "5173");
      const urls = getLocalAddresses().map(
        (address) =>
          `${protocol}://${address}${
            ["80", "443"].includes(port) ? "" : `:${port}`
          }/phone-pilot`
      );
      const publicUrl = `${protocol}://${publicHost}/phone-pilot`;
      sendJson(response, {
        urls:
          forwardedHost || protocol === "https"
            ? [publicUrl, ...urls.filter((entry) => entry !== publicUrl)]
            : urls.length > 0
              ? urls
              : [publicUrl],
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/__phone-pilot/camera-stream") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      response.write(`event: hello\ndata: {"ok":true}\n\n`);
      if (state.cameraPose) {
        sendCameraEvent(response);
      }
      cameraClients.add(response);
      request.on("close", () => {
        cameraClients.delete(response);
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/__phone-pilot/state") {
      const connected = Boolean(
        state.frame && now - state.updatedAt < PHONE_PILOT_CONNECTION_TIMEOUT_MS
      );
      sendJson(response, {
        connected,
        ageMs: state.updatedAt > 0 ? now - state.updatedAt : null,
        frame: state.frame,
        settings: state.settings,
        cameraPose: state.cameraPose,
        cameraPoseUpdatedAt: state.cameraPoseUpdatedAt,
        sessionId: state.sessionId,
        updatedAt: state.updatedAt,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/camera") {
      try {
        const body = await readJsonBody(request);
        state.cameraPose = body.cameraPose ?? body;
        state.cameraPoseUpdatedAt = now;
        broadcastCameraEvent();
        sendJson(response, {
          ok: true,
          cameraPose: state.cameraPose,
          cameraPoseUpdatedAt: state.cameraPoseUpdatedAt,
        });
      } catch (error) {
        sendJson(
          response,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to update Phone Pilot camera.",
          },
          400
        );
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/settings") {
      try {
        const body = await readJsonBody(request);
        const phonePilotMoveScale = sanitizeNumber(
          body.phonePilotMoveScale,
          state.settings.phonePilotMoveScale
        );
        state.settings = {
          ...state.settings,
          phonePilotMoveScale: Math.min(42, Math.max(0, phonePilotMoveScale)),
          source: String(body.source ?? "phone"),
          updatedAt: now,
        };
        sendJson(response, { ok: true, settings: state.settings });
      } catch (error) {
        sendJson(
          response,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to update Phone Pilot settings.",
          },
          400
        );
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/__phone-pilot/recording") {
      const recordingStatusFresh =
        state.recordingUpdatedAt > 0 &&
        now - state.recordingUpdatedAt < PHONE_PILOT_RECORDING_STATUS_TIMEOUT_MS;
      sendJson(response, {
        command:
          state.recordingCommandSeq > state.recordingAckSeq
            ? state.recordingCommand
            : null,
        commandSeq: state.recordingCommandSeq,
        ackSeq: state.recordingAckSeq,
        state: recordingStatusFresh ? state.recordingState : "idle",
        status: recordingStatusFresh
          ? state.recordingStatus
          : "Ready for remote capture.",
        updatedAt: state.recordingUpdatedAt,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/recording") {
      try {
        const body = await readJsonBody(request);
        const action = String(body.action ?? "toggle");
        if (!["toggle", "start", "stop"].includes(action)) {
          sendJson(response, { ok: false, error: "Unknown recording action." }, 400);
          return;
        }
        state.recordingCommandSeq += 1;
        state.recordingCommand = {
          id: state.recordingCommandSeq,
          action,
          source: String(body.source ?? "phone"),
          requestedAt: now,
        };
        sendJson(response, {
          ok: true,
          command: state.recordingCommand,
          commandSeq: state.recordingCommandSeq,
        });
      } catch (error) {
        sendJson(
          response,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to queue recording command.",
          },
          400
        );
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/recording-status") {
      try {
        const body = await readJsonBody(request);
        const ackSeq = sanitizeNumber(body.ackSeq, state.recordingAckSeq);
        state.recordingAckSeq = Math.max(state.recordingAckSeq, ackSeq);
        state.recordingState = String(body.state ?? state.recordingState);
        state.recordingStatus = String(body.status ?? state.recordingStatus);
        state.recordingUpdatedAt = now;
        sendJson(response, {
          ok: true,
          ackSeq: state.recordingAckSeq,
          state: state.recordingState,
          status: state.recordingStatus,
          updatedAt: state.recordingUpdatedAt,
        });
      } catch (error) {
        sendJson(
          response,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to update recording status.",
          },
          400
        );
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/__phone-pilot/scene") {
      sendJson(response, {
        scene: state.scene,
        cameraPose: state.cameraPose,
        updatedAt: state.sceneUpdatedAt,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/scene") {
      try {
        const body = await readJsonBody(request, 3_000_000);
        const sceneSignature = JSON.stringify({
          scene: body.scene ?? null,
          cameraPose: body.cameraPose ?? null,
        });
        if (sceneSignature === state.sceneSignature) {
          sendJson(response, { ok: true, updatedAt: state.sceneUpdatedAt });
          return;
        }
        state.scene = body.scene ?? null;
        state.cameraPose = body.cameraPose ?? null;
        state.sceneSignature = sceneSignature;
        state.sceneUpdatedAt = now;
        sendJson(response, { ok: true, updatedAt: state.sceneUpdatedAt });
      } catch (error) {
        sendJson(
          response,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to sync Phone Pilot scene.",
          },
          400
        );
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/frame") {
      try {
        const body = await readJsonBody(request);
        const clientTime = sanitizeNumber(body.clientTime, now);
        if (
          state.frame &&
          Number.isFinite(state.frame.clientTime) &&
          clientTime < state.frame.clientTime
        ) {
          sendJson(response, { ok: true, stale: true, receivedAt: now });
          return;
        }
        const position = sanitizeNumberArray(body.position, 3);
        const quaternion = sanitizeNumberArray(body.quaternion, 4);
        state.frame = {
          source: String(body.source ?? "web"),
          yaw: sanitizeNumber(body.yaw),
          pitch: sanitizeNumber(body.pitch),
          roll: sanitizeNumber(body.roll),
          alpha: sanitizeNumber(body.alpha),
          beta: sanitizeNumber(body.beta),
          gamma: sanitizeNumber(body.gamma),
          ...(position ? { position } : {}),
          ...(quaternion ? { quaternion } : {}),
          trackingState:
            typeof body.trackingState === "string" ? body.trackingState : "unknown",
          absolute: Boolean(body.absolute),
          clientTime,
          sentAt: now,
        };
        state.sessionId = String(body.sessionId ?? "phone");
        state.updatedAt = now;
        sendJson(response, { ok: true, receivedAt: now });
      } catch (error) {
        sendJson(
          response,
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to read Phone Pilot frame.",
          },
          400
        );
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/__phone-pilot/reset") {
      state.frame = null;
      state.sessionId = null;
      state.updatedAt = 0;
      sendJson(response, { ok: true });
      return;
    }

    sendJson(response, { ok: false, error: "Unknown Phone Pilot endpoint." }, 404);
  };
};
