export const runtimeCameraState = {
  yaw: Math.PI,
  alignHero: false,
  version: 0,
  yawVersion: 0,
  pose: {
    position: [0, 20, 30],
    rotation: [0, 0, 0],
    target: [0, 7, 0],
    fov: 44,
    aspect: 16 / 9,
    viewport: [1920, 1080],
    updatedAt: 0,
  },
  phonePilotStartPose: null,
  pilotTake: {
    recording: false,
    startedAt: 0,
    samples: [],
    lastSampleAt: -1,
  },
};

let lastPhonePilotCameraPostAt = 0;
let phonePilotCameraPostPending = false;
const PHONE_PILOT_CAMERA_POST_INTERVAL_MS = 16;

const cloneCameraPose = (pose) => ({
  position: [...pose.position],
  rotation: [...pose.rotation],
  target: [...pose.target],
  fov: pose.fov,
  aspect: pose.aspect,
  viewport: Array.isArray(pose.viewport) ? [...pose.viewport] : undefined,
  updatedAt: pose.updatedAt,
});

const shouldPostPhonePilotCameraPose = () =>
  typeof window !== "undefined" && window.location.pathname !== "/phone-pilot";

const normalizePoseArray = (value, length, fallback) => {
  if (!Array.isArray(value) || value.length < length) return fallback;
  const next = value.slice(0, length).map(Number);
  return next.every(Number.isFinite) ? next : fallback;
};

const postPhonePilotCameraPose = (pose) => {
  if (!shouldPostPhonePilotCameraPose()) return;
  const now = performance.now();
  if (
    phonePilotCameraPostPending ||
    now - lastPhonePilotCameraPostAt < PHONE_PILOT_CAMERA_POST_INTERVAL_MS
  ) {
    return;
  }

  lastPhonePilotCameraPostAt = now;
  phonePilotCameraPostPending = true;
  fetch("/__phone-pilot/camera", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cameraPose: pose,
      clientTime: Date.now(),
      source: "desktop",
    }),
  })
    .catch(() => {
      // Phone Pilot may be disconnected; local camera state remains valid.
    })
    .finally(() => {
      phonePilotCameraPostPending = false;
    });
};

export const setRuntimeCameraPose = ({
  position,
  rotation,
  target,
  fov,
  aspect,
  viewport,
}, { postToPhone = true } = {}) => {
  const nextPosition = normalizePoseArray(position, 3, runtimeCameraState.pose.position);
  const nextRotation = normalizePoseArray(rotation, 3, runtimeCameraState.pose.rotation);
  const nextTarget = normalizePoseArray(target, 3, runtimeCameraState.pose.target);
  runtimeCameraState.pose = {
    position: nextPosition.map((value) => Number(value.toFixed(4))),
    rotation: nextRotation.map((value) => Number(value.toFixed(5))),
    target: nextTarget.map((value) => Number(value.toFixed(4))),
    fov: Number((Number.isFinite(Number(fov)) ? Number(fov) : runtimeCameraState.pose.fov).toFixed(3)),
    aspect: Number((Number.isFinite(aspect) ? aspect : 16 / 9).toFixed(5)),
    viewport: Array.isArray(viewport)
      ? viewport.slice(0, 2).map((value) => Math.max(1, Math.round(Number(value) || 1)))
      : [1920, 1080],
    updatedAt: performance.now(),
  };
  runtimeCameraState.version += 1;
  if (postToPhone) {
    postPhonePilotCameraPose(runtimeCameraState.pose);
  }
  return runtimeCameraState.pose;
};

export const setRuntimePhonePilotStartPose = (pose) => {
  const sourcePose = pose ?? runtimeCameraState.pose;
  const nextPose = {
    position: normalizePoseArray(
      sourcePose.position,
      3,
      runtimeCameraState.pose.position
    ),
    rotation: normalizePoseArray(
      sourcePose.rotation,
      3,
      runtimeCameraState.pose.rotation
    ),
    target: normalizePoseArray(sourcePose.target, 3, runtimeCameraState.pose.target),
    fov: Number.isFinite(Number(sourcePose.fov))
      ? Number(sourcePose.fov)
      : runtimeCameraState.pose.fov,
    aspect: Number.isFinite(Number(sourcePose.aspect))
      ? Number(sourcePose.aspect)
      : runtimeCameraState.pose.aspect,
    viewport: normalizePoseArray(
      sourcePose.viewport,
      2,
      runtimeCameraState.pose.viewport
    ),
    updatedAt: Number.isFinite(Number(sourcePose.updatedAt))
      ? Number(sourcePose.updatedAt)
      : performance.now(),
  };
  runtimeCameraState.phonePilotStartPose = cloneCameraPose(nextPose);
  runtimeCameraState.version += 1;
  return runtimeCameraState.phonePilotStartPose;
};

export const captureRuntimePhonePilotStartPose = () =>
  setRuntimePhonePilotStartPose(runtimeCameraState.pose);

export const setRuntimeCameraYaw = (yaw, { alignHero = false } = {}) => {
  runtimeCameraState.yaw = yaw;
  runtimeCameraState.alignHero = alignHero;
  runtimeCameraState.yawVersion += 1;
};

export const startRuntimePilotTake = () => {
  runtimeCameraState.pilotTake = {
    recording: true,
    startedAt: performance.now(),
    samples: [],
    lastSampleAt: -1,
  };
};

export const pushRuntimePilotTakeSample = ({ position, rotation, fov }) => {
  const take = runtimeCameraState.pilotTake;
  if (!take.recording) return;

  const time = (performance.now() - take.startedAt) / 1000;
  if (take.lastSampleAt >= 0 && time - take.lastSampleAt < 1 / 60) return;
  take.lastSampleAt = time;
  take.samples.push({
    time: Number(time.toFixed(4)),
    position: position.map((value) => Number(value.toFixed(4))),
    rotation: rotation.map((value) => Number(value.toFixed(5))),
    fov: Number(fov.toFixed(3)),
  });
};

export const stopRuntimePilotTake = () => {
  const take = runtimeCameraState.pilotTake;
  runtimeCameraState.pilotTake = {
    ...take,
    recording: false,
  };
  return {
    duration:
      take.startedAt > 0
        ? Number(((performance.now() - take.startedAt) / 1000).toFixed(3))
        : 0,
    sampleRate: 60,
    samples: [...take.samples],
  };
};
