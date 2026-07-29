export const DIRECTOR_POSE_PREFIX = "pose:";

export const CHARACTER_MOTION_STATES = new Set(["walkForward", "runForward"]);

export const STATIC_POSE_DEFINITIONS = {
  idle: {
    id: "idle",
    label: "Stand",
    detail: "Neutral standing still",
    clip: "idle",
    timeRatio: 0.08,
  },
  [`${DIRECTOR_POSE_PREFIX}stand-relaxed`]: {
    id: `${DIRECTOR_POSE_PREFIX}stand-relaxed`,
    label: "Relaxed",
    detail: "Quiet standing pose",
    clip: "idle",
    timeRatio: 0.42,
  },
  [`${DIRECTOR_POSE_PREFIX}sit`]: {
    id: `${DIRECTOR_POSE_PREFIX}sit`,
    label: "Sit",
    detail: "Seated static pose",
    clip: "sitLaugh",
    timeRatio: 0.34,
  },
  [`${DIRECTOR_POSE_PREFIX}sit-lean`]: {
    id: `${DIRECTOR_POSE_PREFIX}sit-lean`,
    label: "Sit Lean",
    detail: "Seated candid frame",
    clip: "sitLaugh",
    timeRatio: 0.62,
  },
  [`${DIRECTOR_POSE_PREFIX}crouch`]: {
    id: `${DIRECTOR_POSE_PREFIX}crouch`,
    label: "Crouch",
    detail: "Low body setup pose",
    clip: "jump",
    timeRatio: 0.18,
  },
  [`${DIRECTOR_POSE_PREFIX}jump-freeze`]: {
    id: `${DIRECTOR_POSE_PREFIX}jump-freeze`,
    label: "Jump Freeze",
    detail: "Mid-air still pose",
    clip: "jump",
    timeRatio: 0.46,
  },
  [`${DIRECTOR_POSE_PREFIX}landing`]: {
    id: `${DIRECTOR_POSE_PREFIX}landing`,
    label: "Landing",
    detail: "Grounded landing pose",
    clip: "jump",
    timeRatio: 0.78,
  },
  [`${DIRECTOR_POSE_PREFIX}dodge`]: {
    id: `${DIRECTOR_POSE_PREFIX}dodge`,
    label: "Dodge",
    detail: "Backward dodge still",
    clip: "dodgeBack",
    timeRatio: 0.48,
  },
  [`${DIRECTOR_POSE_PREFIX}turn-profile`]: {
    id: `${DIRECTOR_POSE_PREFIX}turn-profile`,
    label: "Profile",
    detail: "Turned body still",
    clip: "turnLeft",
    timeRatio: 0.52,
  },
  [`${DIRECTOR_POSE_PREFIX}stop`]: {
    id: `${DIRECTOR_POSE_PREFIX}stop`,
    label: "Stop",
    detail: "Running stop still",
    clip: "runStop",
    timeRatio: 0.68,
  },
};

export const STATIC_POSE_ACTIONS = Object.values(STATIC_POSE_DEFINITIONS);

export const getDirectorPoseId = (state) =>
  typeof state === "string" && state.startsWith(DIRECTOR_POSE_PREFIX)
    ? state.slice(DIRECTOR_POSE_PREFIX.length)
    : null;

export const getStaticPoseDefinition = (state) => {
  if (STATIC_POSE_DEFINITIONS[state]) return STATIC_POSE_DEFINITIONS[state];
  if (state && !CHARACTER_MOTION_STATES.has(state)) {
    return {
      id: state,
      label: state,
      detail: "Static source frame",
      clip: state,
      timeRatio: 0.5,
    };
  }
  return null;
};

export const getAnimationClipKeyForState = (state) =>
  getStaticPoseDefinition(state)?.clip ?? state;
