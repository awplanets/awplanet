import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EngineProvider } from "../engine/core/EngineProvider";
import { RuntimeCanvas } from "../engine/runtime/RuntimeCanvas";
import {
  recenterRuntimePhonePilot,
  setRuntimePhonePilotEnabled,
  setRuntimePhonePilotFrame,
  setRuntimePhonePilotMirrorPose,
  setRuntimePhonePilotSettings,
} from "../engine/runtime/phonePilotRuntime";
import {
  createWebMotionFrame,
  getScreenOrientationAngle,
} from "./webMotion";

const createSessionId = () =>
  `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeAngle = (value) => {
  let next = value;
  while (next > 180) next -= 360;
  while (next < -180) next += 360;
  return next;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeVector = (value, length) => {
  if (!Array.isArray(value) || value.length < length) return null;
  const next = value.slice(0, length).map(Number);
  return next.every(Number.isFinite) ? next : null;
};

const normalizePilotFrame = (payload) => {
  const position = normalizeVector(payload?.position, 3);
  const quaternion = normalizeVector(payload?.quaternion, 4);
  return {
    source: typeof payload?.source === "string" ? payload.source : "web",
    sessionId:
      typeof payload?.sessionId === "string" ? payload.sessionId : null,
    yaw: normalizeAngle(Number(payload?.yaw ?? 0)),
    pitch: clamp(Number(payload?.pitch ?? 0), -90, 90),
    roll: clamp(Number(payload?.roll ?? 0), -90, 90),
    alpha: Number(payload?.alpha ?? 0),
    beta: Number(payload?.beta ?? 0),
    gamma: Number(payload?.gamma ?? 0),
    absolute: Boolean(payload?.absolute),
    ...(position ? { position } : {}),
    ...(quaternion ? { quaternion } : {}),
    trackingState:
      typeof payload?.trackingState === "string"
        ? payload.trackingState
        : "unknown",
  };
};

const getSyncedViewportAspect = (pose) => {
  const aspect = Number(pose?.aspect);
  if (Number.isFinite(aspect) && aspect > 0.25 && aspect < 5) return aspect;
  const viewport = pose?.viewport;
  if (Array.isArray(viewport) && viewport.length >= 2) {
    const width = Number(viewport[0]);
    const height = Number(viewport[1]);
    if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
      return width / height;
    }
  }
  return null;
};

const PHONE_PILOT_FRAME_INTERVAL_MS = 16;
const PHONE_PILOT_HEARTBEAT_INTERVAL_MS = 300;
const WEB_POSE_SETTLE_MS = 320;
const WEB_JOYSTICK_MOVE_SPEED = 0.68;
const WEB_JOYSTICK_MAX_POSITION = 12;
const WEB_JOYSTICK_DEAD_ZONE = 0.08;
const IS_NATIVE_PILOT_HOST =
  typeof window !== "undefined" &&
  window.__awplanetNativePilotHost === true;

export const PhonePilotPage = () => {
  const sessionId = useMemo(createSessionId, []);
  const trackingSessionIdRef = useRef(sessionId);
  const [active, setActive] = useState(false);
  const [motionState, setMotionState] = useState("idle");
  const [motionSource, setMotionSource] = useState(
    IS_NATIVE_PILOT_HOST ? "native" : "web"
  );
  const [recordingStatus, setRecordingStatus] = useState({
    state: "idle",
    status: "Ready for remote capture.",
  });
  const [phoneMoveScale, setPhoneMoveScale] = useState(7.5);
  const [webMoveVector, setWebMoveVector] = useState({ x: 0, z: 0 });
  const [syncedScene, setSyncedScene] = useState(null);
  const [syncedCameraPose, setSyncedCameraPose] = useState(null);
  const [mirrorAspectPose, setMirrorAspectPose] = useState(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const activeRef = useRef(false);
  const frameRef = useRef({
    yaw: 0,
    pitch: 0,
    roll: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
    absolute: false,
  });
  const lastPostedAtRef = useRef(0);
  const sceneUpdatedAtRef = useRef(0);
  const settingsUpdatedAtRef = useRef(0);
  const mirrorCameraUpdatedAtRef = useRef(0);
  const mirrorAspectRef = useRef(null);
  const nativePoseSeenRef = useRef(false);
  const webMotionHasFrameRef = useRef(false);
  const webOrientationFrameRef = useRef(null);
  const webFrameRequestRef = useRef(0);
  const webCalibrationUntilRef = useRef(0);
  const detachWebMotionRef = useRef(() => {});
  const webMovePointerIdRef = useRef(null);
  const webMoveVectorRef = useRef({ x: 0, z: 0 });
  const webMovePositionRef = useRef({ x: 0, z: 0 });
  const webMoveFrameRequestRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    let cancelled = false;

    const loadScene = async () => {
      try {
        const response = await fetch("/__phone-pilot/scene", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.scene) return;
        const updatedAt = Number(data.updatedAt ?? 0);
        if (updatedAt > 0 && updatedAt === sceneUpdatedAtRef.current) return;
        sceneUpdatedAtRef.current = updatedAt;
        setSyncedScene(data.scene);
        setSyncedCameraPose(data.cameraPose ?? null);
        setSceneRevision((revision) => updatedAt || revision + 1);
      } catch {
        // The page can still render the default scene if the bridge has no snapshot yet.
      }
    };

    loadScene();
    const interval = window.setInterval(loadScene, 700);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const initialEngineState = useMemo(() => {
    if (!syncedScene) {
      return {
        mode: "pilot",
        gameplay: {
          status: "phone-pilot",
          objectiveLabel: "Phone viewport",
          lastEvent: "Waiting for synced desktop scene.",
        },
      };
    }

    const scene = structuredClone(syncedScene);
    const activeScene = scene.scenes?.[scene.activeSceneId];
    if (activeScene?.camera) {
        activeScene.camera = {
        ...activeScene.camera,
        phonePilotEnabled: true,
        phonePilotStartPose: syncedCameraPose,
        phonePilotMoveScale: phoneMoveScale,
        position: syncedCameraPose?.position ?? activeScene.camera.position,
        target: syncedCameraPose?.target ?? activeScene.camera.target,
        fov: syncedCameraPose?.fov ?? activeScene.camera.fov ?? 45,
        pilotFov:
          syncedCameraPose?.fov ??
          activeScene.camera.pilotFov ??
          activeScene.camera.fov ??
          45,
      };
    }

    return {
      scene,
      mode: "pilot",
      gameplay: {
        status: "phone-pilot",
        objectiveLabel: "Phone viewport",
        lastEvent: "Synced phone viewport active.",
      },
      editor: {
        activeTool: "select",
      },
    };
  }, [phoneMoveScale, syncedCameraPose, syncedScene]);
  const syncedViewportAspect = getSyncedViewportAspect(
    mirrorAspectPose ?? syncedCameraPose
  );
  const viewportStyle = syncedViewportAspect
    ? {
        aspectRatio: `${syncedViewportAspect}`,
        width: `min(100vw, calc(100vh * ${syncedViewportAspect}))`,
        height: `min(100vh, calc(100vw / ${syncedViewportAspect}))`,
      }
    : undefined;

  const postPilotFrame = useCallback((frame) => {
    fetch("/__phone-pilot/frame", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...frame,
        clientTime: Date.now(),
        sessionId: trackingSessionIdRef.current,
      }),
    }).catch(() => {
      // Keep the local viewport responsive while the desktop bridge reconnects.
    });
  }, []);

  const readWebJoystickPosition = useCallback(
    () => [
      webMovePositionRef.current.x,
      0,
      webMovePositionRef.current.z,
    ],
    []
  );

  const receiveNativePose = useCallback((payload) => {
    if (pausedRef.current) return;
    const nextFrame = normalizePilotFrame({
      ...payload,
      source: payload?.source ?? "arkit",
      sessionId:
        payload?.sessionId ??
        trackingSessionIdRef.current,
    });
    if (nextFrame.source === "arkit" && !nativePoseSeenRef.current) {
      nativePoseSeenRef.current = true;
      detachWebMotionRef.current();
      setMotionSource("native");
      setMotionState("active");
    }
    frameRef.current = nextFrame;
    if (!activeRef.current) {
      setActive(true);
    }
    setRuntimePhonePilotEnabled(true);
    setRuntimePhonePilotFrame({
      connected: true,
      frame: nextFrame,
      ageMs: 0,
      updatedAt: Date.now(),
    });

    const now = performance.now();
    if (now - lastPostedAtRef.current < PHONE_PILOT_FRAME_INTERVAL_MS) return;
    lastPostedAtRef.current = now;
    // The native ARKit host posts directly to the bridge. Relaying the same
    // frame through WKWebView creates two interleaved streams and visible jitter.
    if (nextFrame.source !== "arkit") {
      postPilotFrame(nextFrame);
    }
  }, [postPilotFrame]);

  const stopWebMove = useCallback(() => {
    webMovePointerIdRef.current = null;
    webMoveVectorRef.current = { x: 0, z: 0 };
    setWebMoveVector({ x: 0, z: 0 });
    if (webMoveFrameRequestRef.current) {
      window.cancelAnimationFrame(webMoveFrameRequestRef.current);
      webMoveFrameRequestRef.current = 0;
    }
  }, []);

  const startWebMoveLoop = useCallback(() => {
    if (webMoveFrameRequestRef.current || IS_NATIVE_PILOT_HOST) return;
    let previousTimestamp = performance.now();

    const updateWebMove = (timestamp) => {
      const moveVector = webMoveVectorRef.current;
      if (
        pausedRef.current ||
        nativePoseSeenRef.current ||
        Math.hypot(moveVector.x, moveVector.z) < WEB_JOYSTICK_DEAD_ZONE
      ) {
        webMoveFrameRequestRef.current = 0;
        return;
      }

      const deltaSeconds = clamp(
        (timestamp - previousTimestamp) / 1000,
        1 / 240,
        1 / 30
      );
      previousTimestamp = timestamp;
      const nextX =
        webMovePositionRef.current.x +
        -moveVector.x * WEB_JOYSTICK_MOVE_SPEED * deltaSeconds;
      const nextZ =
        webMovePositionRef.current.z +
        moveVector.z * WEB_JOYSTICK_MOVE_SPEED * deltaSeconds;
      const nextLength = Math.hypot(nextX, nextZ);
      const positionScale =
        nextLength > WEB_JOYSTICK_MAX_POSITION
          ? WEB_JOYSTICK_MAX_POSITION / nextLength
          : 1;
      webMovePositionRef.current = {
        x: nextX * positionScale,
        z: nextZ * positionScale,
      };

      const orientationFrame = webOrientationFrameRef.current;
      if (orientationFrame) {
        receiveNativePose({
          ...orientationFrame,
          source: "web-controls",
          position: readWebJoystickPosition(),
        });
      }
      webMoveFrameRequestRef.current =
        window.requestAnimationFrame(updateWebMove);
    };

    webMoveFrameRequestRef.current =
      window.requestAnimationFrame(updateWebMove);
  }, [readWebJoystickPosition, receiveNativePose]);

  const updateWebJoystickFromPointer = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const travel = Math.max(1, Math.min(rect.width, rect.height) * 0.32);
    const rawX = (event.clientX - centerX) / travel;
    const rawZ = (centerY - event.clientY) / travel;
    const rawLength = Math.hypot(rawX, rawZ);
    const magnitude = Math.min(1, rawLength);
    const nextVector =
      rawLength < WEB_JOYSTICK_DEAD_ZONE
        ? { x: 0, z: 0 }
        : {
            x: (rawX / rawLength) * magnitude,
            z: (rawZ / rawLength) * magnitude,
          };
    webMoveVectorRef.current = nextVector;
    setWebMoveVector(nextVector);
  }, []);

  const startWebJoystick = useCallback(
    (event) => {
      event.preventDefault();
      webMovePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateWebJoystickFromPointer(event);
      startWebMoveLoop();
    },
    [startWebMoveLoop, updateWebJoystickFromPointer]
  );

  const moveWebJoystick = useCallback(
    (event) => {
      if (webMovePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      updateWebJoystickFromPointer(event);
      startWebMoveLoop();
    },
    [startWebMoveLoop, updateWebJoystickFromPointer]
  );

  const releaseWebJoystick = useCallback(
    (event) => {
      if (webMovePointerIdRef.current !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      stopWebMove();
    },
    [stopWebMove]
  );

  const startWebMotion = useCallback(async () => {
    pausedRef.current = false;
    if (IS_NATIVE_PILOT_HOST) {
      detachWebMotionRef.current();
      setMotionSource("native");
      setMotionState(nativePoseSeenRef.current ? "active" : "waiting");
      setActive(true);
      return;
    }
    if (nativePoseSeenRef.current) {
      setMotionSource("native");
      setMotionState("active");
      setActive(true);
      return;
    }

    if (
      !window.isSecureContext &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ) {
      setMotionState("insecure");
      return;
    }

    const OrientationEvent = window.DeviceOrientationEvent;
    if (!OrientationEvent) {
      setMotionState("unsupported");
      return;
    }

    setMotionState("requesting");
    try {
      const permissionRequests = [];
      if (typeof OrientationEvent.requestPermission === "function") {
        permissionRequests.push(OrientationEvent.requestPermission());
      }
      const permissions = await Promise.all(permissionRequests);
      if (permissions.some((permission) => permission !== "granted")) {
        setMotionState("denied");
        return;
      }

      detachWebMotionRef.current();
      webMotionHasFrameRef.current = false;
      webOrientationFrameRef.current = null;
      webMovePositionRef.current = { x: 0, z: 0 };
      stopWebMove();
      trackingSessionIdRef.current = createSessionId();
      webCalibrationUntilRef.current =
        performance.now() + WEB_POSE_SETTLE_MS;

      const publishWebFrame = () => {
        webFrameRequestRef.current = 0;
        const orientationFrame = webOrientationFrameRef.current;
        if (!orientationFrame || nativePoseSeenRef.current) return;
        if (performance.now() < webCalibrationUntilRef.current) return;
        if (!webMotionHasFrameRef.current) {
          webMotionHasFrameRef.current = true;
          setMotionSource("web");
          setMotionState("active");
        }
        receiveNativePose({
          ...orientationFrame,
          position: readWebJoystickPosition(),
        });
      };
      const scheduleWebFrame = () => {
        if (webFrameRequestRef.current) return;
        webFrameRequestRef.current = window.requestAnimationFrame(
          publishWebFrame
        );
      };
      const handleOrientation = (event) => {
        if (nativePoseSeenRef.current) return;
        const frame = createWebMotionFrame(
          event,
          getScreenOrientationAngle()
        );
        if (!frame) return;

        webOrientationFrameRef.current = frame;
        scheduleWebFrame();
      };
      window.addEventListener("deviceorientation", handleOrientation, true);
      detachWebMotionRef.current = () => {
        window.removeEventListener(
          "deviceorientation",
          handleOrientation,
          true
        );
        if (webFrameRequestRef.current) {
          window.cancelAnimationFrame(webFrameRequestRef.current);
          webFrameRequestRef.current = 0;
        }
        detachWebMotionRef.current = () => {};
      };
      setMotionState("waiting");
    } catch {
      setMotionState("error");
    }
  }, [readWebJoystickPosition, receiveNativePose, stopWebMove]);

  useEffect(() => {
    window.__awplanetPhonePilotPose = receiveNativePose;
    return () => {
      if (window.__awplanetPhonePilotPose === receiveNativePose) {
        delete window.__awplanetPhonePilotPose;
      }
    };
  }, [receiveNativePose]);

  useEffect(() => {
    setRuntimePhonePilotEnabled(active);
    if (!active) {
      setRuntimePhonePilotFrame({
        connected: false,
        frame: null,
        ageMs: null,
        updatedAt: 0,
      });
      return;
    }

    setRuntimePhonePilotFrame({
      connected: true,
      frame: frameRef.current,
      ageMs: 0,
      updatedAt: Date.now(),
    });

    return undefined;
  }, [active, sessionId]);

  useEffect(() => {
    if (!active) return undefined;

    // iOS may pause AR callbacks briefly while the device is held still or the
    // WKWebView is under load. Re-sending the last pose keeps the desktop link
    // alive without changing the camera transform.
    const interval = window.setInterval(() => {
      if (frameRef.current.source !== "arkit") {
        postPilotFrame(frameRef.current);
      }
    }, PHONE_PILOT_HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [active, postPilotFrame]);

  useEffect(
    () => () => {
      detachWebMotionRef.current();
      stopWebMove();
      setRuntimePhonePilotEnabled(false);
      setRuntimePhonePilotFrame({
        connected: false,
        frame: null,
        ageMs: null,
        updatedAt: 0,
      });
    },
    [stopWebMove]
  );

  useEffect(() => {
    setRuntimePhonePilotSettings({
      phonePilotMoveScale: phoneMoveScale,
    });
  }, [phoneMoveScale]);

  useEffect(() => {
    let cancelled = false;

    const pollRecording = async () => {
      try {
        const response = await fetch("/__phone-pilot/recording", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setRecordingStatus({
          state: typeof data.state === "string" ? data.state : "idle",
          status:
            typeof data.status === "string"
              ? data.status
              : "Ready for remote capture.",
        });
      } catch {
        // Recording control is optional; the viewport should keep running.
      }
    };

    pollRecording();
    const interval = window.setInterval(pollRecording, 700);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let eventSource = null;
    let fallbackTimeout = 0;

    const applyMirrorCamera = (cameraPose, updatedAt) => {
      if (
        cancelled ||
        !cameraPose ||
        updatedAt <= mirrorCameraUpdatedAtRef.current
      ) {
        return;
      }

      mirrorCameraUpdatedAtRef.current = updatedAt;
      setRuntimePhonePilotMirrorPose({
        pose: cameraPose,
        updatedAt,
      });

      const aspect = getSyncedViewportAspect(cameraPose);
      if (
        Number.isFinite(aspect) &&
        Math.abs(aspect - (mirrorAspectRef.current ?? 0)) > 0.001
      ) {
        mirrorAspectRef.current = aspect;
        setMirrorAspectPose(cameraPose);
      }
    };

    const pollMirrorCameraFallback = async () => {
      try {
        const response = await fetch("/__phone-pilot/state", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        const updatedAt = Number(data.cameraPoseUpdatedAt ?? 0);
        applyMirrorCamera(data.cameraPose, updatedAt);
      } catch {
        // If the desktop camera stream is temporarily unavailable, keep the last pose.
      } finally {
        if (!cancelled && (!eventSource || eventSource.readyState !== 1)) {
          fallbackTimeout = window.setTimeout(pollMirrorCameraFallback, 80);
        } else {
          fallbackTimeout = 0;
        }
      }
    };

    if ("EventSource" in window) {
      eventSource = new EventSource("/__phone-pilot/camera-stream");
      eventSource.addEventListener("camera", (event) => {
        try {
          if (fallbackTimeout) {
            window.clearTimeout(fallbackTimeout);
            fallbackTimeout = 0;
          }
          const data = JSON.parse(event.data);
          applyMirrorCamera(
            data.cameraPose,
            Number(data.cameraPoseUpdatedAt ?? 0)
          );
        } catch {
          // Ignore malformed streaming frames; the next valid camera frame will recover.
        }
      });
      eventSource.onerror = () => {
        if (!cancelled && !fallbackTimeout) {
          fallbackTimeout = window.setTimeout(pollMirrorCameraFallback, 120);
        }
      };
    } else {
      pollMirrorCameraFallback();
    }

    return () => {
      cancelled = true;
      eventSource?.close();
      window.clearTimeout(fallbackTimeout);
      setRuntimePhonePilotMirrorPose({
        pose: null,
        updatedAt: 0,
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollSettings = async () => {
      try {
        const response = await fetch("/__phone-pilot/state", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        const settings = data.settings;
        const updatedAt = Number(settings?.updatedAt ?? 0);
        const nextScale = Number(settings?.phonePilotMoveScale);
        if (
          cancelled ||
          settings?.source !== "desktop" ||
          !Number.isFinite(nextScale) ||
          updatedAt <= settingsUpdatedAtRef.current
        ) {
          return;
        }
        settingsUpdatedAtRef.current = updatedAt;
        setPhoneMoveScale(nextScale);
      } catch {
        // Phone movement scale still works locally if desktop polling is unavailable.
      }
    };

    pollSettings();
    const interval = window.setInterval(pollSettings, 700);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const updatePhoneMoveScale = (value) => {
    const nextValue = Math.min(42, Math.max(0, Number(value) || 0));
    setPhoneMoveScale(nextValue);
    fetch("/__phone-pilot/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phonePilotMoveScale: nextValue,
        source: "phone",
        sessionId,
      }),
    }).catch(() => {
      // Local runtime override is already applied; sync can resume later.
    });
  };

  const sendRecordingCommand = async () => {
    const action = recordingStatus.state === "recording" ? "stop" : "start";
    setRecordingStatus((current) => ({
      ...current,
      state: action === "stop" ? "saving" : "recording",
      status: action === "stop" ? "Stopping desktop capture..." : "Starting desktop capture...",
    }));
    try {
      await fetch("/__phone-pilot/recording", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          source: "phone",
          sessionId,
        }),
      });
    } catch {
      setRecordingStatus({
        state: "idle",
        status: "Cannot reach desktop recording bridge.",
      });
    }
  };

  const recenterWebMotion = () => {
    webMovePositionRef.current = { x: 0, z: 0 };
    stopWebMove();
    trackingSessionIdRef.current = createSessionId();
    webCalibrationUntilRef.current =
      performance.now() + WEB_POSE_SETTLE_MS;
    webMotionHasFrameRef.current = false;
    frameRef.current = {
      ...frameRef.current,
      position: [0, 0, 0],
    };
    recenterRuntimePhonePilot();
    setMotionState("active");
  };

  const pausePhonePilot = useCallback(() => {
    pausedRef.current = true;
    detachWebMotionRef.current();
    webMotionHasFrameRef.current = false;
    webOrientationFrameRef.current = null;
    webMovePositionRef.current = { x: 0, z: 0 };
    stopWebMove();
    webCalibrationUntilRef.current = 0;
    setActive(false);
    setMotionState("paused");
    setRuntimePhonePilotEnabled(false);
    setRuntimePhonePilotFrame({
      connected: false,
      frame: null,
      ageMs: null,
      updatedAt: Date.now(),
    });
    fetch("/__phone-pilot/reset", { method: "POST" }).catch(() => {
      // The local viewport is already paused; the bridge can reconnect later.
    });
  }, [stopWebMove]);

  const resumePhonePilot = useCallback(() => {
    pausedRef.current = false;
    recenterRuntimePhonePilot();
    if (nativePoseSeenRef.current) {
      setMotionSource("native");
      setMotionState("active");
      setActive(true);
      setRuntimePhonePilotEnabled(true);
      setRuntimePhonePilotFrame({
        connected: true,
        frame: frameRef.current,
        ageMs: 0,
        updatedAt: Date.now(),
      });
      return;
    }
    startWebMotion();
  }, [startWebMotion]);

  const motionMessage = {
    denied: "Motion access was declined. Enable Motion & Orientation Access, then retry.",
    error: "Motion could not start. Reload this page and try again.",
    idle: "Use this phone as the live camera controller.",
    insecure: "Open this page through HTTPS to enable phone motion.",
    requesting: "Requesting motion access...",
    unsupported: "This browser does not expose device orientation.",
    waiting: "Move the phone once to begin.",
    paused: "Phone control is paused.",
  }[motionState];

  return (
    <main className="phone-pilot-page phone-pilot-page--viewport">
      <section className="phone-pilot-viewport" style={viewportStyle}>
        <EngineProvider
          key={sceneRevision || "phone-default-scene"}
          initialState={initialEngineState}
        >
          <RuntimeCanvas profile="phone" />
        </EngineProvider>
      </section>
      {motionState !== "active" && motionState !== "paused" && (
        <section className="phone-pilot-motion-gate" aria-live="polite">
          <div className="phone-pilot-motion-gate__mark" aria-hidden="true">
            <span />
          </div>
          <strong>Phone Motion</strong>
          <p>{motionMessage}</p>
          <button
            disabled={motionState === "requesting"}
            type="button"
            onClick={startWebMotion}
          >
            {motionState === "requesting" ? "Connecting" : "Connect"}
          </button>
        </section>
      )}
      {(motionState === "active" || motionState === "paused") && (
        <div className="phone-pilot-connection-controls">
          <button
            className={`phone-pilot-connection-button ${
              motionState === "paused" ? "is-paused" : ""
            }`}
            type="button"
            onClick={
              motionState === "paused" ? resumePhonePilot : pausePhonePilot
            }
            aria-label={
              motionState === "paused"
                ? "Connect phone motion"
                : "Pause phone motion"
            }
          >
            <span aria-hidden="true" />
            <strong>{motionState === "paused" ? "Connect" : "Pause"}</strong>
          </button>
          {motionState === "active" && (
            <button
              className="phone-pilot-recenter-button"
              type="button"
              onClick={recenterWebMotion}
              aria-label="Recenter phone motion"
            >
              <span aria-hidden="true" />
              <strong>
                {motionSource === "native" ? "AR Center" : "Center"}
              </strong>
            </button>
          )}
        </div>
      )}
      {!IS_NATIVE_PILOT_HOST && motionState === "active" && (
        <div
          className="phone-pilot-move-joystick"
          role="application"
          aria-label="360 degree camera movement joystick"
          onPointerDown={startWebJoystick}
          onPointerMove={moveWebJoystick}
          onPointerUp={releaseWebJoystick}
          onPointerCancel={stopWebMove}
          onLostPointerCapture={stopWebMove}
        >
          <span className="phone-pilot-move-joystick__direction is-forward">
            ↑
          </span>
          <span className="phone-pilot-move-joystick__direction is-right">
            →
          </span>
          <span className="phone-pilot-move-joystick__direction is-backward">
            ↓
          </span>
          <span className="phone-pilot-move-joystick__direction is-left">
            ←
          </span>
          <span className="phone-pilot-move-joystick__guide" />
          <span
            className="phone-pilot-move-joystick__thumb"
            style={{
              transform: `translate(${webMoveVector.x * 36}px, ${
                -webMoveVector.z * 36
              }px)`,
            }}
          />
        </div>
      )}
      <button
        className={`phone-pilot-record-button ${
          recordingStatus.state === "recording" ? "is-recording" : ""
        }`}
        disabled={recordingStatus.state === "saving"}
        type="button"
        onClick={sendRecordingCommand}
      >
        <span aria-hidden="true" />
        <strong>
          {recordingStatus.state === "recording"
            ? "Stop"
            : recordingStatus.state === "saving"
              ? "Saving"
              : "Record"}
        </strong>
      </button>
      <label className="phone-pilot-move-scale">
        <span>
          <strong>Move</strong>
          <em>{phoneMoveScale.toFixed(2)}</em>
        </span>
        <input
          max="42"
          min="0"
          step="0.25"
          type="range"
          value={phoneMoveScale}
          onChange={(event) => updatePhoneMoveScale(event.target.value)}
        />
      </label>
    </main>
  );
};
