/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { useEngine } from "../../../core/useEngine";
import {
  pushRuntimePilotTakeSample,
  setRuntimeCameraPose,
  setRuntimeCameraYaw,
} from "../../runtimeCameraState";
import {
  commitRuntimeTimelineCaptureFrame,
  getRuntimeTimelinePlaybackFrame,
} from "../../runtimeTimelineState";
import { phonePilotRuntimeState } from "../../phonePilotRuntime";
import { getEvaluatedActiveScene } from "../../evaluatedScene";
import { canTimelineControlViewport } from "../../timelineViewportPriority";
import { sampleSculptedHeight } from "../../../terrain/terrainSculpt";

const FOLLOW_CAMERA_MODES = new Set(["first-person", "third-person", "isometric"]);
const WHEEL_ZOOM_MODES = new Set(["third-person", "isometric"]);
const LOCOMOTION_CAMERA_STABLE_STATES = new Set([
  "walkForward",
  "walkBack",
  "walkLeft",
  "walkRight",
  "runForward",
  "runBack",
  "runLeft",
  "runRight",
]);
const LOCOMOTION_SUPPRESSED_SWAY_MOTIONS = new Set([
  "arc",
  "handheld",
  "orbit",
  "pan",
  "truck",
]);
const CAMERA_OCCLUSION_PADDING = 1.15;
const CAMERA_OCCLUSION_MIN_DISTANCE = 2.4;
const CAMERA_OCCLUSION_TARGET_CLEARANCE_MIN = 2.25;
const CAMERA_OCCLUSION_TARGET_CLEARANCE_RATIO = 0.38;
const CAMERA_OCCLUSION_REFRESH_INTERVAL = 0.35;
const CAMERA_GROUND_CLEARANCE = 0.62;
const CAMERA_GROUND_SOFTNESS = 0.85;
const CAMERA_POINTER_SENSITIVITY = 0.0045;
const CAMERA_MANUAL_MOTION_HOLD = 0.48;
const FOLLOW_CAMERA_VERTICAL_DEADBAND = 0.18;
const FOLLOW_CAMERA_VERTICAL_SNAP_DISTANCE = 2.8;
const FOLLOW_CAMERA_VERTICAL_WALK_LAMBDA = 2.4;
const FOLLOW_CAMERA_VERTICAL_IDLE_LAMBDA = 8;
const VERTIGO_FACE_FOCUS_HEIGHT = 5.65;
const PILOT_POINTER_SENSITIVITY = 0.00175;
const PILOT_PITCH_LIMIT = Math.PI * 0.485;
const PILOT_LOOK_SMOOTHING = 6.2;
const PILOT_POSE_PUBLISH_INTERVAL = 1 / 60;
const PHONE_MIRROR_SMOOTHING = 38;
const PILOT_DIAGNOSTIC_INTERVAL = 0.75;
const PILOT_INPUT_LAG_MIN = 16;
const PILOT_INPUT_LAG_MAX = 3.6;
const PILOT_SWING_LAG = 5.8;
const PILOT_SWING_LOOK = 0.58;
const PILOT_SWING_ROLL = 0.085;
const ORBIT_FIRST_PERSON_MIN_DISTANCE = 0.85;
const PHONE_PILOT_MAX_RAW_STEP = 0.35;
const PHONE_PILOT_POSITION_STEP_EPSILON = 0.0004;
const PHONE_PILOT_MAX_OFFSET = 95;
const PILOT_CAMERA_MAX_HORIZONTAL_RADIUS = 420;
const PILOT_CAMERA_MAX_HEIGHT = 180;

const isTextEntryKeyboardTarget = (target) => {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  if (!(target instanceof HTMLInputElement)) {
    return Boolean(target?.isContentEditable);
  }

  return [
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "url",
  ].includes(target.type);
};

const normalizePilotKey = (event) => {
  if (event.code === "Space" || event.key === " ") return "space";
  return event.key.toLowerCase();
};

const smoothValue = (current, target, lambda, delta) =>
  THREE.MathUtils.damp(current, target, lambda, delta);

const smoothFloor = (value, floor, softness) => {
  const normalized = (value - floor) / softness;
  if (normalized > 18) return value;
  if (normalized < -18) return floor;
  return floor + Math.log1p(Math.exp(normalized)) * softness;
};

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

const angleDistance = (from, to) => wrapAngle(to - from);

const smoothAngleValue = (current, target, lambda, delta) =>
  wrapAngle(
    current + angleDistance(current, target) * (1 - Math.exp(-lambda * delta))
  );

const readPhonePosition = (position) => {
  if (!Array.isArray(position) || position.length < 3) return null;
  const x = Number(position[0]);
  const y = Number(position[1]);
  const z = Number(position[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? { x, y, z }
    : null;
};

const clampFov = (fov) => THREE.MathUtils.clamp(fov, 22, 82);

const smoothPulse = (time) => (Math.sin(time) + 1) * 0.5;

const easedPulse = (time) => {
  const pulse = smoothPulse(time);
  return pulse * pulse * (3 - 2 * pulse);
};

const easeInOut = (value) => {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const projectionChanged = (previous, next) =>
  Math.abs((previous.near ?? 0) - next.near) > 0.0001 ||
  Math.abs((previous.far ?? 0) - next.far) > 0.25 ||
  Math.abs((previous.fov ?? 0) - next.fov) > 0.025;

const getPitchOrbit = (viewPitch, mode) => {
  const pitchAngle = Math.atan(viewPitch * 0.82);
  const minHorizontalScale =
    mode === "third-person" || mode === "isometric" ? 0.08 : 0.34;
  return {
    horizontalScale: Math.max(minHorizontalScale, Math.cos(pitchAngle)),
    verticalScale: Math.sin(pitchAngle),
  };
};

const isValidVector = (value, length) =>
  Array.isArray(value) &&
  value.length >= length &&
  value.slice(0, length).every((entry) => Number.isFinite(Number(entry)));

const readVector = (value, fallback) =>
  isValidVector(value, fallback.length)
    ? value.slice(0, fallback.length).map(Number)
    : fallback;

const isFiniteVector3 = (value) =>
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Number.isFinite(value.z);

const finiteNumber = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const getEntityTargetPosition = ({
  activeScene,
  entityId,
  fallback,
  scene,
  target,
}) => {
  const entity = activeScene.entities[entityId] ?? activeScene.entities.hero;
  if (!entity) {
    return target.copy(fallback);
  }

  if (entity.id === "hero") {
    const character = scene.getObjectByName("HeroCharacter");
    if (character) {
      character.getWorldPosition(target);
      const characterHeight =
        entity.targetHeight ?? activeScene.entities.hero?.targetHeight ?? 6.8;
      target.y += characterHeight * 0.72;
      return target;
    }
  }

  const position = entity.position ?? fallback.toArray();
  const targetHeight =
    entity.targetHeight ??
    (entity.collider?.height ? entity.collider.height : undefined) ??
    (entity.scale?.[1] ? Math.min(Math.max(entity.scale[1], 1), 8) : 2.2);
  target.set(
    Number(position[0]) || 0,
    (Number(position[1]) || 0) + targetHeight * 0.58,
    Number(position[2]) || 0
  );
  return target;
};

export const CameraRig = ({ heroRuntimeTransformRef } = {}) => {
  const controlsRef = useRef();
  const editorCameraInitializedRef = useRef(false);
  const hasFramedCharacterRef = useRef(false);
  const frameAttemptsRef = useRef(0);
  const frameClockRef = useRef(0);
  const boundsRef = useRef(new THREE.Box3());
  const sizeRef = useRef(new THREE.Vector3());
  const centerRef = useRef(new THREE.Vector3());
  const targetRef = useRef(new THREE.Vector3());
  const cameraTargetRef = useRef(new THREE.Vector3());
  const followTargetYRef = useRef(null);
  const followTargetSignatureRef = useRef("");
  const desiredPositionRef = useRef(new THREE.Vector3());
  const desiredLookAtRef = useRef(new THREE.Vector3());
  const smoothedThirdPersonLookAtRef = useRef(new THREE.Vector3());
  const thirdPersonLookAtSignatureRef = useRef("");
  const occlusionSafePositionRef = useRef(new THREE.Vector3());
  const occlusionDirectionRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const occludersRef = useRef([]);
  const occluderClockRef = useRef(0);
  const forwardRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const horizontalMotionRef = useRef(new THREE.Vector3());
  const headAnchorRef = useRef(new THREE.Vector3());
  const pilotForwardRef = useRef(new THREE.Vector3());
  const pilotRightRef = useRef(new THREE.Vector3());
  const pilotUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const pilotInputRef = useRef(new THREE.Vector3());
  const pilotRawInputRef = useRef(new THREE.Vector3());
  const pilotDesiredVelocityRef = useRef(new THREE.Vector3());
  const pilotVelocityRef = useRef(new THREE.Vector3());
  const pilotStepRef = useRef(new THREE.Vector3());
  const pilotPositionRef = useRef(new THREE.Vector3());
  const pilotLookAtRef = useRef(new THREE.Vector3());
  const lastSafePilotPositionRef = useRef(new THREE.Vector3(0, 20, 30));
  const lastSafePilotLookAtRef = useRef(new THREE.Vector3(0, 7, 0));
  const pilotLookSwingRef = useRef(new THREE.Vector3());
  const pilotLookSwingTargetRef = useRef(new THREE.Vector3());
  const pilotKeysRef = useRef(new Set());
  const pilotInitializedRef = useRef(false);
  const pilotYawRef = useRef(Math.PI);
  const pilotPitchRef = useRef(0);
  const pilotYawTargetRef = useRef(Math.PI);
  const pilotPitchTargetRef = useRef(0);
  const pilotPreviousYawRef = useRef(Math.PI);
  const pilotRollRef = useRef(0);
  const phonePilotYawBaseRef = useRef(Math.PI);
  const phonePilotPitchBaseRef = useRef(0);
  const phonePilotRollBaseRef = useRef(0);
  const phonePilotRollOffsetRef = useRef(0);
  const phonePilotFrameBaseRef = useRef(false);
  const phonePilotRawPositionBaseRef = useRef(null);
  const phonePilotSessionIdRef = useRef(null);
  const phonePilotRawStepRef = useRef(new THREE.Vector3());
  const phonePilotPositionBaseRef = useRef(new THREE.Vector3());
  const phonePilotPositionOffsetRef = useRef(new THREE.Vector3());
  const phonePilotPositionTargetRef = useRef(new THREE.Vector3());
  const phonePilotMoveForwardRef = useRef(new THREE.Vector3());
  const phonePilotMoveRightRef = useRef(new THREE.Vector3());
  const phonePilotRecenterVersionRef = useRef(-1);
  const phoneMirrorInitializedRef = useRef(false);
  const phoneMirrorPositionRef = useRef(new THREE.Vector3());
  const phoneMirrorQuaternionRef = useRef(new THREE.Quaternion());
  const phoneMirrorEulerRef = useRef(new THREE.Euler());
  const phoneMirrorMatrixRef = useRef(new THREE.Matrix4());
  const phoneMirrorTargetRef = useRef(new THREE.Vector3());
  const viewYawRef = useRef(Math.PI);
  const viewYawTargetRef = useRef(Math.PI);
  const viewPitchRef = useRef(0);
  const viewPitchTargetRef = useRef(0);
  const smoothViewPitchRef = useRef(0);
  const motionClockRef = useRef(0);
  const motionSignatureRef = useRef("");
  const manualMotionHoldRef = useRef(0);
  const cameraDiagnosticClockRef = useRef(0);
  const runtimePosePublishClockRef = useRef(0);
  const projectionRef = useRef({
    near: null,
    far: null,
    fov: null,
  });
  const orbitOffsetRef = useRef({
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
  });
  const pointerDragRef = useRef({
    active: false,
    button: null,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  });
  const pendingPointerDeltaRef = useRef({
    button: null,
    x: 0,
    y: 0,
  });
  const smoothSettingsRef = useRef({
    distance: 18,
    height: 8,
    eyeHeight: 5.6,
    lookHeight: 3.4,
    fov: 45,
    targetLead: 0.8,
    lateralOffset: 0,
    pitchBias: 0,
    motionAmplitude: 0,
    motionSpeed: 0.4,
    motionPhase: 0,
    fovSwing: 0,
    cameraRoll: 0,
    compositionX: 0,
    compositionY: 0,
  });
  const runtimePoseTargetRef = useRef(new THREE.Vector3());
  const wheelZoomRef = useRef({
    baseDistance: 18,
    targetDistance: 18,
  });
  const { engineState } = useEngine();
  const liveScene = getEvaluatedActiveScene(engineState.scene, null);
  const timelineViewportAllowed = canTimelineControlViewport({
    mode: engineState.mode,
    editorTool: engineState.editor?.activeTool,
    phonePilotEnabled: liveScene.camera?.phonePilotEnabled,
    phoneRuntimeEnabled: phonePilotRuntimeState.enabled,
  });
  const activeScene = getEvaluatedActiveScene(
    engineState.scene,
    timelineViewportAllowed ? getRuntimeTimelinePlaybackFrame() : null
  );
  const isPlayMode = engineState.mode === "play";
  const isPilotMode = engineState.mode === "pilot";
  const cameraControlsEnabled =
    !isPlayMode && !isPilotMode && engineState.editor?.activeTool === "camera-move";
  const cameraSettings = useMemo(
    () => {
      const rawCameraSettings = activeScene.camera ?? {};
      if (isPilotMode) {
        return {
          ...rawCameraSettings,
          mode: "pilot",
        };
      }

      if (!isPlayMode) {
        return {
          ...rawCameraSettings,
          mode: "orbit",
        };
      }

      return FOLLOW_CAMERA_MODES.has(rawCameraSettings.mode)
        ? rawCameraSettings
        : {
            ...rawCameraSettings,
            mode: "third-person",
          };
    },
    [activeScene.camera, isPilotMode, isPlayMode]
  );
  const phonePilotStartPoseSignature = useMemo(
    () => JSON.stringify(cameraSettings.phonePilotStartPose ?? null),
    [cameraSettings.phonePilotStartPose]
  );
  const { camera, gl, scene } = useThree();

  const publishRuntimeCameraPose = ({
    force = false,
    commitCapture = true,
  } = {}) => {
    const mode = cameraSettings.mode ?? "orbit";
    const isPilotCamera = mode === "pilot" || cameraSettings.phonePilotEnabled;
    const phonePilotActive = Boolean(
      cameraSettings.phonePilotEnabled || phonePilotRuntimeState.enabled
    );
    const shouldPostToPhone =
      phonePilotActive &&
      (force || !isPilotCamera || runtimePosePublishClockRef.current <= 0);
    const target = runtimePoseTargetRef.current;
    const usesEditorOrbitTarget =
      !FOLLOW_CAMERA_MODES.has(mode) &&
      mode !== "pilot" &&
      !cameraSettings.phonePilotEnabled;
    if (usesEditorOrbitTarget && controlsRef.current?.target) {
      target.copy(controlsRef.current.target);
    } else {
      camera.getWorldDirection(forwardRef.current);
      target.copy(camera.position).addScaledVector(forwardRef.current, 12);
    }
    const publishedPose = setRuntimeCameraPose({
      position: camera.position.toArray(),
      rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      target: target.toArray(),
      fov: camera.fov,
      aspect: camera.aspect,
      viewport: [gl.domElement.clientWidth, gl.domElement.clientHeight],
    }, {
      // The desktop timeline consumes this pose at render rate. Only the
      // phone transport is throttled; throttling the local pose made camera
      // clips record at 24 fps while characters were sampled at 60 fps.
      postToPhone: shouldPostToPhone,
    });
    if (shouldPostToPhone && isPilotCamera) {
      runtimePosePublishClockRef.current = PILOT_POSE_PUBLISH_INTERVAL;
    }
    if (commitCapture) {
      commitRuntimeTimelineCaptureFrame(publishedPose);
    }
  };

  useEffect(() => {
    const mode = cameraSettings.mode ?? "orbit";
    const position = readVector(cameraSettings.position, [0, 20, 30]);
    const target = readVector(cameraSettings.target, [0, 7, 0]);
    const isFollowMode = FOLLOW_CAMERA_MODES.has(mode);
    const isPilotCamera = mode === "pilot" || cameraSettings.phonePilotEnabled;
    const shouldApplyOrbitPose =
      isPlayMode ||
      isPilotMode ||
      cameraControlsEnabled ||
      !editorCameraInitializedRef.current;

    camera.near = 0.1;
    camera.far = isPilotCamera ? 520 : 220;
    if (!isFollowMode) {
      camera.fov = clampFov(
        isPilotCamera
          ? finiteNumber(cameraSettings.pilotFov ?? cameraSettings.fov, 45)
          : finiteNumber(cameraSettings.fov, 45)
      );
    }
    camera.updateProjectionMatrix();

    if (!isFollowMode && !isPilotCamera && shouldApplyOrbitPose) {
      camera.position.set(position[0], position[1], position[2]);
    }

    if (
      controlsRef.current &&
      !isFollowMode &&
      !isPilotCamera &&
      shouldApplyOrbitPose
    ) {
      controlsRef.current.target.set(target[0], target[1], target[2]);
      controlsRef.current.minDistance = Math.min(
        cameraSettings.minDistance ?? ORBIT_FIRST_PERSON_MIN_DISTANCE,
        ORBIT_FIRST_PERSON_MIN_DISTANCE
      );
      controlsRef.current.maxDistance = cameraSettings.maxDistance ?? 90;
      controlsRef.current.update();
    }
    if (!isPlayMode && !isPilotMode) {
      editorCameraInitializedRef.current = true;
    }
  }, [camera, cameraControlsEnabled, cameraSettings, isPilotMode, isPlayMode]);

  useEffect(() => {
    const nextYaw = cameraSettings.viewYaw ?? viewYawRef.current;
    const nextPitch = cameraSettings.viewPitch ?? viewPitchRef.current;
    viewYawRef.current = nextYaw;
    viewYawTargetRef.current = nextYaw;
    viewPitchRef.current = nextPitch;
    viewPitchTargetRef.current = nextPitch;
    smoothViewPitchRef.current = viewPitchRef.current;
  }, [cameraSettings.viewPitch, cameraSettings.viewYaw]);

  useEffect(() => {
    const motionSignature = [
      cameraSettings.preset ?? "custom",
      cameraSettings.motionType ?? "none",
      cameraSettings.motionLoop ?? true,
      cameraSettings.motionAmplitude ?? 0,
      cameraSettings.motionSpeed ?? 0.4,
      cameraSettings.motionPhase ?? 0,
    ].join(":");

    if (motionSignatureRef.current === motionSignature) return;
    motionSignatureRef.current = motionSignature;
    motionClockRef.current = 0;
  }, [
    cameraSettings.motionAmplitude,
    cameraSettings.motionLoop,
    cameraSettings.motionPhase,
    cameraSettings.motionSpeed,
    cameraSettings.motionType,
    cameraSettings.preset,
  ]);

  useEffect(() => {
    const element = gl.domElement;

    const onPointerDown = (event) => {
      const mode = cameraSettings.mode ?? "orbit";
      if (mode === "pilot") {
        if (event.button !== 0 && event.button !== 2) return;
        event.preventDefault();
        pointerDragRef.current = {
          active: true,
          button: event.button,
          pointerId: event.pointerId,
          lastX: event.clientX,
          lastY: event.clientY,
        };
        pendingPointerDeltaRef.current = {
          button: event.button,
          x: 0,
          y: 0,
        };
        element.setPointerCapture?.(event.pointerId);
        return;
      }

      if (!FOLLOW_CAMERA_MODES.has(mode)) return;
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      if (event.button === 2) {
        viewYawTargetRef.current = viewYawRef.current;
        viewPitchTargetRef.current = viewPitchRef.current;
      }
      pointerDragRef.current = {
        active: true,
        button: event.button,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      pendingPointerDeltaRef.current = {
        button: event.button,
        x: 0,
        y: 0,
      };
      element.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      const drag = pointerDragRef.current;
      if (!drag.active) return;
      const coalescedEvents = event.getCoalescedEvents?.() ?? [];
      const latestEvent =
        coalescedEvents.length > 0
          ? coalescedEvents[coalescedEvents.length - 1]
          : event;
      const nextX = Number(latestEvent.clientX);
      const nextY = Number(latestEvent.clientY);
      const deltaX = Number.isFinite(nextX) ? nextX - drag.lastX : 0;
      const deltaY = Number.isFinite(nextY) ? nextY - drag.lastY : 0;
      drag.lastX = Number.isFinite(nextX) ? nextX : drag.lastX;
      drag.lastY = Number.isFinite(nextY) ? nextY : drag.lastY;
      pendingPointerDeltaRef.current.button = drag.button;
      pendingPointerDeltaRef.current.x += deltaX;
      pendingPointerDeltaRef.current.y += deltaY;
    };

    const stopDrag = (event) => {
      if (
        pointerDragRef.current.button === 0 &&
        cameraSettings.mode !== "pilot"
      ) {
        orbitOffsetRef.current.targetYaw = 0;
        orbitOffsetRef.current.targetPitch = 0;
      }
      pointerDragRef.current.active = false;
      pointerDragRef.current.button = null;
      pointerDragRef.current.pointerId = null;
      pendingPointerDeltaRef.current = {
        button: null,
        x: 0,
        y: 0,
      };
      if (event?.pointerId !== undefined) {
        element.releasePointerCapture?.(event.pointerId);
      }
    };

    const onContextMenu = (event) => {
      const mode = cameraSettings.mode ?? "orbit";
      if (FOLLOW_CAMERA_MODES.has(mode) || mode === "pilot") {
        event.preventDefault();
      }
    };

    const onWheel = (event) => {
      const mode = cameraSettings.mode ?? "orbit";
      if (mode === "pilot") {
        event.preventDefault();
        return;
      }
      if (!WHEEL_ZOOM_MODES.has(mode)) return;
      event.preventDefault();
      const configuredDistance = cameraSettings.followDistance ?? 18;
      const zoom = wheelZoomRef.current;
      if (zoom.baseDistance !== configuredDistance) {
        zoom.baseDistance = configuredDistance;
        zoom.targetDistance = configuredDistance;
      }
      const zoomStep = Math.max(1, Math.abs(event.deltaY) * 0.024);
      const direction = event.deltaY > 0 ? 1 : -1;
      const minDistance = mode === "isometric" ? 8 : ORBIT_FIRST_PERSON_MIN_DISTANCE;
      const maxDistance = mode === "isometric" ? 140 : 90;
      zoom.targetDistance = THREE.MathUtils.clamp(
        zoom.targetDistance + direction * zoomStep,
        minDistance,
        maxDistance
      );
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", stopDrag);
    element.addEventListener("pointercancel", stopDrag);
    element.addEventListener("contextmenu", onContextMenu);
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", stopDrag);
      element.removeEventListener("pointercancel", stopDrag);
      element.removeEventListener("contextmenu", onContextMenu);
      element.removeEventListener("wheel", onWheel);
      const pointerId = pointerDragRef.current.pointerId;
      if (pointerId !== null && element.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture?.(pointerId);
      }
      pointerDragRef.current = {
        active: false,
        button: null,
        pointerId: null,
        lastX: 0,
        lastY: 0,
      };
      pendingPointerDeltaRef.current = {
        button: null,
        x: 0,
        y: 0,
      };
    };
  }, [cameraSettings.followDistance, cameraSettings.mode, gl.domElement]);

  useEffect(() => {
    if (!isPilotMode) {
      pilotKeysRef.current.clear();
      pilotVelocityRef.current.set(0, 0, 0);
      pilotInputRef.current.set(0, 0, 0);
      pilotRawInputRef.current.set(0, 0, 0);
      pilotLookSwingRef.current.set(0, 0, 0);
      pilotLookSwingTargetRef.current.set(0, 0, 0);
      pilotYawTargetRef.current = pilotYawRef.current;
      pilotPitchTargetRef.current = pilotPitchRef.current;
      pilotRollRef.current = 0;
      pilotInitializedRef.current = false;
      return undefined;
    }

    const onKeyDown = (event) => {
      if (isTextEntryKeyboardTarget(event.target)) return;
      pilotKeysRef.current.add(normalizePilotKey(event));
      if (
        ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"].includes(event.code)
      ) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event) => {
      pilotKeysRef.current.delete(normalizePilotKey(event));
      if (
        ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"].includes(event.code)
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isPilotMode]);

  useEffect(() => {
    if (cameraSettings.phonePilotEnabled) {
      pilotInitializedRef.current = false;
      phonePilotFrameBaseRef.current = false;
      phonePilotRawPositionBaseRef.current = null;
      phonePilotPositionOffsetRef.current.set(0, 0, 0);
      phonePilotPositionTargetRef.current.set(0, 0, 0);
      return;
    }

    if (!isPilotMode) {
      pilotInitializedRef.current = false;
      pilotVelocityRef.current.set(0, 0, 0);
      phonePilotFrameBaseRef.current = false;
      phonePilotRawPositionBaseRef.current = null;
      phonePilotPositionOffsetRef.current.set(0, 0, 0);
      phonePilotPositionTargetRef.current.set(0, 0, 0);
    }
  }, [cameraSettings.phonePilotEnabled, isPilotMode, phonePilotStartPoseSignature]);

  useFrame((_, delta) => {
    runtimePosePublishClockRef.current = Math.max(
      0,
      runtimePosePublishClockRef.current - delta
    );
    const cameraQuaternionIsFinite = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ].every(Number.isFinite);
    if (
      !isFiniteVector3(camera.position) ||
      !cameraQuaternionIsFinite ||
      !Number.isFinite(camera.fov)
    ) {
      const recoveryPosition = readVector(cameraSettings.position, [0, 20, 30]);
      const recoveryTarget = readVector(cameraSettings.target, [0, 7, 0]);
      camera.position.fromArray(recoveryPosition);
      camera.up.set(0, 1, 0);
      camera.lookAt(...recoveryTarget);
      camera.fov = clampFov(finiteNumber(cameraSettings.fov, 44));
      camera.near = 0.1;
      camera.far = 620;
      camera.updateProjectionMatrix();
      pilotInitializedRef.current = false;
      document.body.dataset.cameraRecoveryCount = String(
        Number(document.body.dataset.cameraRecoveryCount ?? 0) + 1
      );
    }
    const timelinePlaybackCamera = timelineViewportAllowed
      ? getRuntimeTimelinePlaybackFrame()?.camera
      : null;
    if (timelinePlaybackCamera) {
      if (isValidVector(timelinePlaybackCamera.position, 3)) {
        camera.position.set(
          Number(timelinePlaybackCamera.position[0]),
          Number(timelinePlaybackCamera.position[1]),
          Number(timelinePlaybackCamera.position[2])
        );
      }
      if (isValidVector(timelinePlaybackCamera.rotation, 3)) {
        camera.rotation.set(
          Number(timelinePlaybackCamera.rotation[0]),
          Number(timelinePlaybackCamera.rotation[1]),
          Number(timelinePlaybackCamera.rotation[2])
        );
      } else if (isValidVector(timelinePlaybackCamera.target, 3)) {
        camera.lookAt(
          Number(timelinePlaybackCamera.target[0]),
          Number(timelinePlaybackCamera.target[1]),
          Number(timelinePlaybackCamera.target[2])
        );
      }

      const nextProjection = {
        near: 0.1,
        far: 620,
        fov: clampFov(Number(timelinePlaybackCamera.fov) || camera.fov),
      };
      const nextAspect = Number(timelinePlaybackCamera.aspect);
      const aspectChanged =
        Number.isFinite(nextAspect) &&
        Math.abs(camera.aspect - nextAspect) > 0.0001;
      if (projectionChanged(projectionRef.current, nextProjection) || aspectChanged) {
        projectionRef.current = nextProjection;
        camera.near = nextProjection.near;
        camera.far = nextProjection.far;
        camera.fov = nextProjection.fov;
        if (Number.isFinite(nextAspect)) {
          camera.aspect = nextAspect;
        }
        camera.updateProjectionMatrix();
      }
      return;
    }
    const mode = cameraSettings.mode ?? "orbit";
    if (mode === "pilot" || cameraSettings.phonePilotEnabled) {
      const mirrorPose = phonePilotRuntimeState.mirrorPose;
      if (mirrorPose && isValidVector(mirrorPose.position, 3)) {
        const mirrorPosition = phoneMirrorPositionRef.current.set(
          Number(mirrorPose.position[0]),
          Number(mirrorPose.position[1]),
          Number(mirrorPose.position[2])
        );
        const mirrorQuaternion = phoneMirrorQuaternionRef.current;
        if (isValidVector(mirrorPose.rotation, 3)) {
          phoneMirrorEulerRef.current.set(
            Number(mirrorPose.rotation[0]),
            Number(mirrorPose.rotation[1]),
            Number(mirrorPose.rotation[2]),
            camera.rotation.order
          );
          mirrorQuaternion.setFromEuler(phoneMirrorEulerRef.current);
        } else if (isValidVector(mirrorPose.target, 3)) {
          phoneMirrorTargetRef.current.set(
            Number(mirrorPose.target[0]),
            Number(mirrorPose.target[1]),
            Number(mirrorPose.target[2])
          );
          phoneMirrorMatrixRef.current.lookAt(
            mirrorPosition,
            phoneMirrorTargetRef.current,
            camera.up
          );
          mirrorQuaternion.setFromRotationMatrix(phoneMirrorMatrixRef.current);
        } else {
          mirrorQuaternion.copy(camera.quaternion);
        }

        if (!phoneMirrorInitializedRef.current) {
          camera.position.copy(mirrorPosition);
          camera.quaternion.copy(mirrorQuaternion);
          phoneMirrorInitializedRef.current = true;
        } else {
          const mirrorDelta = Math.max(1 / 120, Math.min(delta, 1 / 15));
          const mirrorAlpha = 1 - Math.exp(-PHONE_MIRROR_SMOOTHING * mirrorDelta);
          camera.position.lerp(mirrorPosition, mirrorAlpha);
          camera.quaternion.slerp(mirrorQuaternion, mirrorAlpha);
        }

        const nextProjection = {
          near: 0.035,
          far: 620,
          fov: clampFov(Number(mirrorPose.fov) || camera.fov),
        };
        const nextAspect = Number(mirrorPose.aspect);
        const fovChanged = Math.abs(camera.fov - nextProjection.fov) > 0.0001;
        const aspectChanged =
          Number.isFinite(nextAspect) && Math.abs(camera.aspect - nextAspect) > 0.0001;
        if (
          projectionChanged(projectionRef.current, nextProjection) ||
          fovChanged ||
          aspectChanged
        ) {
          projectionRef.current = nextProjection;
          camera.near = nextProjection.near;
          camera.far = nextProjection.far;
          camera.fov = nextProjection.fov;
          if (Number.isFinite(nextAspect)) {
            camera.aspect = nextAspect;
          }
          camera.updateProjectionMatrix();
        }
        publishRuntimeCameraPose();
        return;
      }
      phoneMirrorInitializedRef.current = false;

      if (!pilotInitializedRef.current) {
        const startPose = cameraSettings.phonePilotStartPose;
        if (Array.isArray(startPose?.position) && startPose.position.length >= 3) {
          camera.position.set(
            Number(startPose.position[0]) || 0,
            Number(startPose.position[1]) || 0,
            Number(startPose.position[2]) || 0
          );
        }
        if (Array.isArray(startPose?.rotation) && startPose.rotation.length >= 3) {
          camera.rotation.set(
            Number(startPose.rotation[0]) || 0,
            Number(startPose.rotation[1]) || 0,
            Number(startPose.rotation[2]) || 0
          );
        }
        if (Number.isFinite(startPose?.fov)) {
          camera.fov = startPose.fov;
          camera.updateProjectionMatrix();
        }
        const direction = pilotForwardRef.current;
        camera.getWorldDirection(direction);
        pilotYawRef.current = Math.atan2(direction.x, direction.z);
        pilotPitchRef.current = Math.asin(
          THREE.MathUtils.clamp(direction.y, -0.999, 0.999)
        );
        pilotPreviousYawRef.current = pilotYawRef.current;
        pilotPositionRef.current.copy(camera.position);
        pilotVelocityRef.current.set(0, 0, 0);
        pilotInputRef.current.set(0, 0, 0);
        pilotRawInputRef.current.set(0, 0, 0);
        pilotLookSwingRef.current.set(0, 0, 0);
        pilotLookSwingTargetRef.current.set(0, 0, 0);
        pilotYawTargetRef.current = pilotYawRef.current;
        pilotPitchTargetRef.current = pilotPitchRef.current;
        pilotRollRef.current = 0;
        phonePilotYawBaseRef.current = pilotYawRef.current;
        phonePilotPitchBaseRef.current = pilotPitchRef.current;
        phonePilotRollBaseRef.current = 0;
        phonePilotRollOffsetRef.current = 0;
        phonePilotFrameBaseRef.current = false;
        phonePilotRawPositionBaseRef.current = null;
        phonePilotPositionBaseRef.current.copy(pilotPositionRef.current);
        phonePilotPositionOffsetRef.current.set(0, 0, 0);
        phonePilotPositionTargetRef.current.set(0, 0, 0);
        phonePilotRecenterVersionRef.current =
          phonePilotRuntimeState.recenterVersion;
        pilotInitializedRef.current = true;
      }

      const frameDelta = Math.max(1 / 120, Math.min(delta, 1 / 30));
      const pendingPointerDelta = pendingPointerDeltaRef.current;
      const hasPendingPointerDelta =
        pendingPointerDelta.button !== null &&
        (pendingPointerDelta.x !== 0 || pendingPointerDelta.y !== 0);
      if (hasPendingPointerDelta) {
        const pilotLookSpeed = THREE.MathUtils.clamp(
          cameraSettings.pilotLookSpeed ?? 0.72,
          0.2,
          1.6
        );
        pilotYawTargetRef.current = wrapAngle(
          pilotYawTargetRef.current -
            pendingPointerDelta.x * PILOT_POINTER_SENSITIVITY * pilotLookSpeed
        );
        pilotPitchTargetRef.current = THREE.MathUtils.clamp(
          pilotPitchTargetRef.current -
            pendingPointerDelta.y * PILOT_POINTER_SENSITIVITY * pilotLookSpeed,
          -PILOT_PITCH_LIMIT,
          PILOT_PITCH_LIMIT
        );
        pendingPointerDelta.x = 0;
        pendingPointerDelta.y = 0;
      }
      const pilotLookSmoothing =
        cameraSettings.pilotLookSmoothing ?? PILOT_LOOK_SMOOTHING;
      pilotYawRef.current = smoothAngleValue(
        pilotYawRef.current,
        pilotYawTargetRef.current,
        pilotLookSmoothing,
        frameDelta
      );
      pilotPitchRef.current = smoothValue(
        pilotPitchRef.current,
        pilotPitchTargetRef.current,
        pilotLookSmoothing,
        frameDelta
      );

      const phonePilot =
        cameraSettings.phonePilotEnabled && phonePilotRuntimeState.enabled
          ? phonePilotRuntimeState
          : null;
      const phoneFrame =
        phonePilot?.connected && phonePilot.frame ? phonePilot.frame : null;
      const up = pilotUpRef.current;
      let hasPhonePositionTarget = false;
      let hasPhonePositionStep = false;
      let phoneMoveSmoothing = Math.max(
        1,
        cameraSettings.phonePilotSmoothing ?? 10
      );
      if (phoneFrame) {
        const lookAmount = THREE.MathUtils.clamp(
          cameraSettings.phonePilotLookAmount ?? 1,
          0,
          1.8
        );
        const pitchAmount = THREE.MathUtils.clamp(
          cameraSettings.phonePilotPitchAmount ?? 0.78,
          0,
          1.4
        );
        const rollAmount = THREE.MathUtils.clamp(
          cameraSettings.phonePilotRollAmount ?? 0.28,
          0,
          1
        );
        const isArkitFrame = phoneFrame.source === "arkit";
        const phoneYawSign = isArkitFrame ? -1 : 1;
        const phonePitchSign = 1;
        const phoneYawOffset =
          phoneYawSign *
          THREE.MathUtils.degToRad(finiteNumber(phoneFrame.yaw, 0)) *
          lookAmount;
        const phonePitchOffset =
          phonePitchSign *
          THREE.MathUtils.degToRad(finiteNumber(phoneFrame.pitch, 0)) *
          pitchAmount;
        const phoneRollOffset =
          THREE.MathUtils.degToRad(finiteNumber(phoneFrame.roll, 0)) * rollAmount;
        const phonePosition = readPhonePosition(phoneFrame.position);
        const phoneSessionId =
          typeof phoneFrame.sessionId === "string"
            ? phoneFrame.sessionId
            : null;

        if (
          phoneSessionId &&
          phoneSessionId !== phonePilotSessionIdRef.current
        ) {
          phonePilotSessionIdRef.current = phoneSessionId;
          phonePilotFrameBaseRef.current = false;
          phonePilotRawPositionBaseRef.current = null;
          phonePilotPositionBaseRef.current.copy(pilotPositionRef.current);
          phonePilotPositionOffsetRef.current.set(0, 0, 0);
          phonePilotPositionTargetRef.current.set(0, 0, 0);
        }

        if (
          !phonePilotFrameBaseRef.current ||
          phonePilotRecenterVersionRef.current !==
          phonePilotRuntimeState.recenterVersion
        ) {
          phonePilotYawBaseRef.current = wrapAngle(
            pilotYawRef.current - phoneYawOffset
          );
          phonePilotPitchBaseRef.current = THREE.MathUtils.clamp(
            pilotPitchRef.current - phonePitchOffset,
            -PILOT_PITCH_LIMIT,
            PILOT_PITCH_LIMIT
          );
          phonePilotRollBaseRef.current = -phoneRollOffset;
          phonePilotRawPositionBaseRef.current = phonePosition
            ? { ...phonePosition }
            : null;
          phonePilotPositionBaseRef.current.copy(pilotPositionRef.current);
          phonePilotPositionOffsetRef.current.set(0, 0, 0);
          phonePilotPositionTargetRef.current.set(0, 0, 0);
          phonePilotFrameBaseRef.current = true;
          phonePilotRecenterVersionRef.current =
            phonePilotRuntimeState.recenterVersion;
        }

        const phoneSmoothing = phoneMoveSmoothing;
        pilotYawRef.current = smoothAngleValue(
          pilotYawRef.current,
          wrapAngle(phonePilotYawBaseRef.current + phoneYawOffset),
          phoneSmoothing,
          frameDelta
        );
        pilotPitchRef.current = smoothValue(
          pilotPitchRef.current,
          THREE.MathUtils.clamp(
            phonePilotPitchBaseRef.current + phonePitchOffset,
            -PILOT_PITCH_LIMIT,
            PILOT_PITCH_LIMIT
          ),
          phoneSmoothing,
          frameDelta
        );
        pilotYawTargetRef.current = pilotYawRef.current;
        pilotPitchTargetRef.current = pilotPitchRef.current;
        phonePilotRollOffsetRef.current = smoothValue(
          phonePilotRollOffsetRef.current,
          phonePilotRollBaseRef.current + phoneRollOffset,
          phoneSmoothing,
          frameDelta
        );

        if (phonePosition) {
          if (!phonePilotRawPositionBaseRef.current) {
            phonePilotRawPositionBaseRef.current = { ...phonePosition };
            phonePilotPositionBaseRef.current.copy(pilotPositionRef.current);
            phonePilotPositionOffsetRef.current.set(0, 0, 0);
          }
          const previousPosition = phonePilotRawPositionBaseRef.current;
          const rawStep = phonePilotRawStepRef.current.set(
            phonePosition.x - previousPosition.x,
            phonePosition.y - previousPosition.y,
            phonePosition.z - previousPosition.z
          );
          phonePilotRawPositionBaseRef.current = { ...phonePosition };
          const moveScale = THREE.MathUtils.clamp(
            phonePilotRuntimeState.settings.phonePilotMoveScale ??
              cameraSettings.phonePilotMoveScale ??
              7.5,
            0,
            42
          );
          const heightAmount = THREE.MathUtils.clamp(
            cameraSettings.phonePilotHeightAmount ?? 0.65,
            0,
            2
          );
          const rawStepLengthSq = rawStep.lengthSq();
          if (
            rawStepLengthSq <=
              PHONE_PILOT_MAX_RAW_STEP * PHONE_PILOT_MAX_RAW_STEP &&
            rawStepLengthSq >
              PHONE_PILOT_POSITION_STEP_EPSILON *
                PHONE_PILOT_POSITION_STEP_EPSILON
          ) {
            hasPhonePositionStep = true;
            const movementYaw =
              phoneFrame.source === "web-controls"
                ? pilotYawRef.current
                : phonePilotYawBaseRef.current;
            phonePilotMoveForwardRef.current
              .set(Math.sin(movementYaw), 0, Math.cos(movementYaw))
              .normalize();
            phonePilotMoveRightRef.current
              .set(Math.cos(movementYaw), 0, -Math.sin(movementYaw))
              .normalize();
            phonePilotPositionTargetRef.current
              .addScaledVector(
                phonePilotMoveRightRef.current,
                rawStep.x * moveScale
              )
              .addScaledVector(
                phonePilotMoveForwardRef.current,
                rawStep.z * moveScale
              )
              .addScaledVector(
                up,
                rawStep.y * moveScale * heightAmount
              );
          }
          if (phonePilotPositionTargetRef.current.length() > PHONE_PILOT_MAX_OFFSET) {
            phonePilotPositionTargetRef.current.setLength(PHONE_PILOT_MAX_OFFSET);
          }
          hasPhonePositionTarget = true;
          phoneMoveSmoothing = phoneSmoothing;
        }
      } else {
        phonePilotFrameBaseRef.current = false;
        phonePilotRollOffsetRef.current = smoothValue(
          phonePilotRollOffsetRef.current,
          0,
          8,
          frameDelta
        );
      }

      const pilotLockTarget =
        cameraSettings.pilotLockTargetEnabled && !phoneFrame
          ? getEntityTargetPosition({
              activeScene,
              entityId: cameraSettings.pilotLockTargetEntityId ?? "hero",
              fallback: lastSafePilotLookAtRef.current,
              scene,
              target: targetRef.current,
            })
          : null;
      if (pilotLockTarget) {
        const lockDirection = forwardRef.current
          .subVectors(pilotLockTarget, camera.position);
        if (lockDirection.lengthSq() > 0.0001) {
          lockDirection.normalize();
          const lockedYaw = Math.atan2(lockDirection.x, lockDirection.z);
          const lockedPitch = Math.asin(
            THREE.MathUtils.clamp(lockDirection.y, -0.999, 0.999)
          );
          pilotYawRef.current = smoothAngleValue(
            pilotYawRef.current,
            lockedYaw,
            Math.max(8, pilotLookSmoothing * 1.4),
            frameDelta
          );
          pilotPitchRef.current = smoothValue(
            pilotPitchRef.current,
            THREE.MathUtils.clamp(lockedPitch, -PILOT_PITCH_LIMIT, PILOT_PITCH_LIMIT),
            Math.max(8, pilotLookSmoothing * 1.4),
            frameDelta
          );
          pilotYawTargetRef.current = pilotYawRef.current;
          pilotPitchTargetRef.current = pilotPitchRef.current;
        }
      }

      const keys = pilotKeysRef.current;
      const speedMultiplier =
        keys.has("shift") || keys.has("shiftleft") || keys.has("shiftright")
          ? 2.65
          : keys.has("alt") || keys.has("altleft") || keys.has("altright")
            ? 0.28
            : 1;
      const pilotSpeed = Math.max(0.1, cameraSettings.pilotSpeed ?? 16);
      const yaw = pilotYawRef.current;
      const pitch = pilotPitchRef.current;
      const cosPitch = Math.cos(pitch);
      const forward = pilotForwardRef.current
        .set(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch)
        .normalize();
      const right = pilotRightRef.current
        .set(-Math.cos(yaw), 0, Math.sin(yaw))
        .normalize();
      const rawInput = pilotRawInputRef.current.set(0, 0, 0);
      if (keys.has("w") || keys.has("arrowup")) rawInput.z += 1;
      if (keys.has("s") || keys.has("arrowdown")) rawInput.z -= 1;
      if (keys.has("d") || keys.has("arrowright")) rawInput.x += 1;
      if (keys.has("a") || keys.has("arrowleft")) rawInput.x -= 1;
      if (keys.has("e")) rawInput.y += 1;
      if (keys.has("q")) rawInput.y -= 1;
      const horizontalInputLength = Math.hypot(rawInput.x, rawInput.z);
      if (horizontalInputLength > 1) {
        rawInput.x /= horizontalInputLength;
        rawInput.z /= horizontalInputLength;
      }

      const pilotInputLagAmount = THREE.MathUtils.clamp(
        cameraSettings.pilotInputLag ?? 0.55,
        0,
        1
      );
      const pilotSwingAmount = THREE.MathUtils.clamp(
        cameraSettings.pilotSwingAmount ?? 0.55,
        0,
        1
      );
      const pilotInputLag = THREE.MathUtils.lerp(
        PILOT_INPUT_LAG_MIN,
        PILOT_INPUT_LAG_MAX,
        pilotInputLagAmount
      );
      const inputSmoothing = 1 - Math.exp(-pilotInputLag * frameDelta);
      const input = pilotInputRef.current.lerp(rawInput, inputSmoothing);
      const desiredVelocity = pilotDesiredVelocityRef.current.set(0, 0, 0);
      const horizontalSpeed = pilotSpeed * speedMultiplier;
      const elevationSpeed =
        Math.max(
          0.1,
          cameraSettings.pilotElevationSpeed ?? pilotSpeed
        ) * speedMultiplier;
      desiredVelocity
        .addScaledVector(forward, input.z * horizontalSpeed)
        .addScaledVector(right, input.x * horizontalSpeed)
        .addScaledVector(up, input.y * elevationSpeed);

      const pilotSmoothing = Math.max(1, cameraSettings.pilotSmoothing ?? 10);
      pilotVelocityRef.current.lerp(
        desiredVelocity,
        1 - Math.exp(-pilotSmoothing * frameDelta)
      );
      const pilotStep = pilotStepRef.current
        .copy(pilotVelocityRef.current)
        .multiplyScalar(frameDelta);
      pilotPositionRef.current
        .copy(camera.position)
        .add(pilotStep);
      if (hasPhonePositionTarget) {
        phonePilotPositionBaseRef.current.add(pilotStep);
        if (hasPhonePositionStep) {
          phonePilotPositionOffsetRef.current.lerp(
            phonePilotPositionTargetRef.current,
            1 - Math.exp(-phoneMoveSmoothing * frameDelta)
          );
        } else {
          phonePilotPositionOffsetRef.current.copy(
            phonePilotPositionTargetRef.current
          );
        }
        pilotPositionRef.current
          .copy(phonePilotPositionBaseRef.current)
          .add(phonePilotPositionOffsetRef.current);
      }

      const terrainStamps =
        activeScene.terrainSculptStamps?.[activeScene.terrainId] ?? [];
      const groundSafeY =
        (terrainStamps.length > 0
          ? sampleSculptedHeight(
              pilotPositionRef.current.x,
              pilotPositionRef.current.z,
              terrainStamps
            )
          : 0) + 0.42;
      pilotPositionRef.current.y = smoothFloor(
        pilotPositionRef.current.y,
        groundSafeY,
        0.42
      );
      if (!isFiniteVector3(pilotPositionRef.current)) {
        pilotPositionRef.current.copy(lastSafePilotPositionRef.current);
        pilotVelocityRef.current.set(0, 0, 0);
        phonePilotPositionBaseRef.current.copy(pilotPositionRef.current);
        phonePilotPositionOffsetRef.current.set(0, 0, 0);
        phonePilotPositionTargetRef.current.set(0, 0, 0);
      } else {
        const horizontalRadius = Math.hypot(
          pilotPositionRef.current.x,
          pilotPositionRef.current.z
        );
        if (horizontalRadius > PILOT_CAMERA_MAX_HORIZONTAL_RADIUS) {
          const clampScale = PILOT_CAMERA_MAX_HORIZONTAL_RADIUS / horizontalRadius;
          pilotPositionRef.current.x *= clampScale;
          pilotPositionRef.current.z *= clampScale;
          phonePilotPositionBaseRef.current.copy(pilotPositionRef.current);
          phonePilotPositionOffsetRef.current.set(0, 0, 0);
          phonePilotPositionTargetRef.current.set(0, 0, 0);
        }
        pilotPositionRef.current.y = THREE.MathUtils.clamp(
          pilotPositionRef.current.y,
          groundSafeY,
          PILOT_CAMERA_MAX_HEIGHT
        );
      }

      const fov = clampFov(cameraSettings.pilotFov ?? cameraSettings.fov ?? 45);
      const nextProjection = {
        near: 0.035,
        far: 620,
        fov,
      };
      if (projectionChanged(projectionRef.current, nextProjection)) {
        projectionRef.current = nextProjection;
        camera.near = nextProjection.near;
        camera.far = nextProjection.far;
        camera.fov = nextProjection.fov;
        camera.updateProjectionMatrix();
      }

      camera.position.copy(pilotPositionRef.current);
      const yawVelocity = wrapAngle(pilotYawRef.current - pilotPreviousYawRef.current) /
        Math.max(frameDelta, 0.0001);
      pilotPreviousYawRef.current = pilotYawRef.current;
      pilotLookSwingRef.current.lerp(
        pilotLookSwingTargetRef.current
          .copy(right)
          .multiplyScalar(input.x * PILOT_SWING_LOOK * pilotSwingAmount)
          .addScaledVector(up, input.y * PILOT_SWING_LOOK * 0.36 * pilotSwingAmount)
          .addScaledVector(
            forward,
            Math.max(0, input.z) * PILOT_SWING_LOOK * 0.24 * pilotSwingAmount
          ),
        1 - Math.exp(-PILOT_SWING_LAG * frameDelta)
      );
      pilotLookAtRef.current
        .copy(
          pilotLockTarget
            ? getEntityTargetPosition({
                activeScene,
                entityId: cameraSettings.pilotLockTargetEntityId ?? "hero",
                fallback: lastSafePilotLookAtRef.current,
                scene,
                target: targetRef.current,
              })
            : camera.position
        );
      if (!pilotLockTarget) {
        pilotLookAtRef.current
          .addScaledVector(forward, 12)
          .add(pilotLookSwingRef.current);
      }
      if (
        !isFiniteVector3(pilotLookAtRef.current) ||
        pilotLookAtRef.current.distanceToSquared(camera.position) < 0.0001
      ) {
        pilotLookAtRef.current.copy(lastSafePilotLookAtRef.current);
        pilotVelocityRef.current.set(0, 0, 0);
      }
      camera.lookAt(pilotLookAtRef.current);
      const inputRoll = -input.x * PILOT_SWING_ROLL * pilotSwingAmount;
      const turnRoll =
        THREE.MathUtils.clamp(-yawVelocity * 0.018, -0.055, 0.055) *
        pilotSwingAmount;
      pilotRollRef.current = THREE.MathUtils.damp(
        pilotRollRef.current,
        inputRoll + turnRoll,
        PILOT_SWING_LAG,
        frameDelta
      );
      camera.rotation.z +=
        (cameraSettings.pilotRoll ?? 0) +
        pilotRollRef.current +
        phonePilotRollOffsetRef.current;
      if (
        isFiniteVector3(camera.position) &&
        Number.isFinite(camera.rotation.x) &&
        Number.isFinite(camera.rotation.y) &&
        Number.isFinite(camera.rotation.z)
      ) {
        lastSafePilotPositionRef.current.copy(camera.position);
        lastSafePilotLookAtRef.current.copy(pilotLookAtRef.current);
      } else {
        camera.position.copy(lastSafePilotPositionRef.current);
        camera.lookAt(lastSafePilotLookAtRef.current);
        pilotPositionRef.current.copy(camera.position);
        pilotVelocityRef.current.set(0, 0, 0);
      }
      cameraDiagnosticClockRef.current += delta;
      if (
        typeof document !== "undefined" &&
        cameraDiagnosticClockRef.current > PILOT_DIAGNOSTIC_INTERVAL
      ) {
        cameraDiagnosticClockRef.current = 0;
        document.body.dataset.runtimeCameraDiagnostic = JSON.stringify({
          mode,
          phonePilot: Boolean(phoneFrame),
          position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
          rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z].map(
            (value) => Number(value.toFixed(4))
          ),
          target: pilotLookAtRef.current
            .toArray()
            .map((value) => Number(value.toFixed(3))),
          valid:
            isFiniteVector3(camera.position) &&
            Number.isFinite(camera.rotation.x) &&
            Number.isFinite(camera.rotation.y) &&
            Number.isFinite(camera.rotation.z),
          phoneAgeMs: phonePilotRuntimeState.ageMs,
          updatedAt: Date.now(),
        });
      }
      publishRuntimeCameraPose();
      pushRuntimePilotTakeSample({
        position: camera.position.toArray(),
        rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
        fov: camera.fov,
      });
      return;
    }

    if (FOLLOW_CAMERA_MODES.has(mode)) {
      const targetEntityId = cameraSettings.targetEntityId ?? "hero";
      const targetEntity = activeScene.entities[targetEntityId] ?? activeScene.entities.hero;
      const character =
        targetEntityId === "hero" ? scene.getObjectByName("HeroCharacter") : null;
      const targetPosition = cameraTargetRef.current;
      const characterHeight =
        targetEntity?.targetHeight ?? activeScene.entities.hero?.targetHeight ?? 6.8;
      const heroRuntimePosition =
        targetEntityId === "hero" && isPlayMode
          ? heroRuntimeTransformRef?.current?.position
          : null;

      if (isValidVector(heroRuntimePosition, 3)) {
        targetPosition.set(
          Number(heroRuntimePosition[0]),
          Number(heroRuntimePosition[1]),
          Number(heroRuntimePosition[2])
        );
      } else if (character) {
        character.getWorldPosition(targetPosition);
      } else {
        const entityPosition = targetEntity?.position ?? [0, 0, 0];
        targetPosition.set(entityPosition[0], entityPosition[1], entityPosition[2]);
      }
      const followSignature = `${targetEntityId}:${mode}:${activeScene.terrainId}`;
      const locomotionState =
        targetEntityId === "hero"
          ? heroRuntimeTransformRef?.current?.locomotionState
          : null;
      const stableLocomotion =
        isPlayMode && LOCOMOTION_CAMERA_STABLE_STATES.has(locomotionState);
      const rawTargetY = targetPosition.y;
      if (
        followTargetSignatureRef.current !== followSignature ||
        followTargetYRef.current == null ||
        Math.abs(rawTargetY - followTargetYRef.current) >
          FOLLOW_CAMERA_VERTICAL_SNAP_DISTANCE
      ) {
        followTargetSignatureRef.current = followSignature;
        followTargetYRef.current = rawTargetY;
      } else {
        const yDelta = rawTargetY - followTargetYRef.current;
        const shouldIgnoreSmallStepMotion =
          stableLocomotion && Math.abs(yDelta) < FOLLOW_CAMERA_VERTICAL_DEADBAND;
        if (!shouldIgnoreSmallStepMotion) {
          followTargetYRef.current = smoothValue(
            followTargetYRef.current,
            rawTargetY,
            stableLocomotion
              ? FOLLOW_CAMERA_VERTICAL_WALK_LAMBDA
              : FOLLOW_CAMERA_VERTICAL_IDLE_LAMBDA,
            delta
          );
        }
      }
      targetPosition.y = followTargetYRef.current;
      const headY = targetPosition.y + characterHeight * 0.86;

      const smoothingStrength = Math.max(1, cameraSettings.followSmoothing ?? 8);
      const scalarSmoothing = Math.max(5, smoothingStrength * 1.6);
      const smoothSettings = smoothSettingsRef.current;
      const configuredDistance = cameraSettings.followDistance ?? 18;
      const zoom = wheelZoomRef.current;
      if (zoom.baseDistance !== configuredDistance) {
        zoom.baseDistance = configuredDistance;
        zoom.targetDistance = configuredDistance;
      }
      smoothSettings.distance = smoothValue(
        smoothSettings.distance,
        WHEEL_ZOOM_MODES.has(mode) ? zoom.targetDistance : configuredDistance,
        scalarSmoothing,
        delta
      );
      smoothSettings.height = smoothValue(
        smoothSettings.height,
        cameraSettings.followHeight ?? 8,
        scalarSmoothing,
        delta
      );
      smoothSettings.eyeHeight = smoothValue(
        smoothSettings.eyeHeight,
        cameraSettings.eyeHeight ?? 5.6,
        scalarSmoothing,
        delta
      );
      smoothSettings.lookHeight = smoothValue(
        smoothSettings.lookHeight,
        cameraSettings.lookHeight ?? 3.4,
        scalarSmoothing,
        delta
      );
      smoothSettings.fov = smoothValue(
        smoothSettings.fov,
        cameraSettings.fov ?? 45,
        scalarSmoothing,
        delta
      );
      smoothSettings.targetLead = smoothValue(
        smoothSettings.targetLead,
        cameraSettings.targetLead ?? 0.8,
        scalarSmoothing,
        delta
      );
      smoothSettings.lateralOffset = smoothValue(
        smoothSettings.lateralOffset,
        cameraSettings.shotLateralOffset ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.pitchBias = smoothValue(
        smoothSettings.pitchBias,
        cameraSettings.shotPitchOffset ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.motionAmplitude = smoothValue(
        smoothSettings.motionAmplitude,
        cameraSettings.motionAmplitude ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.motionSpeed = smoothValue(
        smoothSettings.motionSpeed,
        cameraSettings.motionSpeed ?? 0.4,
        scalarSmoothing,
        delta
      );
      smoothSettings.motionPhase = smoothValue(
        smoothSettings.motionPhase,
        cameraSettings.motionPhase ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.fovSwing = smoothValue(
        smoothSettings.fovSwing,
        cameraSettings.fovSwing ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.cameraRoll = smoothValue(
        smoothSettings.cameraRoll,
        cameraSettings.cameraRoll ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.compositionX = smoothValue(
        smoothSettings.compositionX,
        cameraSettings.compositionX ?? 0,
        scalarSmoothing,
        delta
      );
      smoothSettings.compositionY = smoothValue(
        smoothSettings.compositionY,
        cameraSettings.compositionY ?? 0,
        scalarSmoothing,
        delta
      );
      const motionType = cameraSettings.motionType ?? "none";
      const suppressLocomotionSway =
        stableLocomotion &&
        (mode === "first-person" ||
          mode === "third-person" ||
          mode === "isometric");
      const effectiveMotionType =
        suppressLocomotionSway && LOCOMOTION_SUPPRESSED_SWAY_MOTIONS.has(motionType)
          ? "none"
          : motionType;
      const effectiveLateralOffset = suppressLocomotionSway
        ? 0
        : smoothSettings.lateralOffset;
      const effectiveCompositionX = suppressLocomotionSway
        ? 0
        : smoothSettings.compositionX;
      const isVertigoMotion = motionType === "vertigo";
      const distance = smoothSettings.distance;
      const height = isVertigoMotion
        ? Math.max(smoothSettings.height, VERTIGO_FACE_FOCUS_HEIGHT)
        : smoothSettings.height;
      const eyeHeight = smoothSettings.eyeHeight;
      const lookHeight = isVertigoMotion
        ? Math.max(smoothSettings.lookHeight, VERTIGO_FACE_FOCUS_HEIGHT)
        : smoothSettings.lookHeight;
      let dynamicFov = smoothSettings.fov;
      const pendingPointerDelta = pendingPointerDeltaRef.current;
      const hasPendingPointerDelta =
        pendingPointerDelta.button !== null &&
        (pendingPointerDelta.x !== 0 || pendingPointerDelta.y !== 0);
      if (hasPendingPointerDelta) {
        const deltaX = pendingPointerDelta.x;
        const deltaY = pendingPointerDelta.y;
        const button = pendingPointerDelta.button;
        pendingPointerDelta.x = 0;
        pendingPointerDelta.y = 0;

        if (button === 0) {
          orbitOffsetRef.current.targetYaw = wrapAngle(
            orbitOffsetRef.current.targetYaw - deltaX * CAMERA_POINTER_SENSITIVITY
          );
          orbitOffsetRef.current.targetPitch -= deltaY * CAMERA_POINTER_SENSITIVITY;
        } else if (button === 2) {
          viewYawTargetRef.current = wrapAngle(
            viewYawTargetRef.current - deltaX * CAMERA_POINTER_SENSITIVITY
          );
          viewPitchTargetRef.current -= deltaY * CAMERA_POINTER_SENSITIVITY;
        }
      }
      if (pointerDragRef.current.active || hasPendingPointerDelta) {
        manualMotionHoldRef.current = CAMERA_MANUAL_MOTION_HOLD;
      } else {
        manualMotionHoldRef.current = Math.max(
          0,
          manualMotionHoldRef.current - delta
        );
      }
      const manualCameraOverrideActive = manualMotionHoldRef.current > 0;
      const orbitOffset = orbitOffsetRef.current;
      orbitOffset.yaw = smoothAngleValue(
        orbitOffset.yaw,
        orbitOffset.targetYaw,
        smoothingStrength * 2.2,
        delta
      );
      orbitOffset.pitch = smoothValue(
        orbitOffset.pitch,
        orbitOffset.targetPitch,
        smoothingStrength * 2.2,
        delta
      );
      viewYawRef.current = smoothAngleValue(
        viewYawRef.current,
        viewYawTargetRef.current,
        smoothingStrength * 3.1,
        delta
      );
      viewPitchRef.current = smoothValue(
        viewPitchRef.current,
        viewPitchTargetRef.current,
        smoothingStrength * 3.1,
        delta
      );
      if (
        pointerDragRef.current.button === 2 ||
        Math.abs(angleDistance(viewYawRef.current, viewYawTargetRef.current)) > 0.0005
      ) {
        setRuntimeCameraYaw(viewYawRef.current, { alignHero: true });
      }
      const shotYawOffset = cameraSettings.shotYawOffset ?? 0;
      const viewYaw = wrapAngle(
        viewYawRef.current + orbitOffset.yaw + shotYawOffset
      );
      const targetViewPitch =
        viewPitchRef.current + orbitOffset.pitch + smoothSettings.pitchBias;
      smoothViewPitchRef.current = smoothValue(
        smoothViewPitchRef.current,
        targetViewPitch,
        smoothingStrength * 3.4,
        delta
      );
      const viewPitch = smoothViewPitchRef.current;
      const pitchOrbit = getPitchOrbit(viewPitch, mode);
      const forward = forwardRef.current.set(
        Math.sin(viewYaw),
        viewPitch,
        Math.cos(viewYaw)
      ).normalize();
      const flatForwardX = Math.sin(viewYaw);
      const flatForwardZ = Math.cos(viewYaw);
      const right = rightRef.current
        .set(Math.cos(viewYaw), 0, -Math.sin(viewYaw))
        .normalize();
      const leadDistance = mode === "first-person" ? 0 : smoothSettings.targetLead;
      const leadTargetX = targetPosition.x + flatForwardX * leadDistance;
      const leadTargetZ = targetPosition.z + flatForwardZ * leadDistance;
      const desiredPosition = desiredPositionRef.current;
      const desiredLookAt = desiredLookAtRef.current;

      if (mode === "first-person") {
        const headAnchor = headAnchorRef.current.set(
          targetPosition.x,
          cameraSettings.eyeHeight ? targetPosition.y + eyeHeight : headY,
          targetPosition.z
        );
        const headForwardOffset = cameraSettings.firstPersonForwardOffset ?? 1.05;
        desiredPosition.set(
          headAnchor.x + flatForwardX * headForwardOffset,
          headAnchor.y,
          headAnchor.z + flatForwardZ * headForwardOffset
        );
        desiredLookAt.copy(desiredPosition).addScaledVector(forward, 8);
      } else if (mode === "isometric") {
        const isoYaw = wrapAngle(viewYaw + Math.PI * 0.25);
        const isoForwardX = Math.sin(isoYaw);
        const isoForwardZ = Math.cos(isoYaw);
        const isoRight = right.set(Math.cos(isoYaw), 0, -Math.sin(isoYaw)).normalize();
        const isoHorizontalDistance = distance * 0.82 * pitchOrbit.horizontalScale;
        desiredPosition.set(
          leadTargetX - isoForwardX * isoHorizontalDistance,
          targetPosition.y +
            Math.max(height, distance * 0.72) +
            pitchOrbit.verticalScale * distance * 0.92,
          leadTargetZ - isoForwardZ * isoHorizontalDistance
        );
        desiredPosition.addScaledVector(isoRight, effectiveLateralOffset);
        desiredLookAt.set(
          leadTargetX,
          targetPosition.y + lookHeight,
          leadTargetZ
        );
      } else {
        const horizontalDistance = distance * pitchOrbit.horizontalScale;
        desiredPosition.set(
          leadTargetX - flatForwardX * horizontalDistance,
          targetPosition.y + height + pitchOrbit.verticalScale * distance * 0.96,
          leadTargetZ - flatForwardZ * horizontalDistance
        );
        desiredPosition.addScaledVector(right, effectiveLateralOffset);
        desiredLookAt.set(
          leadTargetX,
          targetPosition.y + lookHeight,
          leadTargetZ
        );
      }

      const motionLoop = cameraSettings.motionLoop ?? true;
      if (
        effectiveMotionType !== "none" &&
        Math.abs(smoothSettings.motionAmplitude) > 0.001 &&
        !manualCameraOverrideActive
      ) {
        const cycle = Math.PI * 2;
        motionClockRef.current = motionLoop
          ? motionClockRef.current + delta * smoothSettings.motionSpeed * cycle
          : Math.min(
              cycle,
              motionClockRef.current + delta * smoothSettings.motionSpeed * cycle
            );
        const oneShotProgress = easeInOut(motionClockRef.current / cycle);
        const time =
          (motionLoop ? motionClockRef.current : oneShotProgress * cycle) +
          smoothSettings.motionPhase * cycle;
        const loopPhase =
          ((motionClockRef.current / cycle + smoothSettings.motionPhase) % 1 + 1) %
          1;
        const loopProgress = easeInOut(
          loopPhase < 0.5 ? loopPhase * 2 : (1 - loopPhase) * 2
        );
        const amplitude = smoothSettings.motionAmplitude;
        const pulse = motionLoop ? easedPulse(time) : oneShotProgress;
        const signedPulse = motionLoop ? Math.sin(time) : oneShotProgress;
        const directedProgress =
          effectiveMotionType === "vertigo" && motionLoop ? loopProgress : signedPulse;
        const orbitAngle = motionLoop ? time : oneShotProgress * Math.PI;

        if (effectiveMotionType === "orbit") {
          desiredPosition
            .addScaledVector(right, Math.sin(orbitAngle) * amplitude)
            .addScaledVector(forward, (Math.cos(orbitAngle) - 1) * amplitude * 0.42);
        } else if (effectiveMotionType === "dolly") {
          desiredPosition.addScaledVector(forward, signedPulse * amplitude);
        } else if (effectiveMotionType === "vertigo") {
          const horizontalForward = horizontalMotionRef.current
            .set(flatForwardX, 0, flatForwardZ)
            .normalize();
          const baseDistance = Math.max(
            2.5,
            desiredPosition.distanceTo(desiredLookAt)
          );
          const baseFovRadians = THREE.MathUtils.degToRad(
            clampFov(smoothSettings.fov ?? cameraSettings.fov ?? 48)
          );
          const lockedFrameHeight = baseDistance * Math.tan(baseFovRadians * 0.5);
          const dollyOffset = directedProgress * amplitude;
          desiredPosition.addScaledVector(horizontalForward, dollyOffset);
          const effectiveDistance = Math.max(
            2.5,
            desiredPosition.distanceTo(desiredLookAt)
          );
          dynamicFov = clampFov(
            THREE.MathUtils.radToDeg(
              2 * Math.atan(lockedFrameHeight / effectiveDistance)
            )
          );
        } else if (effectiveMotionType === "push") {
          desiredPosition.addScaledVector(forward, pulse * amplitude);
          dynamicFov = clampFov(smoothSettings.fov + pulse * smoothSettings.fovSwing);
        } else if (effectiveMotionType === "pull") {
          desiredPosition.addScaledVector(forward, -pulse * amplitude);
          dynamicFov = clampFov(smoothSettings.fov + pulse * smoothSettings.fovSwing);
        } else if (effectiveMotionType === "truck") {
          desiredPosition.addScaledVector(right, signedPulse * amplitude);
          desiredLookAt.addScaledVector(right, signedPulse * amplitude * 0.22);
        } else if (effectiveMotionType === "arc") {
          desiredPosition
            .addScaledVector(right, Math.sin(orbitAngle) * amplitude)
            .addScaledVector(forward, (Math.cos(orbitAngle) - 1) * amplitude * 0.32);
          desiredLookAt.addScaledVector(right, signedPulse * amplitude * 0.12);
        } else if (effectiveMotionType === "crane" || effectiveMotionType === "boom") {
          const lift =
            effectiveMotionType === "boom" ? pulse * amplitude : signedPulse * amplitude;
          desiredPosition.y += lift;
          desiredLookAt.y += Math.sin(time + Math.PI * 0.25) * amplitude * 0.16;
        } else if (effectiveMotionType === "pan") {
          desiredLookAt.addScaledVector(right, signedPulse * amplitude * 3.5);
          dynamicFov = clampFov(smoothSettings.fov + signedPulse * smoothSettings.fovSwing);
        } else if (effectiveMotionType === "dutch") {
          dynamicFov = clampFov(smoothSettings.fov + signedPulse * smoothSettings.fovSwing * 0.35);
        } else if (effectiveMotionType === "pulse") {
          desiredPosition.addScaledVector(forward, signedPulse * amplitude);
          dynamicFov = clampFov(smoothSettings.fov + signedPulse * smoothSettings.fovSwing);
        } else if (effectiveMotionType === "handheld") {
          const jitterX = Math.sin(time * 2.17) * amplitude;
          const jitterY = Math.sin(time * 3.61 + 0.8) * amplitude * 0.34;
          const jitterZ = Math.sin(time * 1.47 + 1.6) * amplitude * 0.22;
          desiredPosition.addScaledVector(right, jitterX);
          desiredPosition.y += jitterY;
          desiredPosition.addScaledVector(forward, jitterZ);
          desiredLookAt.addScaledVector(right, jitterX * 0.18);
          desiredLookAt.y += jitterY * 0.22;
        }
      } else if (effectiveMotionType === "none") {
        motionClockRef.current = 0;
      }

      if (Math.abs(smoothSettings.fovSwing) > 0.001 && effectiveMotionType === "none") {
        dynamicFov = clampFov(smoothSettings.fov + smoothSettings.fovSwing);
      }

      if (Math.abs(effectiveCompositionX) > 0.001) {
        desiredLookAt.addScaledVector(right, effectiveCompositionX);
      }
      if (Math.abs(smoothSettings.compositionY) > 0.001) {
        desiredLookAt.y += smoothSettings.compositionY;
      }

      if (mode !== "first-person") {
        occluderClockRef.current += delta;
        if (occluderClockRef.current > CAMERA_OCCLUSION_REFRESH_INTERVAL) {
          occluderClockRef.current = 0;
          occludersRef.current = [];
          scene.traverse((object) => {
            if (object.visible && object.userData?.cameraOccluder) {
              occludersRef.current.push(object);
            }
          });
        }

        const rayOrigin = desiredLookAt;
        const cameraVector = occlusionDirectionRef.current.subVectors(
          desiredPosition,
          rayOrigin
        );
        const cameraDistance = cameraVector.length();
        if (
          cameraDistance > CAMERA_OCCLUSION_MIN_DISTANCE &&
          occludersRef.current.length > 0
        ) {
          cameraVector.normalize();
          raycasterRef.current.set(rayOrigin, cameraVector);
          raycasterRef.current.far = cameraDistance;
          const targetClearance = Math.min(
            cameraDistance * CAMERA_OCCLUSION_TARGET_CLEARANCE_RATIO,
            Math.max(
              CAMERA_OCCLUSION_TARGET_CLEARANCE_MIN,
              characterHeight * 0.42
            )
          );
          const hit = raycasterRef.current
            .intersectObjects(occludersRef.current, false)
            .find((intersection) => intersection.distance > targetClearance);

          if (hit && hit.distance < cameraDistance - CAMERA_OCCLUSION_PADDING) {
            const safeDistance = Math.max(
              CAMERA_OCCLUSION_MIN_DISTANCE,
              hit.distance - CAMERA_OCCLUSION_PADDING
            );
            desiredPosition.copy(
              occlusionSafePositionRef.current
                .copy(rayOrigin)
                .addScaledVector(cameraVector, safeDistance)
            );
            document.body.dataset.cameraOcclusion = "active";
          } else {
            document.body.dataset.cameraOcclusion = "clear";
          }
        }
      }

      const terrainStamps =
        activeScene.terrainSculptStamps?.[activeScene.terrainId] ?? [];
      const groundSafeY =
        (terrainStamps.length > 0
          ? sampleSculptedHeight(desiredPosition.x, desiredPosition.z, terrainStamps)
          : 0) +
        CAMERA_GROUND_CLEARANCE;
      desiredPosition.y = smoothFloor(
        desiredPosition.y,
        groundSafeY,
        CAMERA_GROUND_SOFTNESS
      );

      const smoothing = 1 - Math.exp(-smoothingStrength * delta);
      camera.position.lerp(desiredPosition, smoothing);
      let resolvedLookAt = desiredLookAt;
      if (mode === "third-person") {
        const lookAtSignature = `${targetEntityId}:${mode}:${activeScene.terrainId}`;
        const smoothedLookAt = smoothedThirdPersonLookAtRef.current;
        const shouldSnapLookAt =
          thirdPersonLookAtSignatureRef.current !== lookAtSignature ||
          !isFiniteVector3(smoothedLookAt) ||
          smoothedLookAt.distanceToSquared(desiredLookAt) > 144;
        if (shouldSnapLookAt) {
          smoothedLookAt.copy(desiredLookAt);
          thirdPersonLookAtSignatureRef.current = lookAtSignature;
        } else {
          const lookAtSmoothing =
            1 - Math.exp(-Math.max(10, smoothingStrength * 1.8) * delta);
          smoothedLookAt.lerp(desiredLookAt, lookAtSmoothing);
        }
        resolvedLookAt = smoothedLookAt;
      } else {
        thirdPersonLookAtSignatureRef.current = "";
      }
      const nextProjection = {
        near: mode === "first-person" ? 0.015 : 0.05,
        far: mode === "isometric" ? 520 : 360,
        fov: dynamicFov,
      };
      if (projectionChanged(projectionRef.current, nextProjection)) {
        projectionRef.current = nextProjection;
        camera.near = nextProjection.near;
        camera.far = nextProjection.far;
        camera.fov = nextProjection.fov;
        camera.updateProjectionMatrix();
      }

      camera.lookAt(resolvedLookAt);
      if (
        Math.abs(smoothSettings.cameraRoll) > 0.001 ||
        effectiveMotionType === "dutch"
      ) {
        const cycle = Math.PI * 2;
        const oneShotProgress = easeInOut(motionClockRef.current / cycle);
        const rollPulse =
          effectiveMotionType === "dutch" && !manualCameraOverrideActive
            ? ((cameraSettings.motionLoop ?? true)
                ? Math.sin(
                    motionClockRef.current + smoothSettings.motionPhase * cycle
                  )
                : oneShotProgress) * smoothSettings.motionAmplitude
            : 0;
        camera.rotation.z += smoothSettings.cameraRoll + rollPulse;
      }
      publishRuntimeCameraPose();
      return;
    }

    if (cameraSettings.manual) {
      publishRuntimeCameraPose();
      return;
    }
    if (hasFramedCharacterRef.current || frameAttemptsRef.current > 28) {
      publishRuntimeCameraPose();
      return;
    }

    frameClockRef.current += delta;
    if (frameClockRef.current < 0.16) {
      publishRuntimeCameraPose();
      return;
    }
    frameClockRef.current = 0;
    frameAttemptsRef.current += 1;

    const character = scene.getObjectByName("HeroCharacter");
    if (!character || !controlsRef.current) {
      publishRuntimeCameraPose();
      return;
    }

    const bounds = boundsRef.current.setFromObject(character);
    const size = bounds.getSize(sizeRef.current);
    if (!Number.isFinite(size.y) || size.y <= 0.01) {
      publishRuntimeCameraPose();
      return;
    }

    const center = bounds.getCenter(centerRef.current);
    const maxSize = Math.max(size.x, size.y, size.z);
    const target = targetRef.current.set(
      center.x,
      bounds.min.y + size.y * 0.48,
      center.z
    );

    camera.position.set(
      center.x,
      target.y + maxSize * 1.8,
      center.z + maxSize * 4.8
    );
    camera.near = 0.05;
    camera.far = Math.max(220, maxSize * 40);
    camera.updateProjectionMatrix();

    controlsRef.current.target.copy(target);
    controlsRef.current.minDistance = ORBIT_FIRST_PERSON_MIN_DISTANCE;
    controlsRef.current.maxDistance = Math.max(80, maxSize * 32);
    controlsRef.current.update();

    document.body.dataset.characterCameraFit = JSON.stringify({
      size: size.toArray(),
      target: target.toArray(),
      camera: camera.position.toArray(),
    });
    publishRuntimeCameraPose();
    hasFramedCharacterRef.current = true;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={
        cameraControlsEnabled &&
        !FOLLOW_CAMERA_MODES.has(cameraSettings.mode ?? "orbit") &&
        cameraSettings.mode !== "pilot" &&
        !cameraSettings.phonePilotEnabled
      }
      target={cameraSettings.target ?? [0, 7, 0]}
      minDistance={Math.min(
        cameraSettings.minDistance ?? ORBIT_FIRST_PERSON_MIN_DISTANCE,
        ORBIT_FIRST_PERSON_MIN_DISTANCE
      )}
      maxDistance={cameraSettings.maxDistance ?? 90}
      minPolarAngle={cameraSettings.minPolarAngle ?? 0}
      maxPolarAngle={cameraSettings.maxPolarAngle ?? Math.PI}
      onChange={() => publishRuntimeCameraPose({ commitCapture: false })}
    />
  );
};
