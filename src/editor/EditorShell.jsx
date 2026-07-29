/* eslint-disable react/prop-types */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEngine } from "../engine/core/useEngine";
import { getObjectClass } from "../engine/object/objectClassRegistry";
import { ASSET_CATEGORY_OPTIONS } from "../data/quaterniusAssets";
import {
  BASIC_PRIMITIVE_ASSET_KEYS,
  getEntityAssetUrl,
} from "../engine/layers/assets/assetRegistry";
import {
  DEFAULT_SCENE_LIGHTING,
  ENTITY_LIBRARY,
  TERRAIN_LIBRARY,
  getActiveScene,
} from "../engine/scene/createInitialScene";
import {
  createSceneDocumentOutline,
  flattenSceneDocumentOutline,
  getSceneDocumentInspectorTarget,
} from "../engine/scene/sceneDocument";
import { getEngineCapabilities } from "../engine/layers/commands/engineCapabilities";
import {
  OSM_SAMPLE_GEOJSON,
  OSM_SAMPLE_IMAGE_URL,
  OSM_SAMPLE_SOURCE,
} from "../engine/generation/osmSampleData";
import {
  BONE_RIG_JOINTS,
  CUSTOM_POSE_PREFIX,
} from "../engine/runtime/renderers/characters/characterRig";
import {
  STATIC_POSE_ACTIONS,
} from "../engine/runtime/renderers/characters/characterStaticPoses";
import {
  runtimeCameraState,
  setRuntimePhonePilotStartPose,
  startRuntimePilotTake,
  stopRuntimePilotTake,
} from "../engine/runtime/runtimeCameraState";
import {
  recenterRuntimePhonePilot,
  resetRuntimePhonePilotState,
} from "../engine/runtime/phonePilotRuntime";
import {
  clearRuntimeTimelinePlaybackFrame,
  getRuntimeCharacterTimelinePose,
  getRuntimeTimelineCaptureFrame,
  getRuntimeTimelinePlaybackFrame,
  setRuntimeTimelinePlaybackFrame,
  setRuntimeTimelineSkeletonCaptureEnabled,
} from "../engine/runtime/runtimeTimelineState";
import { canTimelineControlViewport } from "../engine/runtime/timelineViewportPriority";
import { usePhonePilotReceiver } from "../phone/usePhonePilotReceiver";
import {
  UI_LANGUAGE_STORAGE_KEY,
  UiLanguageProvider,
  localizeUiTree,
  translateUiText,
  useUiLanguage,
} from "./uiLanguage";

const AssetPreview = lazy(() => import("../components/AssetPreview"));
const CameraHeroPreview = lazy(() => import("../components/CameraHeroPreview"));
const CORE_RIG_JOINT_IDS = new Set(["head", "neck", "chest", "spine", "hips"]);
const RIG_JOINT_LABELS_ZH = {
  head: "头部",
  neck: "颈部",
  chest: "胸椎",
  spine: "腰椎",
  hips: "骨盆",
  leftUpperArm: "左上臂",
  leftForeArm: "左肘",
  leftHand: "左手",
  rightUpperArm: "右上臂",
  rightForeArm: "右肘",
  rightHand: "右手",
  leftUpLeg: "左大腿",
  leftLeg: "左膝",
  leftFoot: "左脚",
  rightUpLeg: "右大腿",
  rightLeg: "右膝",
  rightFoot: "右脚",
};

const TERRAIN_OPTIONS = Object.entries(TERRAIN_LIBRARY).map(([id, terrain]) => ({
  id,
  label: terrain.label,
  dockLabel: terrain.label,
  colors:
    id === "blank"
      ? ["#b8b8b8", "#606060"]
    : id === "snow"
      ? ["#f8fafc", "#b9c7d8"]
      : id === "sand"
        ? ["#d8b46f", "#8b6a34"]
      : id === "grass"
        ? ["#6fa24d", "#203f28"]
      : id === "water"
        ? ["#73d0e8", "#164c78"]
      : ["#b8b8b8", "#606060"],
}));

const PARAMETER_CONTROLS = {
  relief: { label: "Relief", min: 0, max: 1, step: 0.01 },
  roughness: { label: "Roughness", min: 0, max: 1, step: 0.01 },
  density: { label: "Density", min: 0, max: 1, step: 0.01 },
};

const LIGHTING_CONTROLS = [
  {
    key: "height",
    label: "Light Height",
    min: 4,
    max: 60,
    step: 1,
    formatValue: (value) => formatNumber(value, 0),
  },
  {
    key: "intensity",
    label: "Brightness",
    min: 0.2,
    max: 3,
    step: 0.05,
    formatValue: (value) => formatNumber(value, 2),
  },
  {
    key: "angle",
    label: "Light Angle",
    min: 0,
    max: 360,
    step: 1,
    formatValue: (value) => `${formatNumber(value, 0)}°`,
  },
];

const PROJECT_RECOVERY_STORAGE_KEY = "awplanet.project-recovery";

const isEditableKeyboardTarget = (target) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  target?.isContentEditable;

const cloneClipboardEntity = (entity) => {
  if (typeof structuredClone === "function") {
    return structuredClone(entity);
  }
  return JSON.parse(JSON.stringify(entity));
};

const readProjectRecovery = () => {
  if (typeof window === "undefined") return null;
  try {
    const payload = JSON.parse(
      window.localStorage.getItem(PROJECT_RECOVERY_STORAGE_KEY) ?? "null"
    );
    return payload?.engineState?.scene?.scenes ? payload : null;
  } catch {
    return null;
  }
};

const CHARACTER_ACTION_GROUPS = [
  {
    id: "motion",
    label: "Motion",
    actions: [
      { id: "walkForward", label: "Walk", detail: "Standard walking loop" },
      { id: "runForward", label: "Run", detail: "Running loop" },
    ],
  },
  {
    id: "static-poses",
    label: "Static Poses",
    actions: STATIC_POSE_ACTIONS,
  },
];

const SCULPTABLE_TERRAINS = new Set(["blank", "snow", "sand", "grass"]);

const RECORDING_MIME_CANDIDATES = [
  "video/mp4;codecs=h264",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const getSupportedRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    RECORDING_MIME_CANDIDATES.find((type) =>
      MediaRecorder.isTypeSupported(type)
    ) ?? ""
  );
};

const getRecordingExtension = (mimeType) =>
  mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";

const getSceneCaptureCanvas = () =>
  document.querySelector(".engine-viewport canvas");

const THREE_RAD_TO_DEG = 180 / Math.PI;
const THREE_DEG_TO_RAD = Math.PI / 180;
const TIMELINE_SAMPLE_INTERVAL_MS = 1000 / 60;
const TIMELINE_STATUS_UPDATE_INTERVAL_MS = 120;
const TIMELINE_PLAYHEAD_UI_INTERVAL_MS = 80;
const TIMELINE_LENGTH_OPTIONS = [15, 20, 25, 30];

const radiansToDegrees = (value = 0) => Math.round(THREE_RAD_TO_DEG * value);
const degreesToRadians = (value = 0) => value * THREE_DEG_TO_RAD;

const SCULPT_TOOLS = [
  {
    id: "raise",
    label: "Raise",
    shortLabel: "Up",
    icon: "sculpt-raise",
    detail: "Build height upward from the terrain surface.",
  },
  {
    id: "lower",
    label: "Lower",
    shortLabel: "Low",
    icon: "sculpt-lower",
    detail: "Push terrain downward into depressions or cuts.",
  },
  {
    id: "smooth",
    label: "Smooth",
    shortLabel: "Soft",
    icon: "sculpt-smooth",
    detail: "Relax sharp changes and soften slope transitions.",
  },
  {
    id: "flatten",
    label: "Flatten",
    shortLabel: "Flat",
    icon: "sculpt-flatten",
    detail: "Pull the area toward a shared level height.",
  },
  {
    id: "noise",
    label: "Noise",
    shortLabel: "Noise",
    icon: "sculpt-noise",
    detail: "Add irregular natural surface variation.",
  },
  {
    id: "erode",
    label: "Erode",
    shortLabel: "Erode",
    icon: "sculpt-erode",
    detail: "Weather peaks and carve subtle runoff feel.",
  },
];

const OBJECT_TRANSFORM_MODES = [
  { id: "translate", label: "Move", shortLabel: "Move", icon: "move" },
  { id: "rotate", label: "Rotate", shortLabel: "Rotate", icon: "rotate" },
  { id: "scale", label: "Scale", shortLabel: "Scale", icon: "scale" },
];

const MAP_GENERATOR_ENABLED = false;

const PANEL_TABS = [
  { id: "project", label: "Project" },
  { id: "character", label: "Character" },
  { id: "objects", label: "Objects" },
  { id: "map", label: "Map" },
  { id: "camera", label: "Camera" },
  { id: "brush", label: "Brush", requiresSculptableTerrain: true },
];

const CAMERA_PRESETS = [
  {
    id: "perspective",
    label: "Perspective",
    detail: "Free 3D",
    camera: {
      mode: "orbit",
      position: [0, 18, 28],
      target: [0, 6.5, 0],
      minDistance: 0.85,
      maxDistance: 80,
    },
  },
  {
    id: "top",
    label: "Top",
    detail: "Plan View",
    camera: {
      mode: "orbit",
      position: [0, 62, 0.01],
      target: [0, 0, 0],
      minDistance: 0.85,
      maxDistance: 150,
      maxPolarAngle: Math.PI * 0.5,
    },
  },
  {
    id: "front",
    label: "Front",
    detail: "Elevation",
    camera: {
      mode: "orbit",
      position: [0, 8, 44],
      target: [0, 5.2, 0],
      minDistance: 0.85,
      maxDistance: 120,
      maxPolarAngle: Math.PI * 0.62,
    },
  },
  {
    id: "side",
    label: "Side",
    detail: "Orthographic Side",
    camera: {
      mode: "orbit",
      position: [44, 8, 0],
      target: [0, 5.2, 0],
      minDistance: 0.85,
      maxDistance: 120,
      maxPolarAngle: Math.PI * 0.62,
    },
  },
];

const CAMERA_MODES = [
  { id: "third-person", label: "Third", detail: "Character Follow" },
  { id: "first-person", label: "First", detail: "Eye View" },
  { id: "isometric", label: "Iso 45", detail: "Diagonal Follow" },
];

const CAMERA_SHOT_PRESETS = [
  {
    id: "hero-follow",
    label: "Hero Follow",
    detail: "Neutral Chase",
    camera: {
      mode: "third-person",
      followDistance: 18,
      followHeight: 8,
      lookHeight: 3.4,
      fov: 45,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 0.8,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "shoulder",
    label: "Shoulder",
    detail: "Over Shoulder",
    camera: {
      mode: "third-person",
      followDistance: 9,
      followHeight: 5.4,
      lookHeight: 4.2,
      fov: 52,
      shotYawOffset: -0.18,
      shotPitchOffset: 0,
      shotLateralOffset: 1.45,
      targetLead: 1.5,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "low-chase",
    label: "Low Chase",
    detail: "Fast Ground",
    camera: {
      mode: "third-person",
      followDistance: 13,
      followHeight: 2.8,
      lookHeight: 3.2,
      fov: 56,
      shotYawOffset: 0,
      shotPitchOffset: -0.06,
      shotLateralOffset: 0,
      targetLead: 1.7,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "high-chase",
    label: "High Chase",
    detail: "Readable World",
    camera: {
      mode: "third-person",
      followDistance: 28,
      followHeight: 17,
      lookHeight: 4.8,
      fov: 42,
      shotYawOffset: 0,
      shotPitchOffset: 0.18,
      shotLateralOffset: 0,
      targetLead: 0.6,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "eye-forward",
    label: "Eye Forward",
    detail: "Head Camera",
    camera: {
      mode: "first-person",
      eyeHeight: 5.75,
      firstPersonForwardOffset: 1.22,
      fov: 58,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      targetLead: 0,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "iso-tactical",
    label: "Tactical View",
    detail: "45 Degree",
    camera: {
      mode: "isometric",
      followDistance: 34,
      followHeight: 24,
      lookHeight: 2.8,
      fov: 38,
      shotYawOffset: 0,
      shotPitchOffset: 0.18,
      shotLateralOffset: 0,
      targetLead: 0.2,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "top-down",
    label: "Top Down",
    detail: "RPG Map",
    camera: {
      mode: "isometric",
      followDistance: 48,
      followHeight: 42,
      lookHeight: 1.8,
      fov: 34,
      shotYawOffset: 0,
      shotPitchOffset: 0.42,
      shotLateralOffset: 0,
      targetLead: 0,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "side-follow",
    label: "Side Follow",
    detail: "Profile",
    camera: {
      mode: "third-person",
      followDistance: 22,
      followHeight: 7,
      lookHeight: 3.4,
      fov: 46,
      shotYawOffset: Math.PI * 0.5,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 1.4,
      motionType: "none",
      motionAmplitude: 0,
      motionSpeed: 0.4,
    },
  },
  {
    id: "orbit-reveal",
    label: "Orbit Reveal",
    detail: "Circular Move",
    camera: {
      mode: "third-person",
      followDistance: 21,
      followHeight: 9,
      lookHeight: 3.8,
      fov: 45,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 0.5,
      motionType: "orbit",
      motionAmplitude: 3.2,
      motionSpeed: 0.24,
    },
  },
  {
    id: "dolly-push",
    label: "Dolly Push",
    detail: "Slow Push",
    camera: {
      mode: "third-person",
      followDistance: 20,
      followHeight: 8,
      lookHeight: 3.6,
      fov: 43,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 0.8,
      motionType: "dolly",
      motionAmplitude: 6,
      motionSpeed: 0.38,
    },
  },
  {
    id: "crane-drift",
    label: "Crane Drift",
    detail: "Vertical Arc",
    camera: {
      mode: "third-person",
      followDistance: 24,
      followHeight: 12,
      lookHeight: 3.8,
      fov: 42,
      shotYawOffset: 0,
      shotPitchOffset: 0.04,
      shotLateralOffset: 0,
      targetLead: 0.4,
      motionType: "crane",
      motionAmplitude: 6.5,
      motionSpeed: 0.28,
    },
  },
  {
    id: "handheld",
    label: "Handheld",
    detail: "Human Motion",
    camera: {
      mode: "third-person",
      followDistance: 14,
      followHeight: 5.8,
      lookHeight: 3.7,
      fov: 50,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0.4,
      targetLead: 1.1,
      motionType: "handheld",
      motionAmplitude: 0.48,
      motionSpeed: 1.7,
    },
  },
  {
    id: "vertigo-pull",
    label: "Vertigo Pull",
    detail: "Hitchcock",
    camera: {
      mode: "third-person",
      followDistance: 18,
      followHeight: 5.65,
      lookHeight: 5.65,
      fov: 48,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 0,
      viewPitch: 0,
      motionType: "vertigo",
      motionLoop: false,
      motionAmplitude: -12,
      motionSpeed: 0.22,
      fovSwing: 0,
    },
  },
  {
    id: "vertigo-push",
    label: "Vertigo Push",
    detail: "Reverse",
    camera: {
      mode: "third-person",
      followDistance: 24,
      followHeight: 5.65,
      lookHeight: 5.65,
      fov: 38,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 0,
      viewPitch: 0,
      motionType: "vertigo",
      motionLoop: false,
      motionAmplitude: 12,
      motionSpeed: 0.22,
      fovSwing: 0,
    },
  },
  {
    id: "dutch-tension",
    label: "Dutch Tilt",
    detail: "Unease",
    camera: {
      mode: "third-person",
      followDistance: 15,
      followHeight: 5.2,
      lookHeight: 3.8,
      fov: 54,
      shotYawOffset: 0,
      shotPitchOffset: -0.02,
      shotLateralOffset: 0.7,
      targetLead: 1.1,
      motionType: "dutch",
      motionAmplitude: 0.42,
      motionSpeed: 0.62,
      cameraRoll: -0.32,
    },
  },
  {
    id: "push-in",
    label: "Push In",
    detail: "Emphasis",
    camera: {
      mode: "third-person",
      followDistance: 22,
      followHeight: 7.8,
      lookHeight: 4,
      fov: 42,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 0.65,
      motionType: "push",
      motionAmplitude: 10.5,
      motionSpeed: 0.2,
      fovSwing: -12,
    },
  },
  {
    id: "pull-out",
    label: "Pull Out",
    detail: "Reveal Scale",
    camera: {
      mode: "third-person",
      followDistance: 12,
      followHeight: 6,
      lookHeight: 3.7,
      fov: 50,
      shotYawOffset: 0,
      shotPitchOffset: 0.02,
      shotLateralOffset: 0,
      targetLead: 0.4,
      motionType: "pull",
      motionAmplitude: 12,
      motionSpeed: 0.16,
      fovSwing: 12,
    },
  },
  {
    id: "truck-left",
    label: "Truck Left",
    detail: "Side Travel",
    camera: {
      mode: "third-person",
      followDistance: 18,
      followHeight: 7,
      lookHeight: 3.5,
      fov: 45,
      shotYawOffset: 0.18,
      shotPitchOffset: 0,
      shotLateralOffset: -2,
      targetLead: 0.8,
      motionType: "truck",
      motionAmplitude: 8,
      motionSpeed: 0.28,
      compositionX: 0.4,
    },
  },
  {
    id: "parallax-arc",
    label: "Parallax Arc",
    detail: "Foreground Sweep",
    camera: {
      mode: "third-person",
      followDistance: 20,
      followHeight: 8.2,
      lookHeight: 3.8,
      fov: 44,
      shotYawOffset: -0.16,
      shotPitchOffset: 0,
      shotLateralOffset: 1.3,
      targetLead: 0.6,
      motionType: "arc",
      motionAmplitude: 8,
      motionSpeed: 0.22,
      compositionX: -0.3,
    },
  },
  {
    id: "boom-up",
    label: "Boom Up",
    detail: "Rise Reveal",
    camera: {
      mode: "third-person",
      followDistance: 18,
      followHeight: 5.5,
      lookHeight: 3.2,
      fov: 45,
      shotYawOffset: 0,
      shotPitchOffset: 0.08,
      shotLateralOffset: 0,
      targetLead: 0.4,
      motionType: "boom",
      motionAmplitude: 12,
      motionSpeed: 0.16,
      compositionY: 0.45,
    },
  },
  {
    id: "whip-pan",
    label: "Whip Pan",
    detail: "Fast Reframe",
    camera: {
      mode: "third-person",
      followDistance: 16,
      followHeight: 6.2,
      lookHeight: 3.7,
      fov: 52,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0,
      targetLead: 1.2,
      motionType: "pan",
      motionAmplitude: 2.4,
      motionSpeed: 0.9,
      fovSwing: 4,
    },
  },
  {
    id: "surveillance",
    label: "Surveillance",
    detail: "Long Lens",
    camera: {
      mode: "third-person",
      followDistance: 44,
      followHeight: 18,
      lookHeight: 4.2,
      fov: 28,
      shotYawOffset: 0.12,
      shotPitchOffset: 0.06,
      shotLateralOffset: 2.6,
      targetLead: 0.2,
      motionType: "handheld",
      motionAmplitude: 0.2,
      motionSpeed: 1.1,
      compositionX: -0.55,
    },
  },
  {
    id: "snorri-lock",
    label: "Snorri Lock",
    detail: "Actor Locked",
    camera: {
      mode: "third-person",
      followDistance: 6,
      followHeight: 4.8,
      lookHeight: 4.4,
      fov: 62,
      shotYawOffset: Math.PI,
      shotPitchOffset: -0.04,
      shotLateralOffset: 0,
      targetLead: 0,
      motionType: "handheld",
      motionAmplitude: 0.28,
      motionSpeed: 1.8,
      compositionY: 0.2,
    },
  },
  {
    id: "lens-breathe",
    label: "Lens Breath",
    detail: "Focus Pulse",
    camera: {
      mode: "third-person",
      followDistance: 17,
      followHeight: 6.4,
      lookHeight: 3.8,
      fov: 47,
      shotYawOffset: 0,
      shotPitchOffset: 0,
      shotLateralOffset: 0.6,
      targetLead: 0.7,
      motionType: "pulse",
      motionAmplitude: 1.2,
      motionSpeed: 0.44,
      fovSwing: 10,
    },
  },
];

const CAMERA_FOLLOW_CONTROLS = [
  { key: "followDistance", label: "View Distance", min: 3, max: 60, step: 1 },
  { key: "followHeight", label: "View Height", min: 1, max: 34, step: 0.5 },
  { key: "firstPersonForwardOffset", label: "Head Forward", min: 0.25, max: 2.6, step: 0.05 },
  { key: "followSmoothing", label: "Follow Smooth", min: 1, max: 18, step: 0.5 },
  { key: "fov", label: "Lens FOV", min: 28, max: 76, step: 1 },
];

const CAMERA_MOTION_TYPES = [
  { id: "none", label: "Locked" },
  { id: "orbit", label: "Orbit" },
  { id: "dolly", label: "Dolly" },
  { id: "vertigo", label: "Vertigo" },
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "truck", label: "Truck" },
  { id: "arc", label: "Arc" },
  { id: "crane", label: "Crane" },
  { id: "boom", label: "Boom" },
  { id: "pan", label: "Pan" },
  { id: "dutch", label: "Dutch" },
  { id: "pulse", label: "Pulse" },
  { id: "handheld", label: "Handheld" },
];

const CAMERA_SHOT_NUMERIC_LIMITS = {
  followDistance: [3, 90],
  followHeight: [0.5, 52],
  eyeHeight: [1, 9],
  firstPersonForwardOffset: [0.15, 3.4],
  lookHeight: [0.4, 9],
  fov: [22, 82],
  shotYawOffset: [-Math.PI * 2, Math.PI * 2],
  shotPitchOffset: [-1.2, 1.2],
  shotLateralOffset: [-12, 12],
  targetLead: [0, 8],
  motionAmplitude: [-32, 32],
  motionSpeed: [0.02, 4],
  motionPhase: [0, 1],
  fovSwing: [-32, 32],
  cameraRoll: [-1.2, 1.2],
  compositionX: [-3, 3],
  compositionY: [-3, 3],
  viewPitch: [-1.2, 1.2],
};

const CAMERA_SHOT_MODE_IDS = new Set(CAMERA_MODES.map((mode) => mode.id));
const CAMERA_SHOT_MOTION_IDS = new Set(CAMERA_MOTION_TYPES.map((motion) => motion.id));

const getCameraMotionLabel = (motionType = "none") =>
  CAMERA_MOTION_TYPES.find((motion) => motion.id === motionType)?.label ?? "Locked";

const slugifyPresetId = (value, fallback = "imported-shot") => {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
};

const clampCameraNumber = (value, [min, max]) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
};

const normalizeCameraShotPreset = (preset, index = 0) => {
  if (!preset || typeof preset !== "object") return null;
  const rawCamera = preset.camera;
  if (!rawCamera || typeof rawCamera !== "object") return null;

  const camera = {
    mode: CAMERA_SHOT_MODE_IDS.has(rawCamera.mode)
      ? rawCamera.mode
      : "third-person",
    motionType: CAMERA_SHOT_MOTION_IDS.has(rawCamera.motionType)
      ? rawCamera.motionType
      : "none",
  };

  Object.entries(CAMERA_SHOT_NUMERIC_LIMITS).forEach(([key, limits]) => {
    const value = clampCameraNumber(rawCamera[key], limits);
    if (value !== undefined) {
      camera[key] = value;
    }
  });

  if (typeof rawCamera.motionLoop === "boolean") {
    camera.motionLoop = rawCamera.motionLoop;
  }

  return {
    id: slugifyPresetId(preset.id ?? preset.label, `imported-shot-${index + 1}`),
    label: String(preset.label ?? `Imported Shot ${index + 1}`).slice(0, 32),
    detail: String(preset.detail ?? "Imported").slice(0, 28),
    imported: true,
    camera,
  };
};

const createUniquePresetId = (id, existingIds) => {
  const baseId = slugifyPresetId(id);
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
};

const CAMERA_SHOT_TEMPLATE = `{
  "id": "slow-hero-orbit",
  "label": "Slow Hero Orbit",
  "detail": "Imported JSON",
  "camera": {
    "mode": "third-person",
    "followDistance": 20,
    "followHeight": 8,
    "lookHeight": 3.8,
    "fov": 45,
    "shotYawOffset": 0,
    "shotPitchOffset": 0,
    "shotLateralOffset": 0,
    "targetLead": 0.8,
    "motionType": "orbit",
    "motionAmplitude": 4,
    "motionSpeed": 0.22,
    "motionLoop": true
  }
}
`;

const CAMERA_MOTION_CONTROLS = [
  { key: "targetLead", label: "Target Lead", min: 0, max: 5, step: 0.1 },
  { key: "shotLateralOffset", label: "Side Offset", min: -5, max: 5, step: 0.1 },
  { key: "shotPitchOffset", label: "Pitch Bias", min: -0.8, max: 0.8, step: 0.02 },
  { key: "motionAmplitude", label: "Move Amount", min: -16, max: 16, step: 0.05 },
  { key: "motionSpeed", label: "Move Speed", min: 0.05, max: 3, step: 0.05 },
  { key: "motionPhase", label: "Phase", min: 0, max: 1, step: 0.01 },
];

const CAMERA_LENS_CONTROLS = [
  { key: "fovSwing", label: "FOV Swing", min: -24, max: 24, step: 0.5 },
  { key: "cameraRoll", label: "Roll", min: -0.75, max: 0.75, step: 0.01 },
  { key: "compositionX", label: "Frame X", min: -1.5, max: 1.5, step: 0.05 },
  { key: "compositionY", label: "Frame Y", min: -1.2, max: 1.2, step: 0.05 },
];

const PILOT_CONTROLS = [
  { key: "pilotSpeed", label: "Pilot Speed", min: 2, max: 42, step: 0.5 },
  {
    key: "pilotElevationSpeed",
    label: "Q/E Elevate Speed",
    min: 1,
    max: 32,
    step: 0.5,
  },
  { key: "pilotLookSpeed", label: "Look Speed", min: 0.2, max: 1.6, step: 0.01 },
  { key: "pilotLookSmoothing", label: "Look Ease", min: 2, max: 14, step: 0.1 },
  { key: "pilotSmoothing", label: "Pilot Smooth", min: 1, max: 22, step: 0.5 },
  { key: "pilotInputLag", label: "Input Lag", min: 0, max: 1, step: 0.01 },
  { key: "pilotSwingAmount", label: "Swing Amount", min: 0, max: 1, step: 0.01 },
  { key: "pilotFov", label: "Pilot FOV", min: 24, max: 82, step: 0.5 },
  { key: "pilotRoll", label: "Pilot Roll", min: -0.75, max: 0.75, step: 0.01 },
];

const MAP_PRESETS = [
  {
    id: "rpg-rooms",
    label: "Office Layout",
    detail: "Workplace",
  },
  {
    id: "maze",
    label: "Maze",
    detail: "Dungeon",
  },
  {
    id: "osm-import",
    label: "OSM City",
    detail: "Local Map",
  },
];

const DEFAULT_MAP_CONFIGS = {
  "rpg-rooms": {
    footprintWidth: 19,
    footprintDepth: 15,
    layoutMode: 0,
    officeCount: 14,
    meetingRooms: 3,
    serviceRooms: 2,
    corridorWidth: 1,
    roomVariance: 0.58,
    wallHeight: 2.1,
  },
  maze: {
    size: 31,
    extraOpenings: 10,
    corridorWidth: 2,
    largeRooms: 3,
    roomScale: 0.32,
    wallHeight: 2.1,
    wallColorMix: 0.5,
  },
  "osm-import": {
    worldScale: 1,
    roadWidthScale: 1,
    buildingHeightScale: 1,
    waterLevel: 0.06,
  },
};

const MAP_CONFIG_CONTROLS = {
  "rpg-rooms": [
    { key: "footprintWidth", label: "Plan Width", min: 13, max: 31, step: 1 },
    { key: "footprintDepth", label: "Plan Depth", min: 11, max: 27, step: 1 },
    {
      key: "layoutMode",
      label: "Layout Mode",
      min: 0,
      max: 2,
      step: 1,
      valueLabels: ["Auto", "Four-Side", "Long Hall"],
    },
    { key: "officeCount", label: "Office Count", min: 6, max: 32, step: 1 },
    { key: "meetingRooms", label: "Meeting Rooms", min: 0, max: 8, step: 1 },
    { key: "serviceRooms", label: "Service Rooms", min: 0, max: 8, step: 1 },
    { key: "corridorWidth", label: "Corridor Width", min: 1, max: 3, step: 1 },
    { key: "roomVariance", label: "Room Randomness", min: 0, max: 1, step: 0.01 },
    { key: "wallHeight", label: "Wall Height", min: 0.8, max: 4.6, step: 0.1 },
  ],
  maze: [
    { key: "size", label: "Dungeon Size", min: 7, max: 100, step: 1 },
    { key: "extraOpenings", label: "Loop Openings", min: 0, max: 640, step: 1 },
    { key: "corridorWidth", label: "Corridor Width", min: 1, max: 6, step: 1 },
    { key: "largeRooms", label: "Side Chambers", min: 0, max: 24, step: 1 },
    { key: "roomScale", label: "Chamber Scale", min: 0, max: 1, step: 0.01 },
    { key: "wallHeight", label: "Wall Height", min: 0.8, max: 20, step: 0.1 },
    { key: "wallColorMix", label: "Stone Variation", min: 0, max: 1, step: 0.01 },
  ],
  "osm-import": [
    { key: "worldScale", label: "World Scale", min: 0.45, max: 1.8, step: 0.01 },
    { key: "roadWidthScale", label: "Road Width", min: 0.55, max: 1.8, step: 0.01 },
    { key: "buildingHeightScale", label: "Building Height", min: 0.45, max: 2.2, step: 0.01 },
    { key: "waterLevel", label: "Water Level", min: -0.12, max: 0.32, step: 0.01 },
  ],
};

const GODOT_ICON_MAP = {
  object: "Add.svg",
  select: "ToolSelect.svg",
  map: "TileMap.svg",
  brush: "Paint.svg",
  camera: "Camera.svg",
  play: "Play.svg",
  stop: "Stop.svg",
  hide: "GuiVisibilityVisible.svg",
  "sculpt-raise": "ArrowUp.svg",
  "sculpt-lower": "ArrowDown.svg",
};

const DockIcon = ({ type }) => {
  const godotIcon = GODOT_ICON_MAP[type];
  if (godotIcon) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="dock-button__svg dock-button__godot-icon"
        draggable="false"
        src={`/godot-icons/${godotIcon}`}
      />
    );
  }

  const commonProps = {
    className: "dock-button__svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.35",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke",
    "aria-hidden": "true",
  };

  if (type === "prev") {
    return (
      <svg {...commonProps}>
        <path d="M15 5 8 12l7 7" />
      </svg>
    );
  }

  if (type === "next") {
    return (
      <svg {...commonProps}>
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  if (type === "undo") {
    return (
      <svg {...commonProps}>
        <path d="M8.4 7.1 5.3 10.2l3.1 3.1" />
        <path d="M5.8 10.2h6.4a5.4 5.4 0 1 1-3.7 9.3" />
      </svg>
    );
  }

  if (type === "redo") {
    return (
      <svg {...commonProps}>
        <path d="m15.6 7.1 3.1 3.1-3.1 3.1" />
        <path d="M18.2 10.2h-6.4a5.4 5.4 0 1 0 3.7 9.3" />
      </svg>
    );
  }

  if (type === "object") {
    return (
      <svg {...commonProps}>
        <path d="M12 5.4v13.2" />
        <path d="M5.4 12h13.2" />
        <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.2" opacity="0.34" />
      </svg>
    );
  }

  if (type === "select") {
    return (
      <svg {...commonProps}>
        <path d="M7 5.2 17.2 15l-5.1.6-2.2 4.2z" />
        <path d="m14 15.1 3.4 3.7" />
      </svg>
    );
  }

  if (type === "edit") {
    return (
      <svg {...commonProps}>
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
      </svg>
    );
  }

  if (type === "move") {
    return (
      <svg {...commonProps}>
        <path d="M12 4v16" />
        <path d="m8.8 7.2 3.2-3.2 3.2 3.2" />
        <path d="m8.8 16.8 3.2 3.2 3.2-3.2" />
        <path d="M4 12h16" />
        <path d="m7.2 8.8-3.2 3.2 3.2 3.2" />
        <path d="m16.8 8.8 3.2 3.2-3.2 3.2" />
      </svg>
    );
  }

  if (type === "rotate") {
    return (
      <svg {...commonProps}>
        <path d="M18.2 8.2A7.2 7.2 0 1 0 19 14" />
        <path d="M18.2 4.8v3.4h-3.4" />
      </svg>
    );
  }

  if (type === "scale") {
    return (
      <svg {...commonProps}>
        <path d="M6 18 18 6" />
        <path d="M11.5 6H18v6.5" />
        <path d="M12.5 18H6v-6.5" />
      </svg>
    );
  }

  if (type === "dice") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="5" width="14" height="14" rx="3.5" />
        <path d="M9 9h.01" />
        <path d="M15 9h.01" />
        <path d="M12 12h.01" />
        <path d="M9 15h.01" />
        <path d="M15 15h.01" />
      </svg>
    );
  }

  if (type === "map") {
    return (
      <svg {...commonProps}>
        <path d="M5 7.2 9.7 5l4.6 2.2L19 5v11.8L14.3 19l-4.6-2.2L5 19z" />
        <path d="M9.7 5v11.8" />
        <path d="M14.3 7.2V19" />
      </svg>
    );
  }

  if (type === "camera") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="7.4" width="10" height="8.8" rx="2" />
        <path d="m15 10.4 4-2.1v7.4l-4-2.1" />
      </svg>
    );
  }

  if (type === "pilot") {
    return (
      <svg {...commonProps}>
        <circle cx="6.2" cy="6.2" r="2.05" />
        <circle cx="17.8" cy="6.2" r="2.05" />
        <circle cx="6.2" cy="17.8" r="2.05" />
        <circle cx="17.8" cy="17.8" r="2.05" />
        <rect x="9.1" y="9.1" width="5.8" height="5.8" rx="1.55" />
        <path d="m8 8 2.1 2.1" />
        <path d="m16 8-2.1 2.1" />
        <path d="m8 16 2.1-2.1" />
        <path d="m16 16-2.1-2.1" />
      </svg>
    );
  }

  if (type === "phone") {
    return (
      <svg {...commonProps}>
        <rect x="7" y="3.6" width="10" height="16.8" rx="2.2" />
        <path d="M10.5 6.2h3" />
        <path d="M11.5 17.6h1" />
      </svg>
    );
  }

  if (type === "timeline") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 7h14.4" />
        <path d="M4.8 12h14.4" />
        <path d="M4.8 17h14.4" />
        <path d="M8 5.2v13.6" />
        <path d="M15.8 5.2v13.6" />
      </svg>
    );
  }

  if (type === "export") {
    return (
      <svg {...commonProps}>
        <path d="M12 15.8V4.5" />
        <path d="m7.8 8.7 4.2-4.2 4.2 4.2" />
        <path d="M5.2 13.3v5.2h13.6v-5.2" />
      </svg>
    );
  }

  if (type === "record") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="5.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="8.4" opacity="0.36" />
      </svg>
    );
  }

  if (type === "play") {
    return (
      <svg {...commonProps}>
        <path d="M8.2 5.6v12.8L18.5 12z" />
      </svg>
    );
  }

  if (type === "stop") {
    return (
      <svg {...commonProps}>
        <rect x="7" y="7" width="10" height="10" rx="2" />
      </svg>
    );
  }

  if (type === "eye-off") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 12s2.7-4.2 7.2-4.2 7.2 4.2 7.2 4.2-2.7 4.2-7.2 4.2S4.8 12 4.8 12z" />
        <circle cx="12" cy="12" r="2.35" />
        <path d="M5.2 19 18.8 5" />
      </svg>
    );
  }

  if (type === "brush") {
    return (
      <svg {...commonProps}>
        <path d="M6.2 17.2c3.6 1.4 7.9 1.4 11.6 0" />
        <path d="M9 14.2h6" />
        <path d="M10.2 11.6h3.6" />
        <path d="M12 5.2v6.2" />
      </svg>
    );
  }

  if (type === "hide") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 12s2.7-4.2 7.2-4.2 7.2 4.2 7.2 4.2-2.7 4.2-7.2 4.2S4.8 12 4.8 12z" />
        <path d="M9.7 9.7 14.3 14.3" />
        <path d="M14.3 9.7 9.7 14.3" />
      </svg>
    );
  }

  if (type === "sculpt-raise") {
    return (
      <svg {...commonProps}>
        <path d="M5 17.2c4-2.2 10-2.2 14 0" />
        <path d="M12 14.2V6.2" />
        <path d="m9.2 9 2.8-2.8L14.8 9" />
      </svg>
    );
  }

  if (type === "sculpt-lower") {
    return (
      <svg {...commonProps}>
        <path d="M5 7.8c4 2.2 10 2.2 14 0" />
        <path d="M12 6.2v8" />
        <path d="m9.2 11.4 2.8 2.8 2.8-2.8" />
      </svg>
    );
  }

  if (type === "sculpt-smooth") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 17.2c1.5-4.1 3.9-7.2 7.2-7.2s5.7 3.1 7.2 7.2" />
        <path d="M5 18.8h14" />
      </svg>
    );
  }

  if (type === "sculpt-flatten") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 12h14.4" />
        <path d="M5.8 16.8h12.4" />
      </svg>
    );
  }

  if (type === "sculpt-noise") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 17.2 7.2 12l2.2 3.2 2.6-7 2.5 6 2-2.8 2.7 5.8" />
        <path d="M5 18.8h14" />
      </svg>
    );
  }

  if (type === "sculpt-erode") {
    return (
      <svg {...commonProps}>
        <path d="M4.8 17.2c1.4-3.8 3.5-6.2 6.2-6.2h4.6c1.4 1.3 2.6 3.4 3.6 6.2" />
        <path d="M10.8 11h5.3" />
        <path d="M5 18.8h14" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
};

const formatNumber = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "—";

const formatVector = (value, digits = 2) =>
  Array.isArray(value) ? value.map((item) => formatNumber(item, digits)).join(", ") : "—";

const formatInspectorValue = (value, valueType) => {
  if (value == null) return "—";
  if (valueType === "vector3") return formatVector(value);
  if (valueType === "number") return formatNumber(value);
  if (valueType === "boolean") return value ? "On" : "Off";
  if (valueType === "object") {
    if (value.radius || value.height) {
      return `r ${formatNumber(value.radius)} / h ${formatNumber(value.height)}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
};

const toNumber = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const InfoRow = ({ label, value }) => {
  const language = useUiLanguage();
  return (
    <div className="engine-info-row">
      <span>{translateUiText(label, language)}</span>
      <strong>{translateUiText(value, language)}</strong>
    </div>
  );
};

const MapConfigSlider = ({ control, value, onChange }) => {
  const language = useUiLanguage();
  const formattedValue =
    control.valueLabels?.[Math.round(value)] ??
    control.formatValue?.(value) ??
    formatNumber(value, control.step >= 1 ? 0 : 2);
  return (
    <label className="terrain-slider">
      <span className="terrain-slider__top">
        <span>{translateUiText(control.label, language)}</span>
        <strong>
          {translateUiText(formattedValue, language)}
        </strong>
      </span>
      <input
        max={control.max}
        min={control.min}
        step={control.step}
        type="range"
        value={value}
        onChange={(event) => onChange(control.key, Number(event.target.value))}
      />
    </label>
  );
};

const SceneTreeNode = ({ node, selectedNodeId, onSelect }) => {
  const language = useUiLanguage();
  return (
    <>
      <button
        className={`engine-scene-tree__node ${
          selectedNodeId === node.id ? "is-active" : ""
        }`}
        style={{ "--node-indent": `${node.depth * 16}px` }}
        type="button"
        onClick={() => onSelect(node)}
      >
        <span>{translateUiText(node.type, language)}</span>
        <strong>{node.label}</strong>
        {node.detail && <em>{translateUiText(node.detail, language)}</em>}
      </button>
      {(node.children ?? []).map((child) => (
        <SceneTreeNode
          key={child.id}
          node={child}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
};

const InspectorPropertyEditor = ({ property, target, onEdit, readOnly = false }) => {
  const language = useUiLanguage();
  const value = target.values[property.key];

  if (readOnly || !property.editable) {
    return (
      <strong>
        {property.valueType === "color" && value && (
          <i className="engine-color-chip" style={{ "--chip-color": value }} />
        )}
        {translateUiText(formatInspectorValue(value, property.valueType), language)}
      </strong>
    );
  }

  if (property.valueType === "text") {
    return (
      <input
        aria-label={`${target.classType} ${property.key}`}
        className="engine-schema-input"
        defaultValue={value ?? ""}
        type="text"
        onBlur={(event) => {
          const nextValue = event.target.value.trim();
          if (nextValue && nextValue !== value) {
            onEdit(target, property, nextValue);
          }
        }}
      />
    );
  }

  if (property.valueType === "number") {
    return (
      <input
        aria-label={`${target.classType} ${property.key}`}
        className="engine-schema-input"
        max={property.max}
        min={property.min}
        step={property.step ?? 0.01}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) =>
          onEdit(target, property, toNumber(event.target.value, value))
        }
      />
    );
  }

  if (property.valueType === "boolean") {
    return (
      <label className="engine-schema-toggle">
        <input
          aria-label={`${target.classType} ${property.key}`}
          checked={Boolean(value)}
          type="checkbox"
          onChange={(event) => onEdit(target, property, event.target.checked)}
        />
        <span>{translateUiText(value ? "On" : "Off", language)}</span>
      </label>
    );
  }

  if (property.valueType === "vector3") {
    const vector = Array.isArray(value) ? value : [0, 0, 0];
    return (
      <div className="engine-vector-editor">
        {["x", "y", "z"].map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input
              aria-label={`${target.classType} ${property.key} ${axis}`}
              min={property.min}
              step={property.step ?? 0.05}
              type="number"
              value={Number.isFinite(vector[index]) ? vector[index] : 0}
              onChange={(event) => {
                const nextVector = [...vector];
                nextVector[index] = toNumber(event.target.value, vector[index]);
                onEdit(target, property, nextVector);
              }}
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <strong>
      {translateUiText(formatInspectorValue(value, property.valueType), language)}
    </strong>
  );
};

const SchemaInspector = ({ target, onEdit, readOnly = false }) => {
  const language = useUiLanguage();
  if (!target) {
    return (
      <div className="object-editor__empty">
        {translateUiText("Select a scene node", language)}
      </div>
    );
  }

  const objectClass = getObjectClass(target.classType);

  return (
    <div className="engine-schema-inspector">
      <div className="engine-schema-inspector__title">
        <span>{translateUiText(objectClass.type, language)}</span>
        <strong>{target.label}</strong>
      </div>
      {objectClass.groups.map((group) => (
        <div className="engine-inspector-card" key={group.id}>
          <div className="terrain-panel__subhead">
            <span>{translateUiText(group.label, language)}</span>
          </div>
          {group.properties.map((property) => (
            <div className="engine-info-row" key={property.key}>
              <span>{translateUiText(property.label, language)}</span>
              <InspectorPropertyEditor
                property={property}
                target={target}
                onEdit={onEdit}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const EditorShell = () => {
  const { engineState, previewPrompt, runCommand } = useEngine();
  const scene = getActiveScene(engineState.scene);
  const [startupOpen, setStartupOpen] = useState(true);
  const [recentProject, setRecentProject] = useState(readProjectRecovery);
  const [uiLanguage, setUiLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) === "zh"
      ? "zh"
      : "en";
  });
  const showCodexCommander = false;
  const selectedTerrain =
    TERRAIN_OPTIONS.find((option) => option.id === scene.terrainId) ??
    TERRAIN_OPTIONS[0];
  const selectedTerrainPreset =
    TERRAIN_LIBRARY[scene.terrainId] ?? TERRAIN_LIBRARY.blank;
  const selectedTerrainFloorColor =
    scene.terrainFloorColors?.[scene.terrainId] ??
    selectedTerrainPreset.floorColor ??
    selectedTerrainPreset.color;
  const terrainParameters = scene.terrainParameters[scene.terrainId] ?? {};
  const [projectPanelOpen, setProjectPanelOpen] = useState(true);
  const [terrainPanelOpen, setTerrainPanelOpen] = useState(false);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [assetCategory, setAssetCategory] = useState("all");
  const [mapPanelOpen, setMapPanelOpen] = useState(false);
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);
  const [brushPanelOpen, setBrushPanelOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [brushMode, setBrushMode] = useState("raise");
  const [brushSize, setBrushSize] = useState(12);
  const [brushStrength, setBrushStrength] = useState(0.92);
  const [mapPreset, setMapPreset] = useState("rpg-rooms");
  const [mapSeed, setMapSeed] = useState("prototype-seed");
  const [mapConfigs, setMapConfigs] = useState(DEFAULT_MAP_CONFIGS);
  const [osmImportText, setOsmImportText] = useState("");
  const [osmImportStatus, setOsmImportStatus] = useState("Paste GeoJSON or Overpass JSON.");
  const [prompt, setPrompt] = useState("生成草地，放一块大石头和灌木");
  const [apiConfig, setApiConfig] = useState({
    endpoint: "",
    model: "gpt-4.1",
    apiKey: "",
  });
  const [apiStatus, setApiStatus] = useState("Local command parser ready.");
  const [projectStatus, setProjectStatus] = useState("Project ready.");
  const [sceneJumpValue, setSceneJumpValue] = useState("1");
  const [selectedSceneNodeId, setSelectedSceneNodeId] = useState("project");
  const [previewCameraPresetId, setPreviewCameraPresetId] = useState(null);
  const [customCameraPresets, setCustomCameraPresets] = useState([]);
  const [customPoseName, setCustomPoseName] = useState("Custom Pose");
  const [boneRigCollapsed, setBoneRigCollapsed] = useState(false);
  const [poseLibraryCollapsed, setPoseLibraryCollapsed] = useState(false);
  const [cameraImportStatus, setCameraImportStatus] = useState(
    "Import a JSON file or ES module with one shot preset or an array."
  );
  const [phonePilotEntryOpen, setPhonePilotEntryOpen] = useState(false);
  const [phonePilotCopyStatus, setPhonePilotCopyStatus] = useState(
    "Open this URL on your phone. The phone view renders the synced scene."
  );
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineRecording, setTimelineRecording] = useState(false);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineExporting, setTimelineExporting] = useState(false);
  const [timelineExportQueued, setTimelineExportQueued] = useState(false);
  const [timelinePlayhead, setTimelinePlayhead] = useState(0);
  const [timelineLength, setTimelineLength] = useState(15);
  const [timelineRecordingProgress, setTimelineRecordingProgress] =
    useState(null);
  const [timelineStatus, setTimelineStatus] = useState("Timeline ready.");
  const [draggingTimelineClip, setDraggingTimelineClip] = useState(null);
  const [recordingState, setRecordingState] = useState("idle");
  const [recordingStatus, setRecordingStatus] = useState("Ready for 60fps capture.");
  const [recordingFormat, setRecordingFormat] = useState("mp4");
  const mediaRecorderRef = useRef(null);
  const projectFileInputRef = useRef(null);
  const objectClipboardRef = useRef(null);
  const latestSceneRef = useRef(scene);
  const latestModeRef = useRef(engineState.mode);
  const timelineRecordingRef = useRef(null);
  const timelineSampleTimerRef = useRef(null);
  const timelinePlaybackTimerRef = useRef(null);
  const timelinePlaybackLastTickRef = useRef(0);
  const timelinePlaybackTimeRef = useRef(0);
  const timelinePlaybackLastUiUpdateRef = useRef(0);
  const timelinePlaybackQueuedRef = useRef(false);
  const timelinePlaybackCompleteRef = useRef(null);
  const timelineExportStartingRef = useRef(false);
  const timelineExportFinalizePendingRef = useRef(false);
  const timelineStateRef = useRef({ clips: [], duration: 15 });
  const recordingChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingStartRef = useRef(0);
  const recordingFilePrefixRef = useRef("ai-native-capture");
  const recordingDownloadEnabledRef = useRef(true);
  const recordingMountedRef = useRef(true);
  const recordingPilotTakeEnabledRef = useRef(false);
  const recordingStopFallbackRef = useRef(null);
  const recordingFinalizedRef = useRef(true);
  const recordingStartPendingRef = useRef(false);
  const phoneRecordingCommandSeqRef = useRef(0);
  const phonePilotSettingsUpdateRef = useRef(0);
  const activeEditorTool = engineState.editor?.activeTool ?? "select";
  const transformMode = engineState.editor?.transformMode ?? "translate";
  const selectedAssetKey = engineState.editor?.selectedAssetKey ?? "boulder";
  const isPlayMode = engineState.mode === "play";
  const isPilotMode = engineState.mode === "pilot";
  const isRuntimeMode = isPlayMode || isPilotMode;

  const storeProjectRecovery = useCallback((state, sourceName = "") => {
    const payload = {
      type: "awplanet-project-recovery",
      version: 1,
      savedAt: new Date().toISOString(),
      sourceName,
      engineState: state,
    };
    try {
      window.localStorage.setItem(
        PROJECT_RECOVERY_STORAGE_KEY,
        JSON.stringify(payload)
      );
      setRecentProject(payload);
    } catch {
      // A local recovery copy is optional; project file saving remains available.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, uiLanguage);
    document.documentElement.lang = uiLanguage === "zh" ? "zh-CN" : "en";
  }, [uiLanguage]);

  useEffect(() => {
    if (startupOpen) return undefined;
    const timeoutId = window.setTimeout(() => {
      storeProjectRecovery(engineState);
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [engineState, startupOpen, storeProjectRecovery]);

  useEffect(() => {
    if (!startupOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setStartupOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [startupOpen]);

  const getRuntimeCameraPoseCommands = () => {
    const pose = runtimeCameraState.pose;
    if (!pose?.updatedAt) return [];

    const commands = [];
    const addVector = (property, value) => {
      if (
        !Array.isArray(value) ||
        value.length < 3 ||
        !value.slice(0, 3).every((axis) => Number.isFinite(Number(axis)))
      ) {
        return;
      }
      commands.push({
        type: "set-camera-property",
        property,
        value: value.slice(0, 3).map(Number),
      });
    };

    addVector("position", pose.position);
    addVector("target", pose.target);
    addVector("rotation", pose.rotation);
    if (Number.isFinite(Number(pose.fov))) {
      commands.push({
        type: "set-camera-property",
        property: "fov",
        value: Number(pose.fov),
      });
    }

    return commands;
  };

  const getRuntimeHeroTransform = () => {
    const hero = scene.entities.hero;
    const runtimeHero = getRuntimeCharacterTimelinePose(hero?.id ?? "hero");
    if (!hero || !runtimeHero) return null;

    const updatedAt = Number(runtimeHero.updatedAt);
    if (
      Number.isFinite(updatedAt) &&
      performance.now() - updatedAt > 2000
    ) {
      return null;
    }

    const getVector = (value, length) =>
      Array.isArray(value) &&
      value.length >= length &&
      value.slice(0, length).every((entry) => Number.isFinite(Number(entry)))
        ? value.slice(0, length).map(Number)
        : null;
    const position = getVector(runtimeHero.position, 3);
    const rotation = getVector(runtimeHero.rotation, 3);
    if (!position || !rotation) return null;

    return {
      position,
      rotation,
    };
  };

  const createStopPlaySessionCommand = () => ({
    type: "stop-play-session",
    heroTransform: getRuntimeHeroTransform(),
  });

  const sceneEntries = useMemo(
    () => Object.values(engineState.scene.scenes ?? {}),
    [engineState.scene.scenes]
  );
  const activeSceneIndex = Math.max(
    0,
    sceneEntries.findIndex((entry) => entry.id === engineState.scene.activeSceneId)
  );
  const phonePilotStatus = usePhonePilotReceiver(
    Boolean(scene.camera?.phonePilotEnabled || phonePilotEntryOpen),
    engineState.scene
  );
  const phonePilotUrl =
    phonePilotStatus.urls[0] ??
    `${window.location.origin.replace("127.0.0.1", window.location.hostname)}/phone-pilot`;
  const playCameraMode = CAMERA_MODES.some(
    (mode) => mode.id === scene.camera?.mode
  )
    ? scene.camera.mode
    : "third-person";
  const entityAssets = useMemo(
    () =>
      Object.entries(ENTITY_LIBRARY).filter(
        ([assetKey, asset]) =>
          assetKey !== "marker" &&
          asset.category !== "basic" &&
          asset.terrains?.includes(scene.terrainId) &&
          (assetCategory === "all" ||
            (asset.category ?? "terrain") === assetCategory)
      ),
    [assetCategory, scene.terrainId]
  );
  const assetCategoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ASSET_CATEGORY_OPTIONS.map((option) => [option.id, 0])
    );

    Object.values(ENTITY_LIBRARY).forEach((asset) => {
      if (!asset.terrains?.includes(scene.terrainId)) return;
      if (asset.assetKey === "marker") return;
      if (asset.category === "basic") return;
      const category = asset.category ?? "terrain";
      counts.all += 1;
      counts[category] = (counts[category] ?? 0) + 1;
    });

    return counts;
  }, [scene.terrainId]);
  const selectedObject =
    scene.selectedEntityId && scene.entities[scene.selectedEntityId]
      ? scene.entities[scene.selectedEntityId]
      : null;
  const canTransformSelectedObject = Boolean(
    selectedObject &&
      selectedObject.id !== "hero" &&
      selectedObject.primitive !== "character" &&
      !selectedObject.generated
  );
  const objectSelectionEnabled =
    engineState.mode === "select" &&
    !phonePilotEntryOpen &&
    !scene.camera?.phonePilotEnabled;
  const editorInteractionEnabled =
    objectSelectionEnabled && !timelinePlaying;
  const characterEntities = useMemo(
    () =>
      scene.entityOrder
        .map((entityId) => scene.entities[entityId])
        .filter((entity) => entity?.primitive === "character"),
    [scene.entities, scene.entityOrder]
  );
  const timelineClips = useMemo(
    () => scene.timeline?.clips ?? [],
    [scene.timeline?.clips]
  );
  const timelineTracks = useMemo(
    () => [
      { id: "camera", label: "Camera", kind: "camera" },
      ...characterEntities.map((entity) => ({
        id: `character:${entity.id}`,
        label: entity.label ?? entity.id,
        kind: "character",
        entityId: entity.id,
      })),
    ],
    [characterEntities]
  );
  const timelineDuration = timelineLength;
  const getTimelinePercent = (time = 0) =>
    `${(Math.max(0, Math.min(timelineDuration, time)) / timelineDuration) * 100}%`;
  const getTimelineDurationPercent = (duration = 0) =>
    `${(Math.max(0, Math.min(timelineDuration, duration)) / timelineDuration) * 100}%`;
  const getTimelineDeltaTime = (deltaX, element) => {
    const timelineContent = element
      ?.closest?.(".engine-timeline__content")
      ?.getBoundingClientRect();
    return (deltaX / Math.max(1, timelineContent?.width ?? 1)) * timelineDuration;
  };
  const isBrushTerrain = SCULPTABLE_TERRAINS.has(scene.terrainId);
  const sceneDocumentOutline = useMemo(
    () => createSceneDocumentOutline(engineState.scene),
    [engineState.scene]
  );
  const cameraTargetOptions = useMemo(
    () =>
      scene.entityOrder
        .map((entityId) => scene.entities[entityId])
        .filter((entity) =>
          Boolean(entity) &&
          Array.isArray(entity.position) &&
          entity.position.length >= 3
        )
        .map((entity) => ({
          id: entity.id,
          label: entity.label ?? entity.id,
        })),
    [scene.entities, scene.entityOrder]
  );
  const selectedCameraTargetId =
    scene.selectedEntityId && scene.entities[scene.selectedEntityId]
      ? scene.selectedEntityId
      : null;
  const flatSceneNodes = useMemo(
    () => flattenSceneDocumentOutline(sceneDocumentOutline),
    [sceneDocumentOutline]
  );
  const activeSceneNodeId = flatSceneNodes.some(
    (node) => node.id === selectedSceneNodeId
  )
    ? selectedSceneNodeId
    : "project";
  const activeCharacter =
    characterEntities.find((entity) => entity.id === scene.selectedEntityId) ??
    characterEntities.find((entity) => entity.id === "hero") ??
    characterEntities[0];
  const characterActionGroups = useMemo(() => {
    const customActions = (activeCharacter?.customPoses ?? []).map((pose) => ({
      id: `${CUSTOM_POSE_PREFIX}${pose.id}`,
      label: pose.label,
      detail: "Saved custom bone pose",
    }));
    if (customActions.length === 0) return CHARACTER_ACTION_GROUPS;
    return [
      ...CHARACTER_ACTION_GROUPS,
      {
        id: "custom-poses",
        label: "Custom Poses",
        actions: customActions,
      },
    ];
  }, [activeCharacter?.customPoses]);
  const schemaInspectorTarget = getSceneDocumentInspectorTarget({
    nodeId: activeSceneNodeId,
    sceneState: engineState.scene,
    terrainLibrary: TERRAIN_LIBRARY,
  });
  const visibleBrushPanelOpen = brushPanelOpen && isBrushTerrain;
  const activePanel =
    [
      projectPanelOpen && "project",
      terrainPanelOpen && "character",
      assetPanelOpen && "objects",
      mapPanelOpen && "map",
      cameraPanelOpen && "camera",
      visibleBrushPanelOpen && "brush",
    ].find(Boolean) ?? "project";
  const undoCount = engineState.history?.past?.length ?? 0;
  const redoCount = engineState.history?.future?.length ?? 0;
  const activeSculptTool =
    SCULPT_TOOLS.find((tool) => tool.id === brushMode) ?? SCULPT_TOOLS[0];
  const cameraShotPresets = useMemo(
    () => [...CAMERA_SHOT_PRESETS, ...customCameraPresets],
    [customCameraPresets]
  );
  const selectedCameraPreset =
    cameraShotPresets.find((preset) => preset.id === scene.camera?.preset) ??
    cameraShotPresets[0];
  const previewCameraPreset =
    cameraShotPresets.find((preset) => preset.id === previewCameraPresetId) ??
    selectedCameraPreset;

  useEffect(() => {
    latestSceneRef.current = scene;
    latestModeRef.current = engineState.mode;
  }, [engineState.mode, scene]);

  useEffect(() => {
    if (objectSelectionEnabled) return;
    setSelectedSceneNodeId("project");
  }, [objectSelectionEnabled]);

  useEffect(() => {
    const handleEditorShortcut = (event) => {
      if (
        startupOpen ||
        isEditableKeyboardTarget(event.target) ||
        event.altKey
      ) {
        return;
      }

      const commandModifier = event.metaKey || event.ctrlKey;
      if (!commandModifier) return;
      const key = event.key.toLowerCase();

      if (key === "z") {
        if (!editorInteractionEnabled) return;
        event.preventDefault();
        event.stopPropagation();
        runCommand({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }

      if (event.shiftKey || !editorInteractionEnabled) return;
      if (key === "c") {
        if (!canTransformSelectedObject) return;
        event.preventDefault();
        event.stopPropagation();
        objectClipboardRef.current = {
          entity: cloneClipboardEntity(selectedObject),
          pasteCount: 0,
          sceneId: scene.id,
        };
        return;
      }

      if (key === "v" && objectClipboardRef.current?.entity) {
        event.preventDefault();
        event.stopPropagation();
        const clipboard = objectClipboardRef.current;
        clipboard.pasteCount += 1;
        const offsetStep = Math.min(clipboard.pasteCount, 6) * 1.25;
        runCommand({
          type: "duplicate-entity",
          entity: clipboard.entity,
          offset: [offsetStep, 0, offsetStep],
        });
      }
    };

    window.addEventListener("keydown", handleEditorShortcut, true);
    return () => {
      window.removeEventListener("keydown", handleEditorShortcut, true);
    };
  }, [
    canTransformSelectedObject,
    editorInteractionEnabled,
    runCommand,
    scene.id,
    selectedObject,
    startupOpen,
  ]);

  useEffect(() => {
    timelineStateRef.current = {
      clips: timelineClips,
      duration: timelineDuration,
    };
  }, [timelineClips, timelineDuration]);

  useEffect(() => {
    setSceneJumpValue(String(activeSceneIndex + 1));
  }, [activeSceneIndex]);

  const clearRecordingStopFallback = useCallback(() => {
    if (!recordingStopFallbackRef.current) return;
    window.clearTimeout(recordingStopFallbackRef.current);
    recordingStopFallbackRef.current = null;
  }, []);

  const releaseRecordingStream = useCallback(() => {
    clearRecordingStopFallback();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingStartPendingRef.current = false;
  }, [clearRecordingStopFallback]);

  const finishSceneRecording = useCallback(
    (mimeType, recorder = null) => {
      if (
        recorder &&
        mediaRecorderRef.current &&
        mediaRecorderRef.current !== recorder
      ) {
        return;
      }
      if (recordingFinalizedRef.current) return;
      recordingFinalizedRef.current = true;
      clearRecordingStopFallback();
      const chunks = recordingChunksRef.current;
      recordingChunksRef.current = [];
      const normalizedMimeType = mimeType || "video/webm";
      const extension = getRecordingExtension(normalizedMimeType);
      const durationSeconds = Math.max(
        0,
        Math.round((Date.now() - recordingStartRef.current) / 1000)
      );
      const pilotTake = recordingPilotTakeEnabledRef.current
        ? stopRuntimePilotTake()
        : null;
      recordingPilotTakeEnabledRef.current = false;

      releaseRecordingStream();

      const hasCameraKeys = Boolean(pilotTake?.samples?.length);
      const status =
        chunks.length > 0
          ? `Saved ${extension.toUpperCase()} · 60fps · ${durationSeconds}s${
              hasCameraKeys ? ` · ${pilotTake.samples.length} camera keys` : ""
            }`
          : "No frames were captured.";

      if (recordingMountedRef.current) {
        setRecordingState("idle");
        setRecordingFormat(extension);
        setRecordingStatus(status);
        if (timelineExportFinalizePendingRef.current) {
          setTimelineStatus(
            chunks.length > 0
              ? `Timeline video exported · ${extension.toUpperCase()} · ${durationSeconds}s.`
              : "Timeline export finished without captured frames."
          );
        }
      }
      timelineExportFinalizePendingRef.current = false;

      if (recordingDownloadEnabledRef.current && chunks.length > 0) {
        const blob = new Blob(chunks, { type: normalizedMimeType });
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .replace("T", "_")
          .replace("Z", "");
        anchor.href = downloadUrl;
        anchor.download = `${recordingFilePrefixRef.current}-${timestamp}.${extension}`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1200);

        if (hasCameraKeys) {
          const takeBlob = new Blob(
            [
              JSON.stringify(
                {
                  type: "ai-native-camera-take",
                  version: 1,
                  mode: "pilot",
                  duration: pilotTake.duration,
                  sampleRate: pilotTake.sampleRate,
                  samples: pilotTake.samples,
                },
                null,
                2
              ),
            ],
            { type: "application/json" }
          );
          const takeUrl = URL.createObjectURL(takeBlob);
          const takeAnchor = document.createElement("a");
          takeAnchor.href = takeUrl;
          takeAnchor.download = `ai-native-camera-take-${timestamp}.json`;
          takeAnchor.click();
          window.setTimeout(() => URL.revokeObjectURL(takeUrl), 1200);
        }
      }
      recordingFilePrefixRef.current = "ai-native-capture";
    },
    [clearRecordingStopFallback, releaseRecordingStream]
  );

  const stopSceneRecording = useCallback(
    ({ download = true } = {}) => {
      recordingDownloadEnabledRef.current = download;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        if (recordingMountedRef.current) {
          setRecordingState("saving");
          setRecordingStatus("Encoding capture...");
        }
        clearRecordingStopFallback();
        recordingStopFallbackRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current !== recorder) return;
          finishSceneRecording(recorder.mimeType || "video/webm", recorder);
        }, 1600);
        try {
          try {
            recorder.requestData?.();
          } catch {
            // Some browsers throw if the recorder is already draining; stopping can still finish.
          }
          recorder.stop();
        } catch (error) {
          finishSceneRecording(recorder.mimeType || "video/webm", recorder);
          if (recordingMountedRef.current) {
            setRecordingStatus(
              error instanceof Error
                ? `Saved with recorder stop fallback: ${error.message}`
                : "Saved with recorder stop fallback."
            );
          }
        }
        return;
      }

      releaseRecordingStream();
      if (recordingPilotTakeEnabledRef.current) {
        stopRuntimePilotTake();
        recordingPilotTakeEnabledRef.current = false;
      }
      if (recordingMountedRef.current) {
        recordingFinalizedRef.current = true;
        setRecordingState("idle");
      }
    },
    [clearRecordingStopFallback, finishSceneRecording, releaseRecordingStream]
  );

  const startSceneRecording = useCallback((filePrefix = "ai-native-capture") => {
    const currentRecorder = mediaRecorderRef.current;
    if (currentRecorder && currentRecorder.state !== "inactive") {
      stopSceneRecording();
      return;
    }
    if (recordingState !== "idle" || recordingStartPendingRef.current) return;

    if (typeof MediaRecorder === "undefined") {
      setRecordingStatus("This browser does not support MediaRecorder.");
      return;
    }

    const canvas = getSceneCaptureCanvas();
    if (!canvas || typeof canvas.captureStream !== "function") {
      setRecordingStatus("Scene canvas capture is unavailable.");
      return;
    }

    const mimeType = getSupportedRecorderMimeType();
    if (!mimeType) {
      setRecordingStatus("No supported video encoder was found.");
      return;
    }

    try {
      recordingStartPendingRef.current = true;
      recordingFilePrefixRef.current =
        typeof filePrefix === "string" && filePrefix.trim()
          ? filePrefix.trim()
          : "ai-native-capture";
      clearRecordingStopFallback();
      if (isPilotMode) {
        startRuntimePilotTake();
        recordingPilotTakeEnabledRef.current = true;
      } else {
        recordingPilotTakeEnabledRef.current = false;
      }
      const stream = canvas.captureStream(60);
      const pixelCount = Math.max(
        1,
        Number(canvas.width || canvas.clientWidth || 1) *
          Number(canvas.height || canvas.clientHeight || 1)
      );
      const videoBitsPerSecond = Math.round(
        Math.max(4_000_000, Math.min(10_000_000, pixelCount * 3.6))
      );
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond,
      });
      const extension = getRecordingExtension(mimeType);

      recordingFinalizedRef.current = false;
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingDownloadEnabledRef.current = true;
      recordingStartRef.current = Date.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        finishSceneRecording(recorder.mimeType || mimeType, recorder);
      });

      recorder.addEventListener("error", () => {
        if (recordingFinalizedRef.current) return;
        recordingFinalizedRef.current = true;
        clearRecordingStopFallback();
        recordingChunksRef.current = [];
        if (recordingPilotTakeEnabledRef.current) {
          stopRuntimePilotTake();
          recordingPilotTakeEnabledRef.current = false;
        }
        releaseRecordingStream();
        if (recordingMountedRef.current) {
          setRecordingState("idle");
          setRecordingStatus("Recording failed. Try again after reloading the scene.");
        }
      });

      recorder.start(500);
      recordingStartPendingRef.current = false;
      setRecordingFormat(extension);
      setRecordingState("recording");
      setRecordingStatus(
        isPilotMode
          ? `Recording ${extension.toUpperCase()} · 60fps · pilot camera take`
          : `Recording ${extension.toUpperCase()} · 60fps · camera and character motion`
      );
    } catch (error) {
      recordingStartPendingRef.current = false;
      if (recordingPilotTakeEnabledRef.current) {
        stopRuntimePilotTake();
        recordingPilotTakeEnabledRef.current = false;
      }
      releaseRecordingStream();
      recordingFinalizedRef.current = true;
      setRecordingState("idle");
      setRecordingStatus(
        error instanceof Error
          ? `Recording unavailable: ${error.message}`
          : "Recording unavailable."
      );
    }
  }, [
    finishSceneRecording,
    isPilotMode,
    recordingState,
    clearRecordingStopFallback,
    releaseRecordingStream,
    stopSceneRecording,
  ]);

  useEffect(
    () => () => {
      recordingMountedRef.current = false;
      stopSceneRecording({ download: false });
      if (timelineSampleTimerRef.current) {
        window.cancelAnimationFrame(timelineSampleTimerRef.current);
        timelineSampleTimerRef.current = null;
      }
      if (timelinePlaybackTimerRef.current) {
        window.cancelAnimationFrame(timelinePlaybackTimerRef.current);
        timelinePlaybackTimerRef.current = null;
      }
      setRuntimeTimelineSkeletonCaptureEnabled(false);
      clearRuntimeTimelinePlaybackFrame();
    },
    [stopSceneRecording]
  );

  useEffect(() => {
    if (!isRuntimeMode && mediaRecorderRef.current?.state === "recording") {
      stopSceneRecording();
    }
  }, [isRuntimeMode, stopSceneRecording]);

  useEffect(() => {
    const stopCaptureOnContextLoss = () => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      stopSceneRecording({ download: true });
      setRecordingStatus(
        "Capture stopped safely because the renderer restarted. The scene is recovering."
      );
    };

    window.addEventListener(
      "awplanet:runtime-context-lost",
      stopCaptureOnContextLoss
    );
    return () => {
      window.removeEventListener(
        "awplanet:runtime-context-lost",
        stopCaptureOnContextLoss
      );
    };
  }, [stopSceneRecording]);

  const postPhonePilotRecordingStatus = useCallback(
    ({ ackSeq = null, state = recordingState, status = recordingStatus } = {}) => {
      fetch("/__phone-pilot/recording-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(ackSeq != null ? { ackSeq } : {}),
          state,
          status,
        }),
      }).catch(() => {
        // Phone Pilot recording control is optional; local recording still works.
      });
    },
    [recordingState, recordingStatus]
  );

  useEffect(() => {
    postPhonePilotRecordingStatus();
  }, [postPhonePilotRecordingStatus]);

  useEffect(() => {
    if (recordingState !== "recording" && recordingState !== "saving") {
      return undefined;
    }
    const interval = window.setInterval(() => {
      postPhonePilotRecordingStatus();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [postPhonePilotRecordingStatus, recordingState]);

  useEffect(() => {
    let cancelled = false;
    let timeout = 0;

    const pollRecordingCommand = async () => {
      try {
        const response = await fetch("/__phone-pilot/recording", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Phone recording command unavailable.");
        const data = await response.json();
        const command = data.command;
        const commandId = Number(command?.id ?? data.commandSeq ?? 0);
        if (
          !cancelled &&
          command &&
          Number.isFinite(commandId) &&
          commandId > phoneRecordingCommandSeqRef.current
        ) {
          phoneRecordingCommandSeqRef.current = commandId;
          const action = command.action === "stop" || command.action === "start"
            ? command.action
            : "toggle";

          if (action === "start") {
            if (recordingState === "idle") {
              startSceneRecording();
            }
          } else if (action === "stop") {
            if (recordingState === "recording") {
              stopSceneRecording();
            }
          } else if (recordingState !== "saving") {
            startSceneRecording();
          }

          postPhonePilotRecordingStatus({
            ackSeq: commandId,
            state:
              action === "stop" && recordingState === "recording"
                ? "saving"
                : action === "start" && recordingState === "idle"
                  ? "recording"
                  : recordingState,
            status:
              action === "stop" && recordingState === "recording"
                ? "Stopping desktop capture..."
                : action === "start" && recordingState === "idle"
                  ? "Recording requested from phone."
                  : recordingStatus,
          });
        }
      } catch {
        // Keep the editor independent if the phone bridge is not active.
      }

      if (!cancelled) {
        timeout = window.setTimeout(pollRecordingCommand, 250);
      }
    };

    pollRecordingCommand();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    postPhonePilotRecordingStatus,
    recordingState,
    recordingStatus,
    startSceneRecording,
    stopSceneRecording,
  ]);

  useEffect(() => {
    if (!scene.selectedEntityId) return;
    const nextNodeId = `entity:${scene.selectedEntityId}`;
    setSelectedSceneNodeId((currentNodeId) =>
      currentNodeId === nextNodeId ? currentNodeId : nextNodeId
    );
  }, [scene.selectedEntityId]);

  const executeGeneratedCommands = (commands, label = "Codex command") => {
    if (commands.length === 0) return;

    runCommand({
      type: "run-command-batch",
      label,
      commands,
    });
  };

  const generateFromCommander = async () => {
    const endpoint = apiConfig.endpoint.trim();
    if (!endpoint) {
      const commands = previewPrompt(prompt);
      executeGeneratedCommands(commands, "Local command");
      setApiStatus(`Local parser generated ${commands.length} command${commands.length === 1 ? "" : "s"}.`);
      return;
    }

    setApiStatus("Calling API bridge...");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiConfig.apiKey.trim()
            ? { Authorization: `Bearer ${apiConfig.apiKey.trim()}` }
            : {}),
        },
        body: JSON.stringify({
          prompt,
          model: apiConfig.model.trim(),
          engineState,
          capabilities: getEngineCapabilities(),
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const payload = await response.json();
      const commands = Array.isArray(payload)
        ? payload
        : payload.commands ?? [];
      executeGeneratedCommands(commands, "API command");
      setApiStatus(`API generated ${commands.length} command${commands.length === 1 ? "" : "s"}.`);
    } catch (error) {
      const commands = previewPrompt(prompt);
      executeGeneratedCommands(commands, "Local fallback command");
      setApiStatus(`API unavailable. Used local parser instead. ${error.message}`);
    }
  };

  const selectSceneNode = (node) => {
    setSelectedSceneNodeId(node.id);
    if (node.id.startsWith("entity:")) {
      runCommand({
        type: "select-entity",
        entityId: node.id.replace("entity:", ""),
      });
    }
  };

  const editSchemaProperty = (target, property, value) => {
    if (target.classType === "Project") {
      runCommand({
        type: "set-project-property",
        property: property.key,
        value,
      });
      return;
    }

    if (target.classType === "Scene") {
      runCommand({
        type: "set-scene-property",
        property: property.key,
        value,
      });
      return;
    }

    if (
      target.classType === "Terrain3D" &&
      ["relief", "roughness", "density"].includes(property.key)
    ) {
      runCommand({
        type: "set-terrain-parameter",
        terrainId: scene.terrainId,
        parameter: property.key,
        value,
      });
      return;
    }

    if (target.classType === "Camera3D") {
      runCommand({
        type: "set-camera-property",
        property: property.key,
        value,
      });
      return;
    }

    if (
      ["CharacterBody3D", "MeshInstance3D", "Foliage3D", "LogicMarker"].includes(
        target.classType
      )
    ) {
      if (["position", "rotation", "scale"].includes(property.key)) {
        runCommand({
          type: "transform-entity",
          entityId: target.id,
          patch: { [property.key]: value },
        });
        return;
      }

      runCommand({
        type: "set-entity-property",
        entityId: target.id,
        property: property.key,
        value,
      });
    }
  };

  const generateMap = (preset) => {
    const nextPreset = preset ?? mapPreset;
    const nextSeed = mapSeed.trim() || `${nextPreset}-${Date.now()}`;
    if (nextPreset === "osm-import") {
      let data = OSM_SAMPLE_GEOJSON;
      if (osmImportText.trim()) {
        try {
          data = JSON.parse(osmImportText);
        } catch (error) {
          setOsmImportStatus(
            error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON."
          );
          return;
        }
      }
      runCommand({
        type: "generate-osm-map",
        data,
        label: osmImportText.trim() ? "Imported OSM Region" : OSM_SAMPLE_SOURCE.label,
        seed: nextSeed,
        config: mapConfigs["osm-import"],
      });
      setOsmImportStatus(
        osmImportText.trim()
          ? "Imported custom OSM data into the current scene."
          : `Generated ${OSM_SAMPLE_SOURCE.label} from matching OSM geometry.`
      );
      setSelectedSceneNodeId("scene:scene-main");
      return;
    }

    runCommand({
      type: "generate-map",
      preset: nextPreset,
      seed: nextSeed,
      config: mapConfigs[nextPreset],
    });
    setSelectedSceneNodeId("scene:scene-main");
  };

  const importOsmMap = () => {
    if (!osmImportText.trim()) {
      setOsmImportStatus("Paste or upload GeoJSON/Overpass JSON first.");
      return;
    }

    try {
      const data = JSON.parse(osmImportText);
      runCommand({
        type: "generate-osm-map",
        data,
        label: "Imported OSM Region",
        seed: `osm-${Date.now()}`,
        config: mapConfigs["osm-import"],
      });
      setOsmImportStatus("Imported OSM features into the current scene.");
      setSelectedSceneNodeId("scene:scene-main");
    } catch (error) {
      setOsmImportStatus(
        error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON."
      );
    }
  };

  const importOsmFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setOsmImportText(text);
    setOsmImportStatus(`${file.name} loaded. Ready to import.`);
  };

  const importCameraShotFile = async (file) => {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isJson = fileName.endsWith(".json");
    const isJs = fileName.endsWith(".js") || fileName.endsWith(".mjs");

    if (!isJson && !isJs) {
      setCameraImportStatus("Use a .json, .js, or .mjs camera preset file.");
      return;
    }

    let moduleUrl = "";
    try {
      const source = await file.text();
      let exported;

      if (isJson) {
        const parsed = JSON.parse(source);
        exported = parsed.default ?? parsed.presets ?? parsed.preset ?? parsed;
      } else {
        moduleUrl = URL.createObjectURL(
          new Blob([source], { type: "text/javascript" })
        );
        const module = await import(/* @vite-ignore */ moduleUrl);
        exported = module.default ?? module.presets ?? module.preset;
      }

      const importedPresets = (Array.isArray(exported) ? exported : [exported])
        .map((preset, index) => normalizeCameraShotPreset(preset, index))
        .filter(Boolean);

      if (importedPresets.length === 0) {
        setCameraImportStatus("No valid camera presets found in this file.");
        return;
      }

      const existingIds = new Set(cameraShotPresets.map((preset) => preset.id));
      const nextImportedPresets = importedPresets.map((preset) => {
        const id = createUniquePresetId(preset.id, existingIds);
        existingIds.add(id);
        return {
          ...preset,
          id,
        };
      });
      setCustomCameraPresets((currentPresets) => [
        ...currentPresets,
        ...nextImportedPresets,
      ]);
      setPreviewCameraPresetId(nextImportedPresets[0].id);
      setCameraImportStatus(
        `${file.name}: imported ${importedPresets.length} shot preset${
          importedPresets.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      setCameraImportStatus(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed. Check the file format."
      );
    } finally {
      if (moduleUrl) {
        URL.revokeObjectURL(moduleUrl);
      }
    }
  };

  const downloadCameraShotTemplate = () => {
    const blob = new Blob([CAMERA_SHOT_TEMPLATE], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "camera-shot-preset.template.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 900);
  };

  const updateMapConfig = (preset, key, value) => {
    setMapConfigs((configs) => ({
      ...configs,
      [preset]: {
        ...configs[preset],
        [key]: value,
      },
    }));
  };

  const applyCameraPreset = (preset) => {
    const lockedTargetId =
      scene.camera?.targetEntityId ?? selectedCameraTargetId ?? "hero";
    stopTimelinePlayback({ clearFrame: true });
    const cameraPoseCommands = getRuntimeCameraPoseCommands();
    runCommand({
      type: "run-command-batch",
      label: `Apply ${preset.label} camera preset`,
      commands: [
        ...cameraPoseCommands,
        {
          type: "set-camera-preset",
          preset: preset.id,
          camera: {
            ...preset.camera,
            targetEntityId: lockedTargetId,
          },
        },
      ],
    });
    setSelectedSceneNodeId("camera");
  };

  const updateCameraProperty = (property, value) => {
    stopTimelinePlayback({ clearFrame: true });
    runCommand({
      type: "set-camera-property",
      property,
      value,
    });
    setSelectedSceneNodeId("camera");
  };

  const updatePhonePilotMoveScale = useCallback(
    (value, { source = "desktop" } = {}) => {
      const nextValue = Number(value);
      if (!Number.isFinite(nextValue)) return;
      runCommand({
        type: "set-camera-property",
        property: "phonePilotMoveScale",
        value: nextValue,
      });
      if (source === "desktop") {
        fetch("/__phone-pilot/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phonePilotMoveScale: nextValue,
            source: "desktop",
          }),
        }).catch(() => {
          // Phone Pilot may be disconnected; local camera settings still update.
        });
      }
    },
    [runCommand]
  );

  useEffect(() => {
    const settings = phonePilotStatus.settings;
    const updatedAt = Number(settings?.updatedAt ?? 0);
    const phonePilotMoveScale = Number(settings?.phonePilotMoveScale);
    if (
      settings?.source !== "phone" ||
      !Number.isFinite(phonePilotMoveScale) ||
      updatedAt <= phonePilotSettingsUpdateRef.current ||
      Math.abs((scene.camera?.phonePilotMoveScale ?? 7.5) - phonePilotMoveScale) < 0.001
    ) {
      return;
    }
    phonePilotSettingsUpdateRef.current = updatedAt;
    updatePhonePilotMoveScale(phonePilotMoveScale, { source: "phone" });
  }, [
    phonePilotStatus.settings,
    scene.camera?.phonePilotMoveScale,
    updatePhonePilotMoveScale,
  ]);

  const copyPhonePilotUrl = async () => {
    try {
      await navigator.clipboard.writeText(phonePilotUrl);
      setPhonePilotCopyStatus("Phone Pilot URL copied.");
    } catch {
      setPhonePilotCopyStatus("Copy failed. Select the URL text manually.");
    }
  };

  const recenterPhonePilot = () => {
    recenterRuntimePhonePilot();
    setPhonePilotCopyStatus("Phone look direction recentered.");
  };

  const getDisablePhonePilotCommands = () => {
    const restorePose = scene.camera?.phonePilotStartPose;
    const commands = [];

    if (Array.isArray(restorePose?.position)) {
      commands.push({
        type: "set-camera-property",
        property: "position",
        value: restorePose.position,
      });
    }
    if (Array.isArray(restorePose?.target)) {
      commands.push({
        type: "set-camera-property",
        property: "target",
        value: restorePose.target,
      });
    }
    if (Number.isFinite(restorePose?.fov)) {
      commands.push({
        type: "set-camera-property",
        property: "fov",
        value: restorePose.fov,
      });
    }

    commands.push(
      {
        type: "set-camera-property",
        property: "phonePilotEnabled",
        value: false,
      },
      {
        type: "set-camera-property",
        property: "phonePilotStartPose",
        value: null,
      }
    );

    return commands;
  };

  const disablePhonePilotSession = () => {
    if (phonePilotEntryOpen) {
      setPhonePilotEntryOpen(false);
    }
    resetRuntimePhonePilotState();
    return getDisablePhonePilotCommands();
  };

  const getMainSceneCameraPose = () => ({
    position: [
      ...(scene.camera?.position ?? runtimeCameraState.pose.position ?? [0, 20, 30]),
    ],
    rotation: [
      ...(scene.camera?.rotation ?? runtimeCameraState.pose.rotation ?? [0, 0, 0]),
    ],
    target: [
      ...(scene.camera?.target ?? runtimeCameraState.pose.target ?? [0, 7, 0]),
    ],
    fov: scene.camera?.fov ?? runtimeCameraState.pose.fov ?? 45,
    aspect: runtimeCameraState.pose.aspect,
    viewport: runtimeCameraState.pose.viewport,
    updatedAt: performance.now(),
  });

  const togglePhonePilotEntry = () => {
    const timelineWasPreviewing = Boolean(getRuntimeTimelinePlaybackFrame());
    stopTimelinePlayback({ clearFrame: true });
    if (phonePilotEntryOpen || scene.camera?.phonePilotEnabled) {
      resetRuntimePhonePilotState();
      setPhonePilotEntryOpen(false);
      runCommand({
        type: "run-command-batch",
        label: "Disable phone pilot",
        commands: getDisablePhonePilotCommands(),
      });
      return;
    }

    const capturedPose = setRuntimePhonePilotStartPose(
      timelineWasPreviewing ? getMainSceneCameraPose() : runtimeCameraState.pose
    );
    setPhonePilotCopyStatus(
      `Viewport start captured · ${capturedPose.position
        .map((value) => value.toFixed(1))
        .join(", ")}`
    );
    setPhonePilotEntryOpen(true);
    const exitRuntimeCommands = [];
    if (isPlayMode) {
      exitRuntimeCommands.push(
        ...getRuntimeCameraPoseCommands(),
        createStopPlaySessionCommand()
      );
    } else if (isPilotMode) {
      exitRuntimeCommands.push(
        ...getRuntimeCameraPoseCommands(),
        { type: "stop-pilot-session" }
      );
    }
    runCommand({
      type: "run-command-batch",
      label: "Enable phone pilot",
      commands: [
        ...exitRuntimeCommands,
        {
          type: "select-entity",
          entityId: null,
        },
        {
          type: "set-editor-tool",
          tool: "select",
        },
        {
          type: "set-camera-property",
          property: "phonePilotStartPose",
          value: capturedPose,
        },
        {
          type: "set-camera-property",
          property: "phonePilotEnabled",
          value: true,
        },
      ],
    });
  };

  const codexMini = (
    <div className="engine-ai-mini">
      <div className="terrain-panel__subhead">
        <span>Codex Commander</span>
        <span className="engine-history-status">
          {apiConfig.endpoint.trim() ? "API Bridge" : "Local"}
        </span>
      </div>
      <div className="engine-api-config">
        <input
          value={apiConfig.endpoint}
          onChange={(event) =>
            setApiConfig((config) => ({
              ...config,
              endpoint: event.target.value,
            }))
          }
          placeholder="API endpoint, e.g. /api/codex-command"
        />
        <input
          value={apiConfig.model}
          onChange={(event) =>
            setApiConfig((config) => ({
              ...config,
              model: event.target.value,
            }))
          }
          placeholder="Model"
        />
        <input
          value={apiConfig.apiKey}
          onChange={(event) =>
            setApiConfig((config) => ({
              ...config,
              apiKey: event.target.value,
            }))
          }
          placeholder="API key"
          type="password"
        />
      </div>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="例如：生成草地，放一块大石头和灌木"
      />
      <div className="engine-command-actions">
        <button type="button" onClick={generateFromCommander}>
          Generate
        </button>
      </div>
      <div className="engine-api-status">{apiStatus}</div>
    </div>
  );

  const closePanels = () => {
    setProjectPanelOpen(true);
    setTerrainPanelOpen(false);
    setAssetPanelOpen(false);
    setMapPanelOpen(false);
    setCameraPanelOpen(false);
    setBrushPanelOpen(false);
    runCommand({ type: "set-editor-tool", tool: "select" });
  };

  const setOpenPanel = (panelId) => {
    stopTimelinePlayback({ clearFrame: true });
    const nextPanel = panelId === "brush" && !isBrushTerrain
      ? "project"
      : panelId ?? "project";
    const modeExitCommands = isRuntimeMode ? getRuntimeCameraPoseCommands() : [];
    if (isPlayMode) {
      modeExitCommands.push(createStopPlaySessionCommand());
    } else if (isPilotMode) {
      modeExitCommands.push({ type: "stop-pilot-session" });
    }
    setProjectPanelOpen(nextPanel === "project");
    setTerrainPanelOpen(nextPanel === "character");
    setAssetPanelOpen(nextPanel === "objects");
    setMapPanelOpen(nextPanel === "map");
    setCameraPanelOpen(nextPanel === "camera");
    setBrushPanelOpen(nextPanel === "brush");
    if (nextPanel !== "camera") {
      setPreviewCameraPresetId(null);
    }

    let toolCommand = { type: "set-editor-tool", tool: "select" };
    if (nextPanel === "objects") {
      toolCommand = {
        type: "set-editor-tool",
        tool: "object-placement",
        selectedAssetKey,
      };
    } else if (nextPanel === "brush") {
      toolCommand = {
        type: "set-editor-tool",
        tool: "brush",
        brushMode,
        brushSize,
        brushStrength,
      };
    }

    const commands = [
      ...modeExitCommands,
      toolCommand,
    ].filter(Boolean);
    if (commands.length === 1) {
      runCommand(toolCommand);
      return;
    }
    runCommand({
      type: "run-command-batch",
      label: `Open ${nextPanel} panel`,
      commands,
    });
  };

  const togglePanel = (panelId) => {
    setOpenPanel(activePanel === panelId ? "project" : panelId);
  };

  const sanitizeProjectFileName = (name) =>
    (name || "project 1")
      .trim()
      .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "project-1";

  const newProject = () => {
    stopSceneRecording({ download: false });
    stopTimelinePlayback({ clearFrame: true });
    runCommand({ type: "new-project" });
    setSelectedSceneNodeId("project");
    setOpenPanel("project");
    setProjectStatus("New blank project created.");
    setStartupOpen(false);
  };

  const saveProject = () => {
    const payload = {
      type: "awplanet-project",
      version: 1,
      savedAt: new Date().toISOString(),
      engineState,
    };
    storeProjectRecovery(engineState);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeProjectFileName(
      engineState.scene.project?.name
    )}.awplanet.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    setProjectStatus("Project saved as a local .awplanet.json file.");
  };

  const loadProjectFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const loadedState = payload.engineState ?? payload;
      if (!loadedState?.scene?.scenes || !loadedState?.scene?.activeSceneId) {
        throw new Error("This file does not contain a valid awplanet project.");
      }
      stopSceneRecording({ download: false });
      stopTimelinePlayback({ clearFrame: true });
      runCommand({ type: "load-project-state", state: loadedState });
      storeProjectRecovery(loadedState, file.name);
      setSelectedSceneNodeId("project");
      setOpenPanel("project");
      setProjectStatus(`Loaded ${file.name}.`);
      setStartupOpen(false);
    } catch (error) {
      setProjectStatus(
        error instanceof Error ? error.message : "Project file could not be loaded."
      );
    }
  };

  const resumeRecentProject = () => {
    const loadedState = recentProject?.engineState;
    if (!loadedState?.scene?.scenes || !loadedState?.scene?.activeSceneId) {
      setStartupOpen(false);
      return;
    }
    stopSceneRecording({ download: false });
    stopTimelinePlayback({ clearFrame: true });
    runCommand({ type: "load-project-state", state: loadedState });
    setSelectedSceneNodeId("project");
    setOpenPanel("project");
    setProjectStatus("Recovered the most recent local session.");
    setStartupOpen(false);
  };

  const setProjectName = (value) => {
    runCommand({
      type: "set-project-property",
      property: "name",
      value,
      transient: true,
    });
  };

  const setSceneName = (value) => {
    runCommand({
      type: "set-scene-property",
      property: "name",
      value,
      transient: true,
    });
  };

  const addScene = () => {
    stopSceneRecording({ download: false });
    stopTimelinePlayback({ clearFrame: true });
    runCommand({ type: "add-scene" });
    setSelectedSceneNodeId("project");
    setOpenPanel("project");
    setProjectStatus("New scene added to this project.");
  };

  const switchSceneByIndex = (index) => {
    if (sceneEntries.length === 0) return;
    const nextIndex =
      ((index % sceneEntries.length) + sceneEntries.length) % sceneEntries.length;
    const nextScene = sceneEntries[nextIndex];
    if (!nextScene || nextScene.id === engineState.scene.activeSceneId) return;
    stopSceneRecording({ download: false });
    stopTimelinePlayback({ clearFrame: true });
    runCommand({ type: "switch-scene", sceneId: nextScene.id });
    setSelectedSceneNodeId("project");
    setProjectStatus(`Switched to scene ${nextIndex + 1}.`);
  };

  const commitSceneJump = () => {
    const requestedIndex = Number.parseInt(sceneJumpValue, 10);
    if (!Number.isFinite(requestedIndex)) {
      setSceneJumpValue(String(activeSceneIndex + 1));
      return;
    }
    const clampedIndex = Math.max(
      0,
      Math.min(sceneEntries.length - 1, requestedIndex - 1)
    );
    setSceneJumpValue(String(clampedIndex + 1));
    switchSceneByIndex(clampedIndex);
  };

  const interpolateNumber = (start, end, ratio) =>
    Number.isFinite(start) && Number.isFinite(end)
      ? start + (end - start) * ratio
      : end ?? start;

  const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

  const interpolateAngle = (start, end, ratio) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return end ?? start;
    return wrapAngle(start + wrapAngle(end - start) * ratio);
  };

  const interpolateLoopingTime = (start, end, duration, ratio) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return end ?? start;
    if (!Number.isFinite(duration) || duration <= 0.0001) {
      return interpolateNumber(start, end, ratio);
    }
    let nextEnd = end;
    const delta = end - start;
    if (Math.abs(delta) > duration * 0.5) {
      nextEnd = delta < 0 ? end + duration : end - duration;
    }
    const interpolated = interpolateNumber(start, nextEnd, ratio);
    return ((interpolated % duration) + duration) % duration;
  };

  const interpolateVector = (start, end, ratio) => {
    if (!Array.isArray(start) || !Array.isArray(end)) return end ?? start;
    return start.map((value, index) =>
      interpolateNumber(value, end[index] ?? value, ratio)
    );
  };

  const interpolateRotationVector = (start, end, ratio) => {
    if (!Array.isArray(start) || !Array.isArray(end)) return end ?? start;
    return start.map((value, index) =>
      interpolateAngle(value, end[index] ?? value, ratio)
    );
  };

  const interpolateAnimationLayers = (startLayers, endLayers, ratio) => {
    const startByName = new Map(
      (Array.isArray(startLayers) ? startLayers : [])
        .filter((layer) => layer?.name)
        .map((layer) => [layer.name, layer])
    );
    const endByName = new Map(
      (Array.isArray(endLayers) ? endLayers : [])
        .filter((layer) => layer?.name)
        .map((layer) => [layer.name, layer])
    );
    const names = new Set([...startByName.keys(), ...endByName.keys()]);

    return [...names].map((name) => {
      const start = startByName.get(name) ?? endByName.get(name);
      const end = endByName.get(name) ?? startByName.get(name);
      const duration = end?.duration ?? start?.duration;
      return {
        name,
        duration,
        time: interpolateLoopingTime(
          start?.time,
          end?.time,
          duration,
          ratio
        ),
        weight: interpolateNumber(
          startByName.has(name) ? start?.weight ?? 0 : 0,
          endByName.has(name) ? end?.weight ?? 0 : 0,
          ratio
        ),
      };
    });
  };

  const interpolateQuaternion = (start, end, ratio) => {
    if (!Array.isArray(start) || !Array.isArray(end)) return end ?? start;
    const dot = start.reduce(
      (sum, value, index) => sum + value * (end[index] ?? 0),
      0
    );
    const direction = dot < 0 ? -1 : 1;
    const blended = start.map(
      (value, index) =>
        value + ((end[index] ?? value) * direction - value) * ratio
    );
    const length = Math.hypot(...blended);
    return length > 0.000001
      ? blended.map((value) => value / length)
      : [...start];
  };

  const interpolateSkeletonPose = (startPose, endPose, ratio) => {
    if (!Array.isArray(startPose) && !Array.isArray(endPose)) return undefined;
    const startByKey = new Map(
      (Array.isArray(startPose) ? startPose : [])
        .filter((entry) => entry?.key)
        .map((entry) => [entry.key, entry])
    );
    const endByKey = new Map(
      (Array.isArray(endPose) ? endPose : [])
        .filter((entry) => entry?.key)
        .map((entry) => [entry.key, entry])
    );
    const keys = new Set([...startByKey.keys(), ...endByKey.keys()]);
    return [...keys].map((key) => {
      const start = startByKey.get(key) ?? endByKey.get(key);
      const end = endByKey.get(key) ?? startByKey.get(key);
      return {
        key,
        position: interpolateVector(start?.position, end?.position, ratio),
        quaternion: interpolateQuaternion(
          start?.quaternion,
          end?.quaternion,
          ratio
        ),
      };
    });
  };

  const getTimelineSamplePair = (samples, localTime) => {
    if (!samples?.length) return null;
    let previous = samples[0];
    let next = samples[samples.length - 1];
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      if ((sample.time ?? 0) <= localTime) {
        previous = sample;
      }
      if ((sample.time ?? 0) >= localTime) {
        next = sample;
        break;
      }
    }
    const previousTime = previous.time ?? 0;
    const nextTime = next.time ?? previousTime;
    const span = Math.max(0.0001, nextTime - previousTime);
    return {
      previous,
      next,
      ratio: Math.max(0, Math.min(1, (localTime - previousTime) / span)),
    };
  };

  const getTimelineFrame = (time) => {
    const { clips } = timelineStateRef.current;
    const frame = {
      camera: null,
      characters: {},
    };

    clips.forEach((clip) => {
      const start = clip.start ?? 0;
      const duration = clip.duration ?? 0;
      if (time < start || time > start + duration) return;

      const pair = getTimelineSamplePair(clip.samples, time - start);
      if (!pair) return;

      if (clip.kind === "camera") {
        const previousCamera = pair.previous.camera ?? {};
        const nextCamera = pair.next.camera ?? previousCamera;
        frame.camera = {
          ...previousCamera,
          ...nextCamera,
          position: interpolateVector(
            previousCamera.position,
            nextCamera.position,
            pair.ratio
          ),
          target: interpolateVector(
            previousCamera.target,
            nextCamera.target,
            pair.ratio
          ),
          rotation: interpolateRotationVector(
            previousCamera.rotation,
            nextCamera.rotation,
            pair.ratio
          ),
          fov: interpolateNumber(previousCamera.fov, nextCamera.fov, pair.ratio),
        };
        return;
      }

      if (clip.kind === "character" && clip.entityId) {
        const previousCharacter = pair.previous.character;
        const nextCharacter = pair.next.character ?? previousCharacter;
        if (!previousCharacter || !nextCharacter) return;
        frame.characters[clip.entityId] = {
          ...previousCharacter,
          ...nextCharacter,
          position: interpolateVector(
            previousCharacter.position,
            nextCharacter.position,
            pair.ratio
          ),
          rotation: interpolateRotationVector(
            previousCharacter.rotation,
            nextCharacter.rotation,
            pair.ratio
          ),
          scale: interpolateVector(
            previousCharacter.scale,
            nextCharacter.scale,
            pair.ratio
          ),
          renderPosition: interpolateVector(
            previousCharacter.renderPosition ?? previousCharacter.position,
            nextCharacter.renderPosition ?? nextCharacter.position,
            pair.ratio
          ),
          renderRotation: interpolateRotationVector(
            previousCharacter.renderRotation ?? previousCharacter.rotation,
            nextCharacter.renderRotation ?? nextCharacter.rotation,
            pair.ratio
          ),
          renderFootY: interpolateNumber(
            previousCharacter.renderFootY,
            nextCharacter.renderFootY,
            pair.ratio
          ),
          animationTime:
            previousCharacter.animationClipName === nextCharacter.animationClipName
              ? interpolateLoopingTime(
                  previousCharacter.animationTime,
                  nextCharacter.animationTime,
                  nextCharacter.animationDuration ??
                    previousCharacter.animationDuration,
                  pair.ratio
                )
              : nextCharacter.animationTime ?? previousCharacter.animationTime,
          animationDuration:
            nextCharacter.animationDuration ?? previousCharacter.animationDuration,
          animationClipName:
            nextCharacter.animationClipName ?? previousCharacter.animationClipName,
          animationLayers: interpolateAnimationLayers(
            previousCharacter.animationLayers,
            nextCharacter.animationLayers,
            pair.ratio
          ),
          skeletonPose: interpolateSkeletonPose(
            previousCharacter.skeletonPose,
            nextCharacter.skeletonPose,
            pair.ratio
          ),
        };
      }
    });

    return frame;
  };

  const clearTimelinePreviewOverlay = () => {
    clearRuntimeTimelinePlaybackFrame();
  };

  const getTimelinePlaybackEndTime = () => {
    const { clips, duration } = timelineStateRef.current;
    const contentEnd = clips.reduce(
      (max, clip) => Math.max(max, (clip.start ?? 0) + (clip.duration ?? 0)),
      0
    );
    return contentEnd > 0 ? Math.min(duration, contentEnd) : 0;
  };

  const timelineCanControlViewport = canTimelineControlViewport({
    mode: engineState.mode,
    editorTool: activeEditorTool,
    phonePilotEnabled:
      phonePilotEntryOpen || Boolean(scene.camera?.phonePilotEnabled),
  });

  const applyTimelineAt = (time) => {
    if (timelinePlaybackTimerRef.current) {
      window.cancelAnimationFrame(timelinePlaybackTimerRef.current);
      timelinePlaybackTimerRef.current = null;
    }
    timelinePlaybackQueuedRef.current = false;
    setTimelinePlaying(false);
    const duration = timelineStateRef.current.duration;
    const nextTime = Math.max(0, Math.min(duration, time));
    timelinePlaybackTimeRef.current = nextTime;
    setTimelinePlayhead(nextTime);
    if (!timelineCanControlViewport) {
      clearTimelinePreviewOverlay();
      setTimelineStatus(
        `Playhead ${nextTime.toFixed(1)}s · main viewport remains in control.`
      );
      return;
    }
    setRuntimeTimelinePlaybackFrame(getTimelineFrame(nextTime), {
      mode: "preview",
    });
    setTimelineStatus(`Previewing ${nextTime.toFixed(1)}s.`);
  };

  const stopTimelinePlayback = ({ clearFrame = false } = {}) => {
    if (timelinePlaybackTimerRef.current) {
      window.cancelAnimationFrame(timelinePlaybackTimerRef.current);
      timelinePlaybackTimerRef.current = null;
    }
    const onComplete = timelinePlaybackCompleteRef.current;
    timelinePlaybackCompleteRef.current = null;
    if (clearFrame) {
      clearRuntimeTimelinePlaybackFrame();
    } else {
      const heldFrame = getRuntimeTimelinePlaybackFrame();
      if (heldFrame?.mode === "playback") {
        setRuntimeTimelinePlaybackFrame(heldFrame, { mode: "preview" });
      }
    }
    setTimelinePlaying(false);
    onComplete?.({ completed: false });
  };

  const beginTimelinePlayback = ({
    fromStart = false,
    onComplete = null,
  } = {}) => {
    timelinePlaybackQueuedRef.current = false;
    timelinePlaybackCompleteRef.current = onComplete;
    if (!timelineCanControlViewport) {
      clearTimelinePreviewOverlay();
      setTimelinePlaying(false);
      setTimelineStatus("Timeline preview is paused while a main mode owns the viewport.");
      timelinePlaybackCompleteRef.current = null;
      onComplete?.({ completed: false });
      return;
    }
    const playbackEnd = getTimelinePlaybackEndTime();
    if (playbackEnd <= 0) {
      setTimelineOpen(true);
      setTimelinePlaying(false);
      setTimelinePlayhead(0);
      clearRuntimeTimelinePlaybackFrame();
      setTimelineStatus("No clips to play.");
      timelinePlaybackCompleteRef.current = null;
      onComplete?.({ completed: false });
      return;
    }

    setTimelineOpen(true);
    setTimelinePlaying(true);
    const startTime = fromStart
      ? 0
      : timelinePlayhead >= playbackEnd
        ? 0
        : timelinePlayhead;
    timelinePlaybackTimeRef.current = startTime;
    setTimelinePlayhead(startTime);
    setRuntimeTimelinePlaybackFrame(getTimelineFrame(startTime), {
      mode: "playback",
    });
    const startedAt = performance.now();
    timelinePlaybackLastTickRef.current = startedAt;
    timelinePlaybackLastUiUpdateRef.current = startedAt;
    const playTimelineFrame = () => {
      const now = performance.now();
      const delta = (now - timelinePlaybackLastTickRef.current) / 1000;
      timelinePlaybackLastTickRef.current = now;
      const playbackEnd = getTimelinePlaybackEndTime();
      const current = timelinePlaybackTimeRef.current;
      const shouldStopAtLastFrame = current + delta >= playbackEnd;
      const next = shouldStopAtLastFrame ? playbackEnd : current + delta;
      timelinePlaybackTimeRef.current = next;
      setRuntimeTimelinePlaybackFrame(getTimelineFrame(next), {
        mode: "playback",
      });
      if (
        shouldStopAtLastFrame ||
        now - timelinePlaybackLastUiUpdateRef.current >=
          TIMELINE_PLAYHEAD_UI_INTERVAL_MS
      ) {
        timelinePlaybackLastUiUpdateRef.current = now;
        setTimelinePlayhead(next);
        if (timelineExporting) {
          setTimelineStatus(
            `Exporting timeline · ${next.toFixed(1)} / ${playbackEnd.toFixed(1)}s`
          );
        }
      }
      if (shouldStopAtLastFrame) {
        timelinePlaybackTimerRef.current = null;
        setRuntimeTimelinePlaybackFrame(getTimelineFrame(next), {
          mode: "preview",
        });
        setTimelinePlaying(false);
        setTimelineStatus("Playback stopped at the last recorded frame.");
        const completePlayback = timelinePlaybackCompleteRef.current;
        timelinePlaybackCompleteRef.current = null;
        completePlayback?.({ completed: true, endTime: next });
        return;
      }
      timelinePlaybackTimerRef.current =
        window.requestAnimationFrame(playTimelineFrame);
    };
    timelinePlaybackTimerRef.current =
      window.requestAnimationFrame(playTimelineFrame);
  };

  const startTimelinePlayback = () => {
    if (timelinePlaying) {
      stopTimelinePlayback();
      return;
    }

    if (timelineRecordingRef.current) {
      stopTimelineRecording();
      timelinePlaybackQueuedRef.current = true;
      setTimelineOpen(true);
      setTimelineStatus("Finishing recording before timeline preview...");
      return;
    }

    if (!timelineCanControlViewport) {
      timelinePlaybackQueuedRef.current = false;
      clearTimelinePreviewOverlay();
      setTimelineOpen(true);
      setTimelineStatus("Timeline preview is unavailable while a main mode owns the viewport.");
      return;
    }

    beginTimelinePlayback();
  };

  const finishTimelineExport = ({ completed = false } = {}) => {
    timelineExportStartingRef.current = false;
    timelineExportFinalizePendingRef.current = completed;
    setTimelineExportQueued(false);
    setTimelineExporting(false);
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      stopSceneRecording({ download: completed });
    }
    setTimelineStatus(
      completed
        ? "Timeline export finished. Encoding video..."
        : "Timeline export cancelled."
    );
  };

  const beginTimelineExport = () => {
    if (timelineExportStartingRef.current) return;
    const playbackEnd = getTimelinePlaybackEndTime();
    if (playbackEnd <= 0) {
      setTimelineExportQueued(false);
      setTimelineExporting(false);
      setTimelineStatus("No clips to export.");
      return;
    }

    timelineExportStartingRef.current = true;
    setTimelineExportQueued(false);
    stopTimelinePlayback({ clearFrame: true });
    timelinePlaybackTimeRef.current = 0;
    setTimelinePlayhead(0);
    setRuntimeTimelinePlaybackFrame(getTimelineFrame(0), {
      mode: "preview",
    });
    setTimelineStatus(`Preparing ${playbackEnd.toFixed(1)}s timeline export...`);

    const projectName = sanitizeProjectFileName(
      engineState.scene.project?.name
    );
    startSceneRecording(`awplanet-${projectName}-timeline`);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!timelineExportStartingRef.current) return;
        if (mediaRecorderRef.current?.state !== "recording") {
          finishTimelineExport({ completed: false });
          setTimelineStatus("Timeline export could not start the video recorder.");
          return;
        }
        timelineExportStartingRef.current = false;
        setTimelineStatus(`Exporting timeline · 0.0 / ${playbackEnd.toFixed(1)}s`);
        beginTimelinePlayback({
          fromStart: true,
          onComplete: finishTimelineExport,
        });
      });
    });
  };

  const cancelTimelineExport = () => {
    timelineExportStartingRef.current = false;
    setTimelineExportQueued(false);
    if (timelinePlaybackCompleteRef.current) {
      stopTimelinePlayback();
      return;
    }
    stopTimelinePlayback();
    finishTimelineExport({ completed: false });
  };

  const startTimelineExport = () => {
    if (timelineExporting || timelineExportQueued) {
      cancelTimelineExport();
      return;
    }
    if (getTimelinePlaybackEndTime() <= 0) {
      setTimelineOpen(true);
      setTimelineStatus("No clips to export.");
      return;
    }
    if (recordingState !== "idle") {
      setTimelineStatus("Finish the current video recording before exporting.");
      return;
    }
    if (timelineRecordingRef.current) {
      stopTimelineRecording();
    }

    stopTimelinePlayback({ clearFrame: true });
    setTimelineOpen(true);
    setTimelineExporting(true);
    setTimelineExportQueued(true);
    setTimelineStatus("Preparing timeline export...");

    const commands = [];
    if (isPlayMode) {
      commands.push(...getRuntimeCameraPoseCommands(), {
        ...createStopPlaySessionCommand(),
      });
    } else if (isPilotMode) {
      commands.push(...getRuntimeCameraPoseCommands(), {
        type: "stop-pilot-session",
      });
    }
    if (phonePilotEntryOpen || scene.camera?.phonePilotEnabled) {
      commands.push(...disablePhonePilotSession());
    }
    commands.push({ type: "set-editor-tool", tool: "select" });
    runCommand({
      type: "run-command-batch",
      label: "Prepare timeline video export",
      commands,
    });
  };

  useEffect(() => {
    if (!timelinePlaybackQueuedRef.current) return;
    if (timelinePlaying || timelineRecording || timelineRecordingRef.current) return;
    if (!timelineCanControlViewport) {
      timelinePlaybackQueuedRef.current = false;
      clearTimelinePreviewOverlay();
      return;
    }

    beginTimelinePlayback();
  });

  useEffect(() => {
    if (!timelineExportQueued || timelineExportStartingRef.current) return;
    if (
      isRuntimeMode ||
      phonePilotEntryOpen ||
      scene.camera?.phonePilotEnabled ||
      !timelineCanControlViewport ||
      recordingState !== "idle"
    ) {
      return;
    }
    beginTimelineExport();
  });

  useEffect(() => {
    if (timelineCanControlViewport) return;
    if (
      timelinePlaybackTimerRef.current ||
      timelinePlaybackQueuedRef.current ||
      getRuntimeTimelinePlaybackFrame()
    ) {
      timelinePlaybackQueuedRef.current = false;
      stopTimelinePlayback({ clearFrame: true });
      setTimelineStatus("Main viewport mode took control; timeline preview stopped.");
    }
  }, [timelineCanControlViewport]);

  useEffect(() => {
    const handleMainViewportAuthority = () => {
      if (timelinePlaybackTimerRef.current) {
        window.cancelAnimationFrame(timelinePlaybackTimerRef.current);
        timelinePlaybackTimerRef.current = null;
      }
      timelinePlaybackQueuedRef.current = false;
      clearRuntimeTimelinePlaybackFrame();
      setTimelinePlaying(false);
      setTimelineStatus("Main editor interaction took control of the viewport.");
    };
    window.addEventListener(
      "awplanet:main-viewport-authority",
      handleMainViewportAuthority
    );
    return () => {
      window.removeEventListener(
        "awplanet:main-viewport-authority",
        handleMainViewportAuthority
      );
    };
  }, []);

  const setTimelinePlayheadFromPointer = (event) => {
    const ruler = event.currentTarget
      .closest?.(".engine-timeline__body")
      ?.querySelector?.(".engine-timeline__ruler");
    const rect = (ruler ?? event.currentTarget).getBoundingClientRect();
    const nextTime =
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * timelineDuration;
    applyTimelineAt(nextTime);
  };

  const createTimelineSample = () => {
    const activeScene = latestSceneRef.current;
    const playbackFrame = getRuntimeTimelinePlaybackFrame();
    const captureFrame = getRuntimeTimelineCaptureFrame();
    const runtimePose = captureFrame?.camera ?? runtimeCameraState.pose;
    const playbackCamera = playbackFrame?.camera;
    const timelineCameraBase = { ...(activeScene.camera ?? {}) };
    delete timelineCameraBase.phonePilotEnabled;
    delete timelineCameraBase.phonePilotStartPose;
    return {
      time: performance.now(),
      captureSequence: captureFrame?.sequence,
      mode: latestModeRef.current,
      camera: {
        ...timelineCameraBase,
        ...(playbackCamera ?? {}),
        mode: "orbit",
        manual: true,
        phonePilotEnabled: false,
        phonePilotStartPose: null,
        position: [
          ...(playbackCamera?.position ??
            runtimePose.position ??
            activeScene.camera?.position ??
            [0, 20, 30]),
        ],
        rotation: [
          ...(playbackCamera?.rotation ?? runtimePose.rotation ?? [0, 0, 0]),
        ],
        target: [
          ...(playbackCamera?.target ??
            runtimePose.target ??
            activeScene.camera?.target ??
            [0, 7, 0]),
        ],
        fov: playbackCamera?.fov ?? runtimePose.fov ?? activeScene.camera?.fov,
        aspect: playbackCamera?.aspect ?? runtimePose.aspect,
        viewport: playbackCamera?.viewport ?? runtimePose.viewport,
      },
      characters: activeScene.entityOrder
        .map((entityId) => activeScene.entities[entityId])
        .filter((entity) => entity?.primitive === "character")
        .map((entity) => {
          const playbackCharacter = playbackFrame?.characters?.[entity.id];
          const runtimeCharacter =
            captureFrame?.characters?.[entity.id] ??
            getRuntimeCharacterTimelinePose(entity.id);
          return {
            id: playbackCharacter?.id ?? entity.id,
            label:
              playbackCharacter?.label ??
              runtimeCharacter?.label ??
              entity.label ??
              entity.id,
            position: [
              ...(playbackCharacter?.position ??
                runtimeCharacter?.position ??
                entity.position ??
                [0, 0, 0]),
            ],
            rotation: [
              ...(playbackCharacter?.rotation ??
                runtimeCharacter?.rotation ??
                entity.rotation ??
                [0, 0, 0]),
            ],
            scale: [
              ...(playbackCharacter?.scale ??
                runtimeCharacter?.scale ??
                entity.scale ??
                [1, 1, 1]),
            ],
            locomotionState:
              playbackCharacter?.locomotionState ??
              runtimeCharacter?.locomotionState ??
              entity.locomotionState ??
              "idle",
            activeAction:
              playbackCharacter?.activeAction ??
              runtimeCharacter?.activeAction ??
              entity.activeAction,
            animationClipName:
              playbackCharacter?.animationClipName ??
              runtimeCharacter?.animationClipName,
            animationTime:
              playbackCharacter?.animationTime ?? runtimeCharacter?.animationTime,
            animationDuration:
              playbackCharacter?.animationDuration ??
              runtimeCharacter?.animationDuration,
            animationLayers:
              playbackCharacter?.animationLayers ??
              runtimeCharacter?.animationLayers,
            renderPosition: [
              ...(playbackCharacter?.renderPosition ??
                runtimeCharacter?.renderPosition ??
                runtimeCharacter?.position ??
                entity.position ??
                [0, 0, 0]),
            ],
            renderRotation: [
              ...(playbackCharacter?.renderRotation ??
                runtimeCharacter?.renderRotation ??
                runtimeCharacter?.rotation ??
                entity.rotation ??
                [0, Math.PI, 0]),
            ],
            renderFootY:
              playbackCharacter?.renderFootY ?? runtimeCharacter?.renderFootY,
            skeletonPose:
              playbackCharacter?.skeletonPose ?? runtimeCharacter?.skeletonPose,
            boneOverrides:
              playbackCharacter?.boneOverrides ??
              runtimeCharacter?.boneOverrides ??
              entity.boneOverrides,
            boneMoveOverrides:
              playbackCharacter?.boneMoveOverrides ??
              runtimeCharacter?.boneMoveOverrides ??
              entity.boneMoveOverrides,
          };
        }),
    };
  };

  const recordTimelineSample = ({ allowAutoStop = true } = {}) => {
    const recording = timelineRecordingRef.current;
    if (!recording) return;
    const sample = createTimelineSample();
    if (
      Number.isFinite(sample.captureSequence) &&
      sample.captureSequence === recording.lastCaptureSequence
    ) {
      return;
    }
    recording.lastCaptureSequence = sample.captureSequence;
    const elapsed = (sample.time - recording.startedAt) / 1000;
    const availableDuration = Math.max(
      0,
      timelineStateRef.current.duration - recording.startPosition
    );
    const progress = Math.min(elapsed, availableDuration);
    recording.samples.push({
      ...sample,
      time: progress,
    });
    const shouldUpdateTimelineUi =
      !allowAutoStop ||
      sample.time - (recording.lastUiUpdateAt ?? 0) >=
        TIMELINE_STATUS_UPDATE_INTERVAL_MS ||
      (availableDuration > 0 && elapsed >= availableDuration);
    if (shouldUpdateTimelineUi) {
      recording.lastUiUpdateAt = sample.time;
      setTimelineRecordingProgress({
        start: recording.startPosition,
        duration: progress,
      });
      setTimelinePlayhead(recording.startPosition + progress);
      setTimelineStatus(
        `Recording ${progress.toFixed(1)}s · starts at ${recording.startPosition.toFixed(
          1
        )}s.`
      );
    }
    if (allowAutoStop && availableDuration > 0 && elapsed >= availableDuration) {
      stopTimelineRecording();
    }
  };

  const stopTimelineRecording = () => {
    const recording = timelineRecordingRef.current;
    if (!recording) return;

    if (timelineSampleTimerRef.current) {
      window.cancelAnimationFrame(timelineSampleTimerRef.current);
      timelineSampleTimerRef.current = null;
    }
    recordTimelineSample({ allowAutoStop: false });
    setRuntimeTimelineSkeletonCaptureEnabled(false);
    timelineRecordingRef.current = null;
    setTimelineRecording(false);
    setTimelineRecordingProgress(null);

    const samples = recording.samples;
    const duration = Math.max(
      0.25,
      samples.at(-1)?.time ?? (performance.now() - recording.startedAt) / 1000
    );
    if (samples.length === 0) {
      setTimelineStatus("No timeline samples captured.");
      return;
    }

    const activeScene = latestSceneRef.current;
    const existingClips = activeScene.timeline?.clips ?? [];
    const boundedStart = Math.max(
      0,
      Math.min(recording.startPosition, timelineStateRef.current.duration)
    );
    const boundedDuration = Math.min(
      duration,
      Math.max(0.25, timelineStateRef.current.duration - boundedStart)
    );
    const takeId = `take-${Date.now().toString(36)}`;
    const baseClip = {
      takeId,
      start: Math.round(boundedStart * 100) / 100,
      duration: Math.round(boundedDuration * 100) / 100,
      recordedMode: recording.mode,
      recordedAt: new Date().toISOString(),
    };
    const cameraClip = {
      ...baseClip,
      id: `${takeId}-camera`,
      trackId: "camera",
      kind: "camera",
      label: `Camera ${existingClips.length + 1}`,
      samples: samples.map((sample) => ({
        time: sample.time,
        mode: sample.mode,
        camera: sample.camera,
      })),
    };
    const characterIds = [
      ...new Set(
        samples.flatMap((sample) =>
          sample.characters.map((character) => character.id)
        )
      ),
    ];
    const characterClips = characterIds.map((characterId) => {
      const firstCharacter = samples
        .flatMap((sample) => sample.characters)
        .find((character) => character.id === characterId);
      return {
        ...baseClip,
        id: `${takeId}-${characterId}`,
        trackId: `character:${characterId}`,
        kind: "character",
        entityId: characterId,
        label: firstCharacter?.label ?? characterId,
        samples: samples.map((sample) => ({
          time: sample.time,
          mode: sample.mode,
          character:
            sample.characters.find((character) => character.id === characterId) ??
            null,
        })),
      };
    });

    runCommand({
      type: "add-timeline-clips",
      clips: [cameraClip, ...characterClips],
      timelineDuration: timelineStateRef.current.duration,
    });
    setTimelineStatus(
      `Recorded ${[cameraClip, ...characterClips].length} clips · ${duration.toFixed(
        1
      )}s.`
    );
  };

  const startTimelineRecording = () => {
    if (timelineRecording) {
      stopTimelineRecording();
      return;
    }

    const startedAt = performance.now();
    // Recording observes the active viewport; it never writes the playhead
    // frame back into the editor, game, FPV or phone director state.
    stopTimelinePlayback({ clearFrame: true });
    setRuntimeTimelineSkeletonCaptureEnabled(true);
    const startPosition =
      timelinePlayhead >= timelineStateRef.current.duration
        ? 0
        : Math.max(0, Math.min(timelinePlayhead, timelineStateRef.current.duration));
    timelineRecordingRef.current = {
      startedAt,
      startPosition,
      mode: engineState.mode,
      sceneId: engineState.scene.activeSceneId,
      samples: [],
      lastSampleAt: startedAt,
      lastUiUpdateAt: 0,
      lastCaptureSequence: getRuntimeTimelineCaptureFrame()?.sequence,
    };
    setTimelineOpen(true);
    setTimelineRecording(true);
    setTimelineRecordingProgress({ start: startPosition, duration: 0 });
    setTimelinePlayhead(startPosition);
    setTimelineStatus(`Recording timeline in ${engineState.mode} mode...`);
    const recordTimelineFrame = (now) => {
      const recording = timelineRecordingRef.current;
      if (!recording) return;
      const sampleLag = now - recording.lastSampleAt;
      if (sampleLag >= TIMELINE_SAMPLE_INTERVAL_MS - 0.75) {
        // Keep a stable 60 Hz cadence without accidentally dropping to 30 Hz
        // when requestAnimationFrame lands a fraction below 16.67 ms.
        recording.lastSampleAt =
          sampleLag > TIMELINE_SAMPLE_INTERVAL_MS * 2.5
            ? now
            : recording.lastSampleAt + TIMELINE_SAMPLE_INTERVAL_MS;
        recordTimelineSample();
      }
      if (timelineRecordingRef.current) {
        timelineSampleTimerRef.current =
          window.requestAnimationFrame(recordTimelineFrame);
      }
    };
    timelineSampleTimerRef.current =
      window.requestAnimationFrame(recordTimelineFrame);
  };

  const beginTimelineClipDrag = (event, clip) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingTimelineClip({
      clipId: clip.id,
      pointerId: event.pointerId,
      pointerStartX: event.clientX,
      start: clip.start ?? 0,
    });
  };

  const updateTimelineClipDrag = (event, clip) => {
    if (
      !draggingTimelineClip ||
      draggingTimelineClip.clipId !== clip.id ||
      draggingTimelineClip.pointerId !== event.pointerId
    ) {
      return;
    }
    event.stopPropagation();
    const nextStart = Math.max(
      0,
      draggingTimelineClip.start +
        getTimelineDeltaTime(
          event.clientX - draggingTimelineClip.pointerStartX,
          event.currentTarget
        )
    );
    runCommand({
      type: "move-timeline-clip",
      clipId: clip.id,
      start: Math.round(nextStart * 100) / 100,
      timelineDuration: timelineStateRef.current.duration,
      transient: true,
    });
  };

  const endTimelineClipDrag = (event, clip) => {
    if (
      !draggingTimelineClip ||
      draggingTimelineClip.clipId !== clip.id ||
      draggingTimelineClip.pointerId !== event.pointerId
    ) {
      return;
    }
    event.stopPropagation();
    const nextStart = Math.max(
      0,
      draggingTimelineClip.start +
        getTimelineDeltaTime(
          event.clientX - draggingTimelineClip.pointerStartX,
          event.currentTarget
        )
    );
    runCommand({
      type: "move-timeline-clip",
      clipId: clip.id,
      start: Math.round(nextStart * 100) / 100,
      timelineDuration: timelineStateRef.current.duration,
    });
    setDraggingTimelineClip(null);
  };

  const setTerrainParameter = (parameter, value) => {
    runCommand({
      type: "set-terrain-parameter",
      terrainId: scene.terrainId,
      parameter,
      value,
    });
  };

  const resetTerrainParameters = () => {
    const terrainPreset =
      TERRAIN_LIBRARY[scene.terrainId] ?? TERRAIN_LIBRARY.blank;
    ["relief", "roughness", "density"].forEach((parameter) => {
      setTerrainParameter(parameter, terrainPreset[parameter]);
    });
  };

  const activateObjectPlacement = (assetKey) => {
    runCommand({
      type: "set-editor-tool",
      tool: "object-placement",
      selectedAssetKey: assetKey,
    });
  };

  const addCharacter = () => {
    const hero = scene.entities.hero ?? activeCharacter;
    const basePosition = hero?.position ?? [0, 0, 0];
    const offset = characterEntities.length * 1.8;
    runCommand({
      type: "add-entity",
      assetKey: "characterHero",
      position: [basePosition[0] + 2.4 + offset, basePosition[1] ?? 0, basePosition[2] - 2.2],
      rotation: hero?.rotation ?? [0, Math.PI, 0],
      scale: [1, 1, 1],
      locomotionState: "idle",
      terrainId: scene.terrainId,
    });
  };

  const setCharacterAction = (actionId) => {
    if (!activeCharacter) return;
    runCommand({
      type: "set-entity-property",
      entityId: activeCharacter.id,
      property: "locomotionState",
      value: actionId,
    });
  };

  const setCharacterYaw = (degrees) => {
    if (!activeCharacter) return;
    const rotation = activeCharacter.rotation ?? [0, Math.PI, 0];
    runCommand({
      type: "transform-entity",
      entityId: activeCharacter.id,
      patch: {
        rotation: [rotation[0] ?? 0, degreesToRadians(degrees), rotation[2] ?? 0],
      },
    });
  };

  const setCharacterGroundOffset = (groundOffset) => {
    if (!activeCharacter) return;
    runCommand({
      type: "set-entity-property",
      entityId: activeCharacter.id,
      property: "groundOffset",
      value: groundOffset,
    });
  };

  const setCharacterLabel = (label) => {
    if (!activeCharacter) return;
    runCommand({
      type: "set-entity-property",
      entityId: activeCharacter.id,
      property: "label",
      value: label,
    });
  };

  const setCharacterColor = (color) => {
    if (!activeCharacter) return;
    runCommand({
      type: "set-entity-property",
      entityId: activeCharacter.id,
      property: "color",
      value: color,
      transient: isPlayMode,
    });
  };

  const setSceneColor = (property, color) => {
    runCommand({
      type: "set-scene-property",
      property,
      value: color,
    });
  };

  const setTerrainFloorColor = (color) => {
    runCommand({
      type: "set-scene-property",
      property: "terrainFloorColors",
      value: {
        ...(scene.terrainFloorColors ?? {}),
        [scene.terrainId]: color,
      },
    });
  };

  const setSceneLightingParameter = (property, value) => {
    runCommand({
      type: "set-scene-property",
      property: "lighting",
      value: {
        ...DEFAULT_SCENE_LIGHTING,
        ...(scene.lighting ?? {}),
        [property]: value,
      },
    });
  };

  const resetSceneLighting = () => {
    runCommand({
      type: "set-scene-property",
      property: "lighting",
      value: {
        ...DEFAULT_SCENE_LIGHTING,
      },
    });
  };

  const setCharacterRigProperty = (property, value) => {
    if (!activeCharacter) return;
    runCommand({
      type: "set-entity-property",
      entityId: activeCharacter.id,
      property,
      value,
    });
  };

  const clearCharacterBoneOverrides = () => {
    if (!activeCharacter) return;
    runCommand({
      type: "run-command-batch",
      label: "Clear bone rig",
      commands: [
        {
          type: "set-entity-property",
          entityId: activeCharacter.id,
          property: "boneOverrides",
          value: {},
        },
        {
          type: "set-entity-property",
          entityId: activeCharacter.id,
          property: "boneMoveOverrides",
          value: {},
        },
        {
          type: "set-entity-property",
          entityId: activeCharacter.id,
          property: "boneMoveProfiles",
          value: {},
        },
        {
          type: "set-entity-property",
          entityId: activeCharacter.id,
          property: "locomotionState",
          value: "idle",
        },
      ],
    });
  };

  const setSelectedBonePositionAxis = (axisIndex, value) => {
    if (!activeCharacter?.selectedBoneName) return;
    if (CORE_RIG_JOINT_IDS.has(activeCharacter.selectedBoneJointId)) return;
    const boneName = activeCharacter.selectedBoneName;
    const currentPosition =
      activeCharacter.boneMoveOverrides?.[boneName] ?? [0, 0, 0];
    const nextPosition = [...currentPosition];
    nextPosition[axisIndex] = value;
    runCommand({
      type: "set-entity-property",
      entityId: activeCharacter.id,
      property: "boneMoveOverrides",
      value: {
        ...(activeCharacter.boneMoveOverrides ?? {}),
        [boneName]: nextPosition,
      },
    });
  };

  const getSelectedBonePositionAxis = (axisIndex) => {
    if (!activeCharacter?.selectedBoneName) return 0;
    const position =
      activeCharacter.boneMoveOverrides?.[activeCharacter.selectedBoneName] ??
      [0, 0, 0];
    return Number(position[axisIndex] ?? 0);
  };

  const saveCharacterCustomPose = () => {
    if (!activeCharacter) return;
    const bones = activeCharacter.boneOverrides ?? {};
    const moves = activeCharacter.boneMoveOverrides ?? {};
    const moveProfiles = activeCharacter.boneMoveProfiles ?? {};
    if (Object.keys(bones).length === 0 && Object.keys(moves).length === 0) return;
    const poseId = `pose-${Date.now().toString(36)}`;
    const label =
      customPoseName.trim() ||
      `Custom ${(activeCharacter.customPoses?.length ?? 0) + 1}`;
    const nextPoses = [
      ...(activeCharacter.customPoses ?? []),
      {
        id: poseId,
        label,
        bones,
        moves,
        moveProfiles,
      },
    ];
    runCommand({
      type: "run-command-batch",
      label: "Save custom pose",
      commands: [
        {
          type: "set-entity-property",
          entityId: activeCharacter.id,
          property: "customPoses",
          value: nextPoses,
        },
        {
          type: "set-entity-property",
          entityId: activeCharacter.id,
          property: "locomotionState",
          value: `${CUSTOM_POSE_PREFIX}${poseId}`,
        },
      ],
    });
    setCustomPoseName(`Custom ${(activeCharacter.customPoses?.length ?? 0) + 2}`);
  };

  const activateBrush = (patch = {}) => {
    runCommand({
      type: "set-editor-tool",
      tool: "brush",
      brushMode,
      brushSize,
      brushStrength,
      ...patch,
    });
  };

  const toggleCameraMove = () => {
    if (isRuntimeMode) return;
    const timelineWasPreviewing = Boolean(getRuntimeTimelinePlaybackFrame());
    stopTimelinePlayback({ clearFrame: true });
    const cameraPoseCommands = timelineWasPreviewing
      ? []
      : getRuntimeCameraPoseCommands();
    runCommand({
      type: "run-command-batch",
      label: "Toggle camera move",
      commands: [
        ...cameraPoseCommands,
        {
          type: "set-editor-tool",
          tool: activeEditorTool === "camera-move" ? "select" : "camera-move",
        },
      ],
    });
  };

  const setPlayCameraMode = (mode) => {
    runCommand({
      type: "set-camera-property",
      property: "mode",
      value: mode,
    });
  };

  const prepareRuntimeModeHandoff = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      stopSceneRecording();
    }
    if (timelineRecordingRef.current) {
      stopTimelineRecording();
    }
    timelinePlaybackQueuedRef.current = false;
    stopTimelinePlayback({ clearFrame: true });
    clearTimelinePreviewOverlay();
  };

  const togglePlayMode = () => {
    prepareRuntimeModeHandoff();
    if (isPlayMode) {
      resetRuntimePhonePilotState();
      runCommand({
        type: "run-command-batch",
        label: "Stop play",
        commands: [
          ...getRuntimeCameraPoseCommands(),
          createStopPlaySessionCommand(),
        ],
      });
      return;
    }
    const disablePhonePilotCommands =
      phonePilotEntryOpen || scene.camera?.phonePilotEnabled
        ? disablePhonePilotSession()
        : [];
    if (isPilotMode) {
      runCommand({
        type: "run-command-batch",
        label: "Switch to play",
        commands: [
          ...getRuntimeCameraPoseCommands(),
          { type: "stop-pilot-session" },
          ...disablePhonePilotCommands,
          { type: "set-editor-tool", tool: "select" },
          { type: "start-play-session" },
        ],
      });
      return;
    }
    runCommand({
      type: "run-command-batch",
      label: "Start play",
      commands: [
        ...disablePhonePilotCommands,
        { type: "set-editor-tool", tool: "select" },
        { type: "start-play-session" },
      ],
    });
  };

  const togglePilotMode = () => {
    prepareRuntimeModeHandoff();
    if (isPilotMode) {
      resetRuntimePhonePilotState();
      runCommand({
        type: "run-command-batch",
        label: "Stop pilot",
        commands: [
          ...getRuntimeCameraPoseCommands(),
          { type: "stop-pilot-session" },
        ],
      });
      return;
    }
    const disablePhonePilotCommands =
      phonePilotEntryOpen || scene.camera?.phonePilotEnabled
        ? disablePhonePilotSession()
        : [];
    if (isPlayMode) {
      runCommand({
        type: "run-command-batch",
        label: "Switch to pilot",
        commands: [
          ...getRuntimeCameraPoseCommands(),
          createStopPlaySessionCommand(),
          ...disablePhonePilotCommands,
          { type: "set-editor-tool", tool: "select" },
          { type: "start-pilot-session" },
        ],
      });
      return;
    }
    runCommand({
      type: "run-command-batch",
      label: "Start pilot",
      commands: [
        ...disablePhonePilotCommands,
        { type: "set-editor-tool", tool: "select" },
        { type: "start-pilot-session" },
      ],
    });
  };

  const editorUi = (
    <div
      className={`terrain-ui engine-hud ${chromeHidden ? "is-hidden" : ""} ${
        timelineOpen ? "is-timeline-open" : ""
      }`}
    >
      {startupOpen && (
        <div
          className="engine-startup-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStartupOpen(false);
          }}
        >
          <section
            className="engine-startup"
            role="dialog"
            aria-modal="true"
            aria-label="awplanet start"
          >
            <div className="engine-startup__banner">
              <img
                alt="awplanet"
                draggable="false"
                src="/brand/awplanet-startup-banner.jpg"
              />
            </div>

            <div className="engine-startup__body">
              <div className="engine-startup__column">
                <h2>New Project</h2>
                <button
                  className="engine-startup__action is-primary"
                  type="button"
                  onClick={newProject}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M5 4.8h8.5l4.5 4.5v9.9H5z" />
                    <path d="M13.5 4.8v4.5H18" />
                    <path d="M12 11.7v5.2M9.4 14.3h5.2" />
                  </svg>
                  <span>
                    <strong>Blank Project</strong>
                    <small>Create a clean scene</small>
                  </span>
                </button>

                <div className="engine-startup__secondary-actions">
                  <button
                    className="engine-startup__text-action"
                    type="button"
                    onClick={() => projectFileInputRef.current?.click()}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M3.8 7.7h6l1.8 2h8.6v8.8H3.8z" />
                      <path d="M3.8 7.7V5.5h6.4l1.7 2.2" />
                    </svg>
                    <span>Open Project...</span>
                  </button>
                  <button
                    className="engine-startup__text-action"
                    type="button"
                    disabled={!recentProject}
                    onClick={resumeRecentProject}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M5.2 8.2A7.5 7.5 0 1 1 4.6 15" />
                      <path d="M5.2 4.8v3.4H8.6" />
                      <path d="M12 8.1v4.3l3 1.8" />
                    </svg>
                    <span>Recover Last Session</span>
                  </button>
                </div>
              </div>

              <div className="engine-startup__column">
                <h2>Recent Projects</h2>
                {recentProject ? (
                  <button
                    className="engine-startup__action engine-startup__recent"
                    type="button"
                    onClick={resumeRecentProject}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M5 4.8h8.5l4.5 4.5v9.9H5z" />
                      <path d="M13.5 4.8v4.5H18" />
                      <path d="M8.4 13.2h6.8M8.4 16h5" />
                    </svg>
                    <span>
                      <strong>
                        {recentProject.engineState.scene.project?.name ??
                          "project 1"}
                      </strong>
                      <small>
                        {new Intl.DateTimeFormat(
                          uiLanguage === "zh" ? "zh-CN" : "en",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        ).format(new Date(recentProject.savedAt))}
                      </small>
                    </span>
                  </button>
                ) : (
                  <div className="engine-startup__empty">No recent projects</div>
                )}

                <button
                  className="engine-startup__continue"
                  type="button"
                  onClick={() => setStartupOpen(false)}
                >
                  Continue Editing
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <footer className="engine-startup__footer">
              <span>awplanet alpha · © 2026 DynamicWang</span>
              <button
                className="engine-startup__language"
                type="button"
                data-no-localize="true"
                onClick={() =>
                  setUiLanguage((language) => (language === "en" ? "zh" : "en"))
                }
                aria-label={
                  uiLanguage === "en"
                    ? "切换到中文界面"
                    : "Switch to English interface"
                }
              >
                <span className={uiLanguage === "zh" ? "is-active" : ""}>中</span>
                <i aria-hidden="true" />
                <span className={uiLanguage === "en" ? "is-active" : ""}>EN</span>
              </button>
            </footer>
          </section>
        </div>
      )}

      {!chromeHidden && (
        <>
          <div className="engine-native-badge">
            <img
              alt="awplanet"
              className="engine-native-badge__logo"
              draggable="false"
              src="/brand/awplanet-mark.png"
            />
          </div>

          {canTransformSelectedObject && !isRuntimeMode && (
            <div
              className="engine-object-transform-toolbar"
              aria-label={`Transform ${selectedObject.label}`}
            >
              {OBJECT_TRANSFORM_MODES.map((mode) => {
                const shortcut =
                  mode.id === "translate" ? "G" : mode.id === "rotate" ? "R" : "S";
                return (
                  <button
                    className={transformMode === mode.id ? "is-active" : ""}
                    key={mode.id}
                    type="button"
                    onClick={() =>
                      runCommand({
                        type: "set-editor-tool",
                        tool: "select",
                        transformMode: mode.id,
                      })
                    }
                    title={`${mode.label} (${shortcut})`}
                    aria-label={`${mode.label} selected object`}
                  >
                    <DockIcon type={mode.icon} />
                    <span>{mode.label}</span>
                    <kbd>{shortcut}</kbd>
                  </button>
                );
              })}
            </div>
          )}

          {phonePilotEntryOpen && (
            <div className="engine-phone-entry" aria-label="Phone Pilot entry">
              <div className="terrain-panel__subhead">
                <span>Phone View</span>
                <strong>
                  {phonePilotStatus.connected ? "online" : "waiting"}
                </strong>
              </div>
              <div className="engine-phone-entry__url">{phonePilotUrl}</div>
              <div className="engine-phone-entry__status">
                <span
                  className={
                    phonePilotStatus.connected
                      ? "engine-phone-pilot-dot is-online"
                      : "engine-phone-pilot-dot"
                  }
                />
                <strong>
                  {phonePilotStatus.connected
                    ? "Synced viewport connected"
                    : "Open URL on phone"}
                </strong>
                <em>
                  {phonePilotStatus.ageMs != null
                    ? `${phonePilotStatus.ageMs}ms`
                    : "scene link ready"}
                </em>
              </div>
              <div className="engine-phone-entry__actions">
                <button type="button" onClick={copyPhonePilotUrl}>
                  Copy
                </button>
                <button type="button" onClick={recenterPhonePilot}>
                  Recenter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhonePilotEntryOpen(false);
                    runCommand({
                      type: "run-command-batch",
                      label: "Close phone pilot",
                      commands: getDisablePhonePilotCommands(),
                    });
                  }}
                >
                  Close
                </button>
              </div>
              <label className="engine-phone-entry__scale">
                <span>
                  <span>Move Scale</span>
                  <strong>
                    {formatNumber(scene.camera?.phonePilotMoveScale ?? 7.5, 2)}
                  </strong>
                </span>
                <input
                  max="42"
                  min="0"
                  step="0.25"
                  type="range"
                  value={scene.camera?.phonePilotMoveScale ?? 7.5}
                  onChange={(event) =>
                    updatePhonePilotMoveScale(Number(event.target.value))
                  }
                />
              </label>
              <p>{phonePilotCopyStatus}</p>
            </div>
          )}

          <div className="engine-panel-stack" aria-label="Detail panel">
              {!isPlayMode && (
                <button
                  className={`engine-panel-float-button ${
                    activeEditorTool === "camera-move" ? "is-active" : ""
                  }`}
                  type="button"
                  onClick={toggleCameraMove}
                  aria-label="Toggle camera move"
                >
                  <DockIcon type="camera" />
                </button>
              )}

              <div className="engine-panel-tabs" role="tablist" aria-label="Editor menus">
                {PANEL_TABS.filter(
                  (tab) => !tab.requiresSculptableTerrain || isBrushTerrain
                ).map((tab) => (
                  <button
                    key={tab.id}
                    className={activePanel === tab.id ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={activePanel === tab.id}
                    onClick={() => setOpenPanel(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activePanel === "character" && (
                <div className="terrain-panel is-open" aria-hidden={false}>
                  <div className="terrain-panel__header">
                    <span>Character</span>
                    <strong>{activeCharacter?.label ?? "None"}</strong>
                  </div>

                  <div className="character-panel__pinned">
                    <div className="character-panel__section">
                      <div className="terrain-panel__subhead">
                        <span>Cast</span>
                        <button type="button" onClick={addCharacter}>
                          Add Character
                        </button>
                      </div>
                      <div className="engine-color-grid">
                        <label className="engine-field engine-field--compact">
                          <span>Name</span>
                          <input
                            value={activeCharacter?.label ?? ""}
                            disabled={!activeCharacter}
                            onChange={(event) => setCharacterLabel(event.target.value)}
                          />
                        </label>
                        <label className="engine-color-field">
                          <span>Color</span>
                          <input
                            type="color"
                            value={activeCharacter?.color ?? "#0f3040"}
                            disabled={!activeCharacter}
                            onChange={(event) => setCharacterColor(event.target.value)}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="character-panel__section">
                      <div className="terrain-panel__subhead">
                        <span>Stage Transform</span>
                        <strong>
                          {activeCharacter
                            ? `${radiansToDegrees(activeCharacter.rotation?.[1] ?? 0)}deg`
                            : "No Character"}
                        </strong>
                      </div>

                      <div className="terrain-editor__list">
                        <label className="terrain-slider">
                          <span className="terrain-slider__top">
                            <span>Facing Angle</span>
                            <strong>
                              {radiansToDegrees(activeCharacter?.rotation?.[1] ?? 0)}deg
                            </strong>
                          </span>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                            value={radiansToDegrees(activeCharacter?.rotation?.[1] ?? 0)}
                            disabled={!activeCharacter}
                            onChange={(event) =>
                              setCharacterYaw(Number(event.target.value))
                            }
                          />
                        </label>

                        <label className="terrain-slider">
                          <span className="terrain-slider__top">
                            <span>Ground Offset</span>
                            <strong>
                              {(activeCharacter?.groundOffset ?? 0).toFixed(2)}
                            </strong>
                          </span>
                          <input
                            type="range"
                            min="-1.2"
                            max="2.4"
                            step="0.02"
                            value={activeCharacter?.groundOffset ?? 0}
                            disabled={!activeCharacter}
                            onChange={(event) =>
                              setCharacterGroundOffset(Number(event.target.value))
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div
                      className={`character-panel__section ${
                        boneRigCollapsed ? "is-collapsed" : ""
                      }`}
                    >
                      <div className="terrain-panel__subhead">
                        <span>Bone Rig</span>
                        <div className="terrain-panel__subhead-actions">
                          <button
                            type="button"
                            onClick={() =>
                              setCharacterRigProperty(
                                "boneRigEnabled",
                                !activeCharacter?.boneRigEnabled
                              )
                            }
                            disabled={!activeCharacter}
                          >
                            {activeCharacter?.boneRigEnabled ? "Rig On" : "Rig Off"}
                          </button>
                          <button
                            className={`terrain-panel__collapse-button ${
                              boneRigCollapsed ? "is-collapsed" : "is-expanded"
                            }`}
                            type="button"
                            onClick={() => setBoneRigCollapsed((value) => !value)}
                            aria-label={
                              boneRigCollapsed ? "Expand bone rig" : "Collapse bone rig"
                            }
                          >
                            <span aria-hidden="true">
                              {boneRigCollapsed ? "◀" : "▼"}
                            </span>
                          </button>
                        </div>
                      </div>
                      {!boneRigCollapsed && (
                        <>
                          <div className="engine-bone-rig-grid">
                            {BONE_RIG_JOINTS.map((joint) => (
                              <button
                                key={joint.id}
                                className={
                                  activeCharacter?.selectedBoneJointId === joint.id
                                    ? "is-active"
                                    : ""
                                }
                                type="button"
                                disabled={!activeCharacter}
                                onClick={() => {
                                  setCharacterRigProperty("boneRigEnabled", true);
                                  setCharacterRigProperty("selectedBoneJointId", joint.id);
                                }}
                              >
                                {uiLanguage === "zh"
                                  ? RIG_JOINT_LABELS_ZH[joint.id] ?? joint.label
                                  : joint.label}
                              </button>
                            ))}
                          </div>
                          <div className="engine-bone-axis-panel">
                            <div className="terrain-panel__subhead terrain-panel__subhead--tight">
                              <span>Selected Joint</span>
                              <strong>
                                {activeCharacter?.selectedBoneName ??
                                  activeCharacter?.selectedBoneJointId ??
                                  "None"}
                              </strong>
                            </div>
                            {[0, 1, 2].map((axisIndex) => {
                              const moveValue = getSelectedBonePositionAxis(axisIndex);
                              const moveRange = Math.max(
                                12,
                                Math.ceil(Math.abs(moveValue) + 4)
                              );
                              return (
                                <label
                                  className="terrain-slider terrain-slider--bone-move"
                                  key={`move-${axisIndex}`}
                                >
                                  <span className="terrain-slider__top">
                                    <span>
                                      {axisIndex === 0
                                        ? "Move X"
                                        : axisIndex === 1
                                          ? "Move Y"
                                          : "Move Z"}
                                    </span>
                                    <strong>{moveValue.toFixed(2)}</strong>
                                  </span>
                                  <input
                                    type="range"
                                    min={-moveRange}
                                    max={moveRange}
                                    step="0.01"
                                    value={moveValue}
                                    disabled={
                                      !activeCharacter?.selectedBoneName ||
                                      CORE_RIG_JOINT_IDS.has(
                                        activeCharacter?.selectedBoneJointId
                                      )
                                    }
                                    onInput={(event) =>
                                      setSelectedBonePositionAxis(
                                        axisIndex,
                                        Number(event.currentTarget.value)
                                      )
                                    }
                                    onChange={(event) =>
                                      setSelectedBonePositionAxis(
                                        axisIndex,
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </label>
                              );
                            })}
                          </div>
                          <div className="engine-bone-rig-save">
                            <label className="engine-field engine-field--compact">
                              <span>Pose Name</span>
                              <input
                                value={customPoseName}
                                onChange={(event) => setCustomPoseName(event.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={saveCharacterCustomPose}
                              disabled={
                                !activeCharacter ||
                                (Object.keys(activeCharacter.boneOverrides ?? {})
                                  .length === 0 &&
                                  Object.keys(activeCharacter.boneMoveOverrides ?? {})
                                    .length === 0)
                              }
                            >
                              Save Pose
                            </button>
                            <button
                              type="button"
                              onClick={clearCharacterBoneOverrides}
                              disabled={!activeCharacter}
                            >
                              Clear
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="character-panel__scroll">
                    <div
                      className={`character-panel__section ${
                        poseLibraryCollapsed ? "is-collapsed" : ""
                      }`}
                    >
                      <div className="terrain-panel__subhead">
                        <span>Pose Library</span>
                        <div className="terrain-panel__subhead-actions">
                          <strong>{activeCharacter?.locomotionState ?? "idle"}</strong>
                          <button
                            className={`terrain-panel__collapse-button ${
                              poseLibraryCollapsed ? "is-collapsed" : "is-expanded"
                            }`}
                            type="button"
                            onClick={() =>
                              setPoseLibraryCollapsed((value) => !value)
                            }
                            aria-label={
                              poseLibraryCollapsed
                                ? "Expand pose library"
                                : "Collapse pose library"
                            }
                          >
                            <span aria-hidden="true">
                              {poseLibraryCollapsed ? "◀" : "▼"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {!poseLibraryCollapsed && (
                        <div className="character-pose-list">
                          {characterActionGroups.map((group) => (
                            <div className="character-action-group" key={group.id}>
                              <div className="character-action-group__title">
                                {group.label}
                              </div>
                              <div className="character-action-grid">
                                {group.actions.map((action) => (
                                  <button
                                    key={action.id}
                                    className={`character-action-button ${
                                      activeCharacter?.locomotionState === action.id
                                        ? "is-active"
                                        : ""
                                    }`}
                                    type="button"
                                    disabled={!activeCharacter}
                                    onClick={() => setCharacterAction(action.id)}
                                  >
                                    <span>{action.label}</span>
                                    <em>{action.detail}</em>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              )}

              {activePanel === "objects" && (
                <div className="asset-panel is-open" aria-hidden={false}>
                  <div className="terrain-panel__header">
                    <span>Objects</span>
                    <strong>{scene.entityOrder.length}</strong>
                  </div>

                  <div className="engine-tool-panel__section engine-basic-objects">
                    <div className="terrain-panel__subhead">
                      <span>Basic Objects</span>
                      <strong>Blender Primitives</strong>
                    </div>
                    <div className="engine-basic-object-grid">
                      {BASIC_PRIMITIVE_ASSET_KEYS.map((assetKey) => {
                        const asset = ENTITY_LIBRARY[assetKey];
                        return (
                          <button
                            key={assetKey}
                            className={`asset-button ${
                              activeEditorTool === "object-placement" &&
                              selectedAssetKey === assetKey
                                ? "is-active"
                                : ""
                            }`}
                            type="button"
                            onClick={() => activateObjectPlacement(assetKey)}
                          >
                            <Suspense
                              fallback={<span className="asset-preview is-loading" />}
                            >
                              <AssetPreview
                                asset={asset}
                                label={asset.label}
                                active={
                                  activeEditorTool === "object-placement" &&
                                  selectedAssetKey === assetKey
                                }
                              />
                            </Suspense>
                            <span>{asset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="asset-category-tabs">
                    {ASSET_CATEGORY_OPTIONS.map((category) => (
                      <button
                        key={category.id}
                        className={`asset-category-tab ${
                          assetCategory === category.id ? "is-active" : ""
                        }`}
                        type="button"
                        onClick={() => setAssetCategory(category.id)}
                        disabled={(assetCategoryCounts[category.id] ?? 0) === 0}
                      >
                        <span>{category.label}</span>
                        <strong>{assetCategoryCounts[category.id] ?? 0}</strong>
                      </button>
                    ))}
                  </div>

                  <div className="asset-panel__grid engine-asset-panel__grid">
                    {entityAssets.length === 0 ? (
                      <span className="asset-panel__empty">
                        No objects for this category
                      </span>
                    ) : (
                      entityAssets.map(([assetKey, asset]) => (
                        <button
                          key={assetKey}
                          className={`asset-button ${
                            activeEditorTool === "object-placement" &&
                            selectedAssetKey === assetKey
                              ? "is-active"
                              : ""
                          }`}
                          type="button"
                          onClick={() => activateObjectPlacement(assetKey)}
                        >
                          <Suspense
                            fallback={<span className="asset-preview is-loading" />}
                          >
                            <AssetPreview
                              url={getEntityAssetUrl(asset)}
                              asset={asset}
                              label={asset.label}
                              active={
                                activeEditorTool === "object-placement" &&
                                selectedAssetKey === assetKey
                              }
                            />
                          </Suspense>
                          <span>{asset.label}</span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="engine-tool-hint">
                    {activeEditorTool === "object-placement"
                      ? `Click the ground to place ${ENTITY_LIBRARY[selectedAssetKey]?.label ?? "object"}.`
                      : "Choose an object, then click the ground to place it."}
                  </div>

                </div>
              )}

              {activePanel === "map" && (
                <div className="map-panel is-open" aria-hidden={false}>
                  <div className="terrain-panel__header">
                    <span>World Material</span>
                    <strong>{selectedTerrain.label}</strong>
                  </div>

                  {MAP_GENERATOR_ENABLED && (
                    <>
                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Generator Type</span>
                      <strong>{MAP_PRESETS.find((preset) => preset.id === mapPreset)?.label}</strong>
                    </div>
                    <div className="engine-map-generator__grid">
                      {MAP_PRESETS.map((preset) => (
                        <button
                          className={mapPreset === preset.id ? "is-active" : ""}
                          key={preset.id}
                          type="button"
                          onClick={() => setMapPreset(preset.id)}
                        >
                          <span>{preset.detail}</span>
                          <strong>{preset.label}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Generation Resource</span>
                      <strong>
                        {uiLanguage === "zh"
                          ? `${scene.generation?.entityCount ?? 0} 个节点`
                          : `${scene.generation?.entityCount ?? 0} nodes`}
                      </strong>
                    </div>
                    <div className="engine-seed-row">
                      <label className="engine-field engine-field--compact engine-seed-field">
                        <span>Seed</span>
                        <input
                          value={mapSeed}
                          onChange={(event) => setMapSeed(event.target.value)}
                        />
                      </label>
                      <button
                        className="engine-seed-dice"
                        type="button"
                        onClick={() => setMapSeed(`${mapPreset}-${Date.now()}`)}
                        aria-label="Random seed"
                      >
                        <DockIcon type="dice" />
                      </button>
                    </div>
                  </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Parameters</span>
                      <strong>{mapPreset}</strong>
                    </div>
                    <div className="terrain-editor__list">
                      {MAP_CONFIG_CONTROLS[mapPreset].map((control) => (
                        <MapConfigSlider
                          control={control}
                          key={control.key}
                          value={mapConfigs[mapPreset][control.key]}
                          onChange={(key, value) =>
                            updateMapConfig(mapPreset, key, value)
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {mapPreset === "osm-import" && (
                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Local OSM Source</span>
                      <strong>GeoJSON</strong>
                    </div>
                    <div className="engine-osm-sample">
                      <img
                        src={OSM_SAMPLE_IMAGE_URL}
                        alt="Google Maps preview screenshot"
                      />
                      <div>
                        <strong>{OSM_SAMPLE_SOURCE.label}</strong>
                        <span>
                          Google preview paired with matching OpenStreetMap geometry.
                        </span>
                      </div>
                    </div>
                    <label className="engine-field engine-field--compact">
                      <span>Upload Map Data</span>
                      <input
                        accept=".geojson,.json,application/geo+json,application/json"
                        type="file"
                        onChange={(event) => importOsmFile(event.target.files?.[0])}
                      />
                    </label>
                    <label className="engine-field engine-field--compact">
                      <span>Paste GeoJSON / Overpass JSON</span>
                      <textarea
                        value={osmImportText}
                        onChange={(event) => {
                          setOsmImportText(event.target.value);
                          setOsmImportStatus("Map data edited. Ready to import.");
                        }}
                        placeholder='{"type":"FeatureCollection","features":[...]}'
                        rows={5}
                      />
                    </label>
                    <div className="engine-tool-hint">{osmImportStatus}</div>
                    <div className="asset-panel__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setOsmImportText(JSON.stringify(OSM_SAMPLE_GEOJSON, null, 2));
                          setOsmImportStatus(
                            `${OSM_SAMPLE_SOURCE.label} OSM data loaded. Press Generate.`
                          );
                        }}
                      >
                        Use Sample
                      </button>
                      <button type="button" onClick={importOsmMap}>
                        Import OSM Scene
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOsmImportText("");
                          setOsmImportStatus("Paste GeoJSON or Overpass JSON.");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  )}
                    </>
                  )}

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>World Material</span>
                      <button type="button" onClick={resetTerrainParameters}>
                        Reset
                      </button>
                    </div>

                    <div className="terrain-panel__grid terrain-panel__grid--compact">
                      {TERRAIN_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          className={`terrain-swatch ${
                            scene.terrainId === option.id ? "is-active" : ""
                          } material-orb--${option.id}`}
                          type="button"
                          onClick={() =>
                            runCommand({ type: "switch-terrain", terrainId: option.id })
                          }
                        >
                          <span
                            className="terrain-swatch__icon"
                            style={{
                              "--swatch-a": option.colors[0],
                              "--swatch-b": option.colors[1],
                            }}
                          />
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="engine-color-grid engine-color-grid--scene">
                      <label className="engine-color-field">
                        <span>Background</span>
                        <input
                          type="color"
                          value={scene.backgroundColor ?? selectedTerrain.fog}
                          onChange={(event) =>
                            setSceneColor("backgroundColor", event.target.value)
                          }
                        />
                      </label>
                      <label className="engine-color-field">
                        <span>Floor</span>
                        <input
                          type="color"
                          value={selectedTerrainFloorColor}
                          onChange={(event) => setTerrainFloorColor(event.target.value)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Lighting</span>
                      <button type="button" onClick={resetSceneLighting}>
                        Reset
                      </button>
                    </div>
                    <div className="engine-lighting-controls">
                      {LIGHTING_CONTROLS.map((control) => {
                        const value =
                          scene.lighting?.[control.key] ??
                          DEFAULT_SCENE_LIGHTING[control.key];
                        return (
                          <MapConfigSlider
                            key={control.key}
                            control={control}
                            value={value}
                            onChange={(property, nextValue) =>
                              setSceneLightingParameter(property, nextValue)
                            }
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Material Settings</span>
                      <strong>{selectedTerrain.label}</strong>
                    </div>

                    <div className="terrain-editor__list">
                      {Object.entries(PARAMETER_CONTROLS).map(([key, control]) => {
                        const value =
                          terrainParameters[key] ??
                          selectedTerrainPreset[key] ??
                          0;
                        return (
                          <label className="terrain-slider" key={key}>
                            <span className="terrain-slider__top">
                              <span>{control.label}</span>
                              <strong>{value.toFixed(2)}</strong>
                            </span>
                            <input
                              type="range"
                              min={control.min}
                              max={control.max}
                              step={control.step}
                              value={value}
                              onChange={(event) =>
                                setTerrainParameter(key, Number(event.target.value))
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {MAP_GENERATOR_ENABLED && (
                    <div className="asset-panel__actions">
                      <button type="button" onClick={() => generateMap()}>
                        Generate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMapConfigs((configs) => ({
                            ...configs,
                            [mapPreset]: DEFAULT_MAP_CONFIGS[mapPreset],
                          }))
                        }
                      >
                        Reset Params
                      </button>
                    </div>
                  )}

                </div>
              )}

              {activePanel === "camera" && (
                <div className="camera-panel is-open" aria-hidden={false}>
                  <div className="terrain-panel__header">
                    <span>Camera Rig</span>
                    <strong>{selectedCameraPreset.label}</strong>
                  </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Follow Target</span>
                      <strong>{scene.camera?.targetEntityId ?? "hero"}</strong>
                    </div>
                    <label className="engine-field engine-field--compact">
                      <span>Target Node</span>
                      <select
                        value={scene.camera?.targetEntityId ?? "hero"}
                        onChange={(event) =>
                          updateCameraProperty("targetEntityId", event.target.value)
                        }
                      >
                        {cameraTargetOptions.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="engine-camera-preview-shell">
                    <div className="terrain-panel__subhead">
                      <span>Live Shot Preview</span>
                      <strong>{previewCameraPreset.label}</strong>
                    </div>
                    <Suspense
                      fallback={<div className="engine-camera-hero-preview is-loading" />}
                    >
                      <CameraHeroPreview
                        hero={scene.entities.hero}
                        preset={previewCameraPreset}
                        motionLoop={scene.camera?.motionLoop ?? true}
                      />
                    </Suspense>
                  </div>

                  <div className="engine-camera-scroll">
                    <div className="engine-tool-panel__section">
                      <div className="terrain-panel__subhead">
                        <span>Lens And Frame</span>
                        <strong>cinematic</strong>
                      </div>
                      <div className="terrain-editor__list">
                        {CAMERA_LENS_CONTROLS.map((control) => (
                          <MapConfigSlider
                            control={control}
                            key={control.key}
                            value={scene.camera?.[control.key] ?? 0}
                            onChange={updateCameraProperty}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="engine-tool-panel__section">
                      <div className="terrain-panel__subhead">
                        <span>Shot Presets</span>
                        <strong>{previewCameraPreset.label}</strong>
                      </div>
                    <div className="engine-map-generator__grid engine-map-generator__grid--three engine-camera-shot-grid">
                      {cameraShotPresets.map((preset) => (
                        <button
                          className={
                            scene.camera?.preset === preset.id ? "is-active" : ""
                          }
                          key={preset.id}
                          type="button"
                          onFocus={() => setPreviewCameraPresetId(preset.id)}
                          onPointerEnter={() => setPreviewCameraPresetId(preset.id)}
                          onClick={() => applyCameraPreset(preset)}
                        >
                          <span>
                            {preset.imported ? "Imported" : preset.detail}
                          </span>
                          <strong>{preset.label}</strong>
                          <em>
                            {getCameraMotionLabel(preset.camera.motionType)}
                            {" · "}
                            {formatNumber(preset.camera.motionAmplitude ?? 0)}
                          </em>
                        </button>
                      ))}
                    </div>
                    </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Follow Tuning</span>
                      <strong>Target Follow</strong>
                    </div>
                    <div className="terrain-editor__list">
                      {CAMERA_FOLLOW_CONTROLS.map((control) => (
                        <MapConfigSlider
                          control={control}
                          key={control.key}
                          value={
                            scene.camera?.[control.key] ??
                            (control.key === "followDistance"
                              ? 18
                              : control.key === "followHeight"
                                ? 8
                              : control.key === "firstPersonForwardOffset"
                                ? 1.05
                              : control.key === "followSmoothing"
                                ? 8
                              : 45)
                          }
                          onChange={updateCameraProperty}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Preset Motion</span>
                      <strong>{getCameraMotionLabel(scene.camera?.motionType)}</strong>
                    </div>
                    <div className="engine-camera-motion-summary">
                      <span>Type</span>
                      <strong>{getCameraMotionLabel(scene.camera?.motionType)}</strong>
                      <em>
                        Select another shot preset to switch movement style. Sliders below
                        tune this preset.
                      </em>
                    </div>
                    <label className="engine-toggle-row engine-toggle-row--compact">
                      <span>
                        <strong>Loop Playback</strong>
                        <em>
                          {(scene.camera?.motionLoop ?? true)
                            ? "Continuous camera move"
                            : "One timeline then hold"}
                        </em>
                      </span>
                      <button
                        className={
                          (scene.camera?.motionLoop ?? true)
                            ? "engine-toggle-row__button--compact is-active"
                            : "engine-toggle-row__button--compact"
                        }
                        type="button"
                        onClick={() =>
                          updateCameraProperty(
                            "motionLoop",
                            !(scene.camera?.motionLoop ?? true)
                          )
                        }
                      >
                        {(scene.camera?.motionLoop ?? true) ? "Loop" : "Once"}
                      </button>
                    </label>
                    <div className="terrain-editor__list">
                      {CAMERA_MOTION_CONTROLS.map((control) => (
                        <MapConfigSlider
                          control={control}
                          key={control.key}
                          value={
                            scene.camera?.[control.key] ??
                            (control.key === "motionSpeed"
                              ? 0.4
                              : control.key === "targetLead"
                                ? 0.8
                              : 0)
                          }
                          onChange={updateCameraProperty}
                        />
                      ))}
                    </div>
                  </div>

                  {!isPlayMode && (
                    <div className="engine-tool-panel__section">
                      <div className="terrain-panel__subhead">
                        <span>Editor Views</span>
                        <strong>Camera3D</strong>
                      </div>
                      <div className="engine-map-generator__grid engine-map-generator__grid--two">
                        {CAMERA_PRESETS.map((preset) => (
                          <button
                            className={
                              scene.camera?.preset === preset.id ? "is-active" : ""
                            }
                            key={preset.id}
                            type="button"
                            onClick={() => applyCameraPreset(preset)}
                          >
                            <span>{preset.detail}</span>
                            <strong>{preset.label}</strong>
                          </button>
                        ))}
                      </div>
                      <div className="engine-tool-hint">
                        Click the camera button beside this panel to move the editor view.
                      </div>
                    </div>
                  )}

                  <div className="engine-tool-panel__section">
                    <div className="terrain-panel__subhead">
                      <span>Runtime Values</span>
                      <button type="button" onClick={() => setSelectedSceneNodeId("camera")}>
                        Inspect
                      </button>
                    </div>
                    <InfoRow
                      label="Position"
                      value={formatVector(scene.camera?.position ?? [0, 20, 30])}
                    />
                    <InfoRow
                      label="Target"
                      value={formatVector(scene.camera?.target ?? [0, 7, 0])}
                    />
                    <InfoRow
                      label="Distance"
                      value={`${formatNumber(scene.camera?.minDistance ?? 0.85)} / ${formatNumber(scene.camera?.maxDistance ?? 90)}`}
                    />
                  </div>

                  </div>

                  <div className="engine-camera-import-dock">
                    <div className="terrain-panel__subhead">
                      <span>Import Shot File</span>
                      <strong>
                        {uiLanguage === "zh"
                          ? `${customCameraPresets.length} 个自定义预设`
                          : `${customCameraPresets.length} custom`}
                      </strong>
                    </div>
                    <label className="engine-field engine-field--compact">
                      <span>Preset File</span>
                      <input
                        accept=".json,.js,.mjs,application/json,text/javascript,application/javascript"
                        type="file"
                        onChange={(event) => {
                          importCameraShotFile(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <div className="asset-panel__actions engine-camera-import-actions">
                      <button type="button" onClick={downloadCameraShotTemplate}>
                        Template JSON
                      </button>
                      <button
                        type="button"
                        disabled={customCameraPresets.length === 0}
                        onClick={() => {
                          setCustomCameraPresets([]);
                          setPreviewCameraPresetId(null);
                          setCameraImportStatus("Imported camera presets cleared.");
                        }}
                      >
                        Clear Imported
                      </button>
                    </div>
                    <div className="engine-tool-hint">{cameraImportStatus}</div>
                  </div>

                </div>
              )}

              {activePanel === "project" && (
                <div className="object-editor-panel is-open" aria-hidden={false}>
                  <div className="terrain-panel__header">
                    <span>Project</span>
                    <strong>{engineState.scene.project?.name ?? "project 1"}</strong>
                  </div>

                  <div className="engine-project-actions">
                    <button type="button" onClick={newProject}>
                      New Project
                    </button>
                    <button type="button" onClick={saveProject}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => projectFileInputRef.current?.click()}
                    >
                      Load
                    </button>
                    <input
                      ref={projectFileInputRef}
                      className="engine-project-file-input"
                      accept=".json,.awplanet,.awplanet.json,application/json"
                      type="file"
                      onChange={(event) => {
                        loadProjectFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>

                  <div className="engine-project-fields">
                    <label className="engine-field engine-field--compact">
                      <span>Project Name</span>
                      <input
                        value={engineState.scene.project?.name ?? "project 1"}
                        onChange={(event) => setProjectName(event.target.value)}
                      />
                    </label>
                    <label className="engine-field engine-field--compact">
                      <span>Scene</span>
                      <input
                        value={scene.name ?? "blank world"}
                        onChange={(event) => setSceneName(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="engine-project-scene-tools">
                    <div className="terrain-panel__subhead">
                      <span>Scenes</span>
                      <strong>
                        {activeSceneIndex + 1} / {sceneEntries.length}
                      </strong>
                    </div>
                    <button type="button" onClick={addScene}>
                      Add Scene
                    </button>
                  </div>

                  <div className="engine-project-state">
                    <div className="terrain-panel__subhead">
                      <span>Current State</span>
                      <strong>{engineState.mode}</strong>
                    </div>
                    <InfoRow label="Scene ID" value={engineState.scene.activeSceneId} />
                    <InfoRow
                      label="Scene Index"
                      value={`${activeSceneIndex + 1} / ${sceneEntries.length}`}
                    />
                    <InfoRow label="World" value={scene.name ?? "blank world"} />
                    <InfoRow label="Material" value={selectedTerrain.label} />
                    <InfoRow label="Entities" value={scene.entityOrder.length} />
                    <InfoRow
                      label="Selected"
                      value={
                        scene.selectedEntityId ??
                        (uiLanguage === "zh" ? "无" : "None")
                      }
                    />
                    <InfoRow
                      label="History"
                      value={
                        uiLanguage === "zh"
                          ? `${undoCount} 次撤销 / ${redoCount} 次重做`
                          : `${undoCount} undo / ${redoCount} redo`
                      }
                    />
                    <div className="engine-tool-hint">{projectStatus}</div>
                  </div>

                  <div className="terrain-panel__subhead">
                    <span>Scene Outline</span>
                    <strong>
                      {uiLanguage === "zh"
                        ? `${scene.entityOrder.length} 个节点`
                        : `${scene.entityOrder.length} nodes`}
                    </strong>
                  </div>
                  <div className="engine-scene-tree">
                    {sceneDocumentOutline.map((node) => (
                      <SceneTreeNode
                        key={node.id}
                        node={node}
                        selectedNodeId={activeSceneNodeId}
                        onSelect={selectSceneNode}
                      />
                    ))}
                  </div>

                  <SchemaInspector
                    target={schemaInspectorTarget}
                    onEdit={editSchemaProperty}
                    readOnly
                  />
                </div>
              )}

              {activePanel === "brush" && (
                <div className="brush-panel is-open" aria-hidden={false}>
                  <div className="terrain-panel__header">
                    <span>Terrain Brush</span>
                    <strong>{activeSculptTool.label}</strong>
                  </div>

                  <div className="brush-tool-summary">
                    <span className="brush-tool-summary__icon">
                      <DockIcon type={activeSculptTool.icon} />
                    </span>
                    <span>
                      <strong>{activeSculptTool.label}</strong>
                      <em>{activeSculptTool.detail}</em>
                    </span>
                  </div>

                  <label className="terrain-slider">
                    <span className="terrain-slider__top">
                      <span>Brush Size</span>
                      <strong>{brushSize.toFixed(0)}</strong>
                    </span>
                    <input
                      type="range"
                      min="5"
                      max="34"
                      step="1"
                      value={brushSize}
                      onChange={(event) => {
                        const nextSize = Number(event.target.value);
                        setBrushSize(nextSize);
                        activateBrush({ brushSize: nextSize });
                      }}
                    />
                  </label>

                  <label className="terrain-slider">
                    <span className="terrain-slider__top">
                      <span>
                        {brushMode === "smooth"
                          ? "Smooth Amount"
                          : brushMode === "flatten"
                            ? "Blend Strength"
                            : brushMode === "noise"
                              ? "Noise Amount"
                            : brushMode === "erode"
                              ? "Erosion Amount"
                            : "Brush Strength"}
                      </span>
                      <strong>{brushStrength.toFixed(2)}</strong>
                    </span>
                    <input
                      type="range"
                      min="0.15"
                      max="3"
                      step="0.05"
                      value={brushStrength}
                      onChange={(event) => {
                        const nextStrength = Number(event.target.value);
                        setBrushStrength(nextStrength);
                        activateBrush({ brushStrength: nextStrength });
                      }}
                    />
                  </label>

                  <div className="engine-tool-hint">
                    Select a sculpt tool from the left dock. Move over the ground to preview the brush ring, then drag to sculpt.
                  </div>

                </div>
              )}
            </div>

          <div className="engine-mode-switcher" aria-label="Runtime modes">
            <button
              className={`engine-mode-button ${
                isPlayMode ? "is-active" : ""
              }`}
              type="button"
              tabIndex={-1}
              onClick={togglePlayMode}
              onKeyDown={(event) => {
                if (event.code === "Space") {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              aria-label={isPlayMode ? "Stop play mode" : "Start play mode"}
            >
              <DockIcon type={isPlayMode ? "stop" : "play"} />
            </button>
            <button
              className={`engine-mode-button engine-mode-button--pilot ${
                isPilotMode ? "is-active" : ""
              }`}
              type="button"
              tabIndex={-1}
              onClick={togglePilotMode}
              onKeyDown={(event) => {
                if (event.code === "Space") {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              aria-label={isPilotMode ? "Stop pilot mode" : "Start pilot mode"}
            >
              <DockIcon type="pilot" />
            </button>
            <button
              className={`engine-mode-button engine-mode-button--phone ${
                scene.camera?.phonePilotEnabled || phonePilotEntryOpen
                  ? "is-active"
                  : ""
              }`}
              type="button"
              tabIndex={-1}
              onClick={togglePhonePilotEntry}
              onKeyDown={(event) => {
                if (event.code === "Space") {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              aria-label={
                scene.camera?.phonePilotEnabled || phonePilotEntryOpen
                  ? "Stop phone pilot"
                  : "Start phone pilot"
              }
            >
              <DockIcon type="phone" />
            </button>
          </div>

          {engineState.mode === "play" && (
            <div className="engine-play-hud">
              <div className="terrain-panel__subhead">
                <span>Play Mode</span>
                <strong>{engineState.gameplay?.status ?? "running"}</strong>
              </div>
              <div
                className="engine-play-control-guide"
                aria-label="Play controls"
              >
                <div className="engine-play-control-guide__wasd" aria-hidden="true">
                  <kbd className="is-w">W</kbd>
                  <kbd className="is-a">A</kbd>
                  <kbd className="is-s">S</kbd>
                  <kbd className="is-d">D</kbd>
                </div>
                <div className="engine-play-control-guide__legend">
                  <div>
                    <strong>Move</strong>
                    <span>WASD / Arrow Keys</span>
                  </div>
                  <div>
                    <strong>Run</strong>
                    <span>Hold Shift</span>
                  </div>
                  <div>
                    <strong>View</strong>
                    <span>Mouse Drag / Wheel</span>
                  </div>
                </div>
              </div>
              <div className="engine-play-camera-modes" aria-label="Game camera modes">
                {CAMERA_MODES.map((mode) => (
                  <button
                    className={playCameraMode === mode.id ? "is-active" : ""}
                    key={mode.id}
                    type="button"
                    onClick={() => setPlayCameraMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <button
                className={`engine-record-button ${
                  recordingState === "recording" ? "is-recording" : ""
                }`}
                type="button"
                disabled={recordingState === "saving"}
                onClick={startSceneRecording}
                onKeyDown={(event) => {
                  if (event.code === "Space") {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                aria-label={
                  recordingState === "recording"
                    ? "Stop scene recording"
                    : "Start 60fps scene recording"
                }
              >
                <span className="engine-record-button__mark" aria-hidden="true" />
                <span className="engine-record-button__copy">
                  <strong>
                    {recordingState === "recording"
                      ? "Stop Recording"
                      : recordingState === "saving"
                        ? "Saving Capture"
                        : "Record Scene"}
                  </strong>
                  <em>{recordingFormat.toUpperCase()} · 60FPS</em>
                </span>
              </button>
              <div className="engine-record-status">{recordingStatus}</div>
              <p>{engineState.gameplay?.lastEvent ?? "Use WASD to move."}</p>
            </div>
          )}

          {isPilotMode && (
            <div className="engine-play-hud engine-pilot-hud">
              <div className="terrain-panel__subhead">
                <span>Pilot Mode</span>
                <strong>{recordingState === "recording" ? "REC" : "camera"}</strong>
              </div>
              <div className="engine-play-hud__objective">
                Camera Pilot / FPV Dolly
              </div>
              <div
                className="engine-play-control-guide engine-pilot-control-guide"
                aria-label="Camera pilot controls"
              >
                <div className="engine-play-control-guide__wasd" aria-hidden="true">
                  <kbd className="is-w">W</kbd>
                  <kbd className="is-a">A</kbd>
                  <kbd className="is-s">S</kbd>
                  <kbd className="is-d">D</kbd>
                </div>
                <div className="engine-play-control-guide__legend">
                  <div>
                    <strong>Move</strong>
                    <span>WASD</span>
                  </div>
                  <div>
                    <strong>Elevate</strong>
                    <span>Q / E</span>
                  </div>
                  <div>
                    <strong>Speed</strong>
                    <span>Shift / Alt</span>
                  </div>
                </div>
              </div>
              <div className="engine-pilot-target-row">
                <label>
                  <span>Target</span>
                  <select
                    value={scene.camera?.pilotLockTargetEntityId ?? "hero"}
                    onChange={(event) =>
                      updateCameraProperty(
                        "pilotLockTargetEntityId",
                        event.target.value
                      )
                    }
                  >
                    {cameraTargetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={
                    scene.camera?.pilotLockTargetEnabled
                      ? "engine-pilot-lock-button is-active"
                      : "engine-pilot-lock-button"
                  }
                  type="button"
                  onClick={() =>
                    updateCameraProperty(
                      "pilotLockTargetEnabled",
                      !scene.camera?.pilotLockTargetEnabled
                    )
                  }
                  aria-pressed={Boolean(scene.camera?.pilotLockTargetEnabled)}
                >
                  Lock
                </button>
              </div>
              <div className="engine-play-hud__stats">
                <span>Mouse Look</span>
                <span>
                  {scene.camera?.phonePilotEnabled
                    ? phonePilotStatus.connected
                      ? "Phone Online"
                      : "Phone Armed"
                    : "Phone Off"}
                </span>
              </div>
              <div className="terrain-editor__list engine-pilot-controls">
                {PILOT_CONTROLS.map((control) => (
                  <MapConfigSlider
                    control={control}
                    key={control.key}
                    value={
                      scene.camera?.[control.key] ??
                      (control.key === "pilotSpeed"
                        ? 16
                        : control.key === "pilotElevationSpeed"
                          ? 16
                        : control.key === "pilotLookSpeed"
                          ? 0.72
                        : control.key === "pilotLookSmoothing"
                          ? 6.2
                        : control.key === "pilotSmoothing"
                          ? 10
                        : control.key === "pilotInputLag"
                          ? 0.55
                        : control.key === "pilotSwingAmount"
                          ? 0.55
                        : control.key === "pilotFov"
                          ? scene.camera?.fov ?? 45
                        : 0)
                    }
                    onChange={updateCameraProperty}
                  />
                ))}
              </div>
              <button
                className={`engine-record-button ${
                  recordingState === "recording" ? "is-recording" : ""
                }`}
                type="button"
                disabled={recordingState === "saving"}
                onClick={startSceneRecording}
                onKeyDown={(event) => {
                  if (event.code === "Space") {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                aria-label={
                  recordingState === "recording"
                    ? "Stop pilot take recording"
                    : "Start pilot take recording"
                }
              >
                <span className="engine-record-button__mark" aria-hidden="true" />
                <span className="engine-record-button__copy">
                  <strong>
                    {recordingState === "recording"
                      ? "Stop Take"
                      : recordingState === "saving"
                        ? "Saving Take"
                        : "Record Take"}
                  </strong>
                  <em>Video + Camera JSON</em>
                </span>
              </button>
              <div className="engine-record-status">{recordingStatus}</div>
              <p>Drag inside the viewport to steer the lens while Hero keeps performing.</p>
            </div>
          )}

          {showCodexCommander && (
            <div className="engine-command-dock" aria-label="Codex Commander">
              {codexMini}
            </div>
          )}

          <button
            className={`engine-timeline-toggle ${timelineOpen ? "is-active" : ""}`}
            type="button"
            onClick={() => setTimelineOpen((value) => !value)}
            aria-label="Toggle storyboard timeline"
          >
            <DockIcon type="timeline" />
          </button>

          {timelineOpen && (
            <section className="engine-timeline" aria-label="Storyboard timeline">
              <div className="engine-timeline__header">
                <div>
                  <span>Storyboard Timeline</span>
                  <strong>
                    {uiLanguage === "zh"
                      ? `${timelineTracks.length} 条轨道 · ${timelineClips.length} 个片段`
                      : `${timelineTracks.length} tracks · ${timelineClips.length} clips`}
                  </strong>
                </div>
                <p>{timelineStatus}</p>
                <div className="engine-timeline__controls">
                  <button
                    className={timelinePlaying ? "is-playing" : ""}
                    type="button"
                    disabled={timelineExporting || timelineExportQueued}
                    onClick={
                      timelinePlaying ? stopTimelinePlayback : startTimelinePlayback
                    }
                  >
                    <DockIcon type={timelinePlaying ? "stop" : "play"} />
                    <span>{timelinePlaying ? "Pause" : "Play"}</span>
                  </button>
                  <button
                    className={timelineRecording ? "is-recording" : ""}
                    type="button"
                    disabled={timelineExporting || timelineExportQueued}
                    onClick={
                      timelineRecording ? stopTimelineRecording : startTimelineRecording
                    }
                  >
                    <DockIcon type={timelineRecording ? "stop" : "record"} />
                    <span>{timelineRecording ? "Stop" : "Record"}</span>
                  </button>
                  <button
                    className={
                      timelineExporting || timelineExportQueued
                        ? "is-exporting"
                        : ""
                    }
                    type="button"
                    disabled={
                      (!timelineExporting && !timelineExportQueued &&
                        timelineClips.length === 0) ||
                      recordingState === "saving" ||
                      (recordingState === "recording" && !timelineExporting)
                    }
                    onClick={startTimelineExport}
                    aria-label={
                      timelineExporting || timelineExportQueued
                        ? "Cancel timeline export"
                        : "Export timeline video"
                    }
                  >
                    <DockIcon
                      type={
                        timelineExporting || timelineExportQueued
                          ? "stop"
                          : "export"
                      }
                    />
                    <span>
                      {timelineExporting || timelineExportQueued
                        ? "Cancel Export"
                        : "Export"}
                    </span>
                  </button>
                  <label>
                    <span>Length</span>
                    <select
                      value={timelineLength}
                      onChange={(event) => {
                        const nextLength = Number(event.target.value);
                        setTimelineLength(nextLength);
                        setTimelinePlayhead((value) =>
                          Math.min(value, nextLength)
                        );
                      }}
                    >
                      {TIMELINE_LENGTH_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}s
                        </option>
                      ))}
                    </select>
                  </label>
                  <em>{timelinePlayhead.toFixed(1)}s</em>
                </div>
              </div>

              <div
                className="engine-timeline__body"
                onPointerDown={(event) => {
                  if (event.target.closest(".engine-timeline__clip")) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setTimelinePlayheadFromPointer(event);
                }}
                onPointerMove={(event) => {
                  if (event.buttons !== 1) return;
                  if (event.target.closest(".engine-timeline__clip")) return;
                  setTimelinePlayheadFromPointer(event);
                }}
              >
                <div className="engine-timeline__ruler-spacer" aria-hidden="true" />
                <div className="engine-timeline__ruler">
                  {Array.from({ length: timelineDuration + 1 }, (_, index) => (
                    <span
                      key={index}
                      style={{
                        left: getTimelinePercent(index),
                      }}
                    >
                      {index}s
                    </span>
                  ))}
                </div>
                <div className="engine-timeline__playhead-layer" aria-hidden="true">
                  <div
                    className="engine-timeline__playhead"
                    style={{
                      left: getTimelinePercent(timelinePlayhead),
                    }}
                  />
                </div>
                <div className="engine-timeline__tracks-scroll">
                  <div className="engine-timeline__track-labels">
                    {timelineTracks.map((track) => (
                      <div className="engine-timeline__track-label" key={track.id}>
                        <span>{track.kind}</span>
                        <strong>{track.label}</strong>
                      </div>
                    ))}
                  </div>
                  <div
                    className="engine-timeline__content"
                  >
                    <div className="engine-timeline__second-lines" aria-hidden="true">
                      {Array.from({ length: timelineDuration + 1 }, (_, index) => (
                        <i
                          key={index}
                          style={{
                            left: getTimelinePercent(index),
                          }}
                        />
                      ))}
                    </div>
                    {timelineTracks.map((track) => (
                      <div className="engine-timeline__track" key={track.id}>
                        {timelineRecordingProgress && (
                          <div
                            className="engine-timeline__record-progress"
                            style={{
                              left: getTimelinePercent(
                                timelineRecordingProgress.start
                              ),
                              width: `max(8px, ${getTimelineDurationPercent(
                                timelineRecordingProgress.duration
                              )})`,
                            }}
                          />
                        )}
                        {timelineClips
                          .filter((clip) => clip.trackId === track.id)
                          .map((clip) => (
                            <div
                              className={`engine-timeline__clip engine-timeline__clip--${clip.kind}`}
                              key={clip.id}
                              style={{
                                left: getTimelinePercent(clip.start ?? 0),
                                width: `max(42px, ${getTimelineDurationPercent(
                                  Math.min(
                                    clip.duration ?? 0.25,
                                    timelineDuration - (clip.start ?? 0)
                                  )
                                )})`,
                              }}
                              onPointerDown={(event) =>
                                beginTimelineClipDrag(event, clip)
                              }
                              onPointerMove={(event) =>
                                updateTimelineClipDrag(event, clip)
                              }
                              onPointerUp={(event) => endTimelineClipDrag(event, clip)}
                              onPointerCancel={(event) =>
                                endTimelineClipDrag(event, clip)
                              }
                            >
                              <span>{clip.label}</span>
                              <em>
                                {(clip.start ?? 0).toFixed(1)}s ·{" "}
                                {(clip.duration ?? 0).toFixed(1)}s
                              </em>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runCommand({
                                    type: "delete-timeline-clip",
                                    clipId: clip.id,
                                  });
                                }}
                                aria-label={`Delete ${clip.label}`}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="engine-scene-switcher" aria-label="Scene selector">
            <button
              type="button"
              onClick={() => switchSceneByIndex(activeSceneIndex - 1)}
              aria-label="Previous scene"
              disabled={sceneEntries.length <= 1}
            >
              <svg
                aria-hidden="true"
                className="engine-scene-switcher__chevron"
                viewBox="0 0 24 24"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <label>
              <span>Scene</span>
              <input
                aria-label="Scene number"
                min="1"
                max={Math.max(1, sceneEntries.length)}
                type="number"
                value={sceneJumpValue}
                onChange={(event) => setSceneJumpValue(event.target.value)}
                onBlur={commitSceneJump}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
              <em>/ {sceneEntries.length}</em>
            </label>
            <strong>{scene.name || "untitled scene"}</strong>
            <button
              type="button"
              onClick={() => switchSceneByIndex(activeSceneIndex + 1)}
              aria-label="Next scene"
              disabled={sceneEntries.length <= 1}
            >
              <svg
                aria-hidden="true"
                className="engine-scene-switcher__chevron"
                viewBox="0 0 24 24"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          <button
            className="engine-hide-button"
            type="button"
            onClick={() => {
              closePanels();
              setChromeHidden(true);
            }}
            aria-label="Hide controls"
          >
            <DockIcon type="eye-off" />
          </button>

          <div className="engine-left-tool-stack">
            <nav className="terrain-dock" aria-label="Engine controls">
              <button
                className="dock-button"
                type="button"
                disabled={isRuntimeMode || timelinePlaying || undoCount === 0}
                onClick={() => runCommand({ type: "undo" })}
                aria-label="Undo"
              >
                <span className="dock-button__icon">
                  <DockIcon type="undo" />
                </span>
                <span>Undo</span>
              </button>

              <button
                className="dock-button"
                type="button"
                disabled={isRuntimeMode || timelinePlaying || redoCount === 0}
                onClick={() => runCommand({ type: "redo" })}
                aria-label="Redo"
              >
                <span className="dock-button__icon">
                  <DockIcon type="redo" />
                </span>
                <span>Redo</span>
              </button>

              <button
                className={`dock-button ${assetPanelOpen ? "is-active" : ""}`}
                type="button"
                onClick={() => togglePanel("objects")}
                aria-label="Toggle object panel"
              >
                <span className="dock-button__icon">
                  <DockIcon type="object" />
                </span>
                <span>Obj</span>
              </button>

              <div className="terrain-dock__tool-group">
              <button
                className={`dock-button ${
                    editorInteractionEnabled && activeEditorTool === "select"
                      ? "is-active"
                      : ""
                  }`}
                type="button"
                  onClick={() => {
                    runCommand({ type: "set-editor-tool", tool: "select" });
                    setOpenPanel("project");
                  }}
                  aria-label="Toggle selection inspector"
                >
                  <span className="dock-button__icon">
                    <DockIcon type="select" />
                  </span>
                  <span>Select</span>
                </button>

              </div>

              <div className="terrain-dock__tool-group">
                <button
                  className={`dock-button ${brushPanelOpen ? "is-active" : ""}`}
                  type="button"
                  onClick={() => togglePanel("brush")}
                  aria-label="Toggle terrain brush"
                  disabled={!isBrushTerrain}
                >
                  <span className="dock-button__icon">
                    <DockIcon type="brush" />
                  </span>
                  <span>Brush</span>
                </button>

                {brushPanelOpen && isBrushTerrain && (
                  <div className="terrain-dock__secondary" aria-label="Sculpt tools">
                    {SCULPT_TOOLS.map((tool) => (
                      <button
                        className={`dock-button dock-button--sub ${
                          brushMode === tool.id ? "is-active" : ""
                        }`}
                        key={tool.id}
                        type="button"
                        onClick={() => {
                          setBrushMode(tool.id);
                          activateBrush({ brushMode: tool.id });
                        }}
                        title={tool.label}
                        aria-label={`Sculpt ${tool.label}`}
                      >
                        <span className="dock-button__icon">
                          <DockIcon type={tool.icon} />
                        </span>
                        <span>{tool.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </nav>
            <button
              className="engine-language-toggle"
              type="button"
              data-no-localize="true"
              onClick={() =>
                setUiLanguage((language) => (language === "en" ? "zh" : "en"))
              }
              aria-label={
                uiLanguage === "en"
                  ? "切换到中文界面"
                  : "Switch to English interface"
              }
              title={
                uiLanguage === "en"
                  ? "切换到中文界面"
                  : "Switch to English interface"
              }
            >
              <span className={uiLanguage === "zh" ? "is-active" : ""}>中</span>
              <i aria-hidden="true" />
              <span className={uiLanguage === "en" ? "is-active" : ""}>EN</span>
            </button>
          </div>
        </>
      )}

      {chromeHidden && (
        <button
          className="restore-button"
          type="button"
          onClick={() => setChromeHidden(false)}
          aria-label="Show terrain controls"
        >
          <DockIcon type="hide" />
        </button>
      )}
    </div>
  );

  return (
    <UiLanguageProvider value={uiLanguage}>
      {localizeUiTree(editorUi, uiLanguage)}
    </UiLanguageProvider>
  );
};
