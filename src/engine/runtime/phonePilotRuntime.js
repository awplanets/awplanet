export const phonePilotRuntimeState = {
  enabled: false,
  connected: false,
  frame: null,
  mirrorPose: null,
  mirrorUpdatedAt: 0,
  settings: {
    phonePilotMoveScale: null,
  },
  ageMs: null,
  updatedAt: 0,
  version: 0,
  recenterVersion: 0,
};

const MAX_MIRROR_CAMERA_DISTANCE = 1200;
const MAX_MIRROR_CAMERA_STEP = 180;

const normalizeNumberArray = (value, length) => {
  if (!Array.isArray(value) || value.length < length) return null;
  const next = value.slice(0, length).map(Number);
  return next.every(Number.isFinite) ? next : null;
};

const distanceBetween = (a, b) => {
  if (!a || !b) return 0;
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dy, dz);
};

const normalizeMirrorPose = (pose) => {
  if (!pose) return null;
  const position = normalizeNumberArray(pose.position, 3);
  if (!position) return null;
  if (Math.hypot(position[0], position[1], position[2]) > MAX_MIRROR_CAMERA_DISTANCE) {
    return null;
  }

  const previousPosition = phonePilotRuntimeState.mirrorPose?.position;
  if (
    previousPosition &&
    distanceBetween(position, previousPosition) > MAX_MIRROR_CAMERA_STEP
  ) {
    return null;
  }

  const rotation = normalizeNumberArray(pose.rotation, 3);
  const target = normalizeNumberArray(pose.target, 3);
  if (!rotation && !target) return null;

  const fov = Number(pose.fov);
  const aspect = Number(pose.aspect);
  const viewport = normalizeNumberArray(pose.viewport, 2);
  return {
    position,
    ...(rotation ? { rotation } : {}),
    ...(target ? { target } : {}),
    fov: Number.isFinite(fov) ? Math.min(82, Math.max(22, fov)) : 45,
    aspect: Number.isFinite(aspect) && aspect > 0.25 && aspect < 5 ? aspect : 16 / 9,
    ...(viewport
      ? {
          viewport: [
            Math.max(1, Math.round(viewport[0])),
            Math.max(1, Math.round(viewport[1])),
          ],
        }
      : {}),
    updatedAt: Number.isFinite(Number(pose.updatedAt)) ? Number(pose.updatedAt) : 0,
  };
};

export const setRuntimePhonePilotEnabled = (enabled) => {
  phonePilotRuntimeState.enabled = Boolean(enabled);
  phonePilotRuntimeState.version += 1;
};

export const resetRuntimePhonePilotState = () => {
  phonePilotRuntimeState.enabled = false;
  phonePilotRuntimeState.connected = false;
  phonePilotRuntimeState.frame = null;
  phonePilotRuntimeState.mirrorPose = null;
  phonePilotRuntimeState.mirrorUpdatedAt = 0;
  phonePilotRuntimeState.settings = {
    phonePilotMoveScale: null,
  };
  phonePilotRuntimeState.ageMs = null;
  phonePilotRuntimeState.updatedAt = 0;
  phonePilotRuntimeState.version += 1;
};

export const setRuntimePhonePilotFrame = ({
  connected = false,
  frame = null,
  ageMs = null,
  updatedAt = 0,
} = {}) => {
  phonePilotRuntimeState.connected = Boolean(connected);
  phonePilotRuntimeState.frame = frame;
  phonePilotRuntimeState.ageMs = ageMs;
  phonePilotRuntimeState.updatedAt = updatedAt;
  phonePilotRuntimeState.version += 1;
};

export const setRuntimePhonePilotMirrorPose = ({
  pose = null,
  updatedAt = 0,
} = {}) => {
  const nextPose = normalizeMirrorPose(pose);
  if (pose && !nextPose) return;
  phonePilotRuntimeState.mirrorPose = nextPose;
  phonePilotRuntimeState.mirrorUpdatedAt = updatedAt;
  phonePilotRuntimeState.version += 1;
};

export const setRuntimePhonePilotSettings = ({
  phonePilotMoveScale = phonePilotRuntimeState.settings.phonePilotMoveScale,
} = {}) => {
  phonePilotRuntimeState.settings = {
    ...phonePilotRuntimeState.settings,
    phonePilotMoveScale: Number.isFinite(phonePilotMoveScale)
      ? phonePilotMoveScale
      : null,
  };
  phonePilotRuntimeState.version += 1;
};

export const recenterRuntimePhonePilot = () => {
  phonePilotRuntimeState.recenterVersion += 1;
  phonePilotRuntimeState.version += 1;
};
