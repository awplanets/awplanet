import * as THREE from "three";

export const DEFAULT_ANIMATION_SET = {
  idle: "/animations/uploaded/Standing%20Idle.fbx",
  walkForward: "/animations/uploaded/Standard%20Walk.fbx",
  walkBack: "/animations/uploaded/Standard%20Walk.fbx",
  walkLeft: "/animations/uploaded/Standard%20Walk.fbx",
  walkRight: "/animations/uploaded/Standard%20Walk.fbx",
  runForward: "/animations/uploaded/Running.fbx",
  runBack: "/animations/new-model/standing%20run%20back.fbx",
  runLeft: "/animations/new-model/standing%20run%20left.fbx",
  runRight: "/animations/new-model/standing%20run%20right.fbx",
  jump: "/animations/new-model/Jumping.fbx",
  runningJump: "/animations/new-model/running%20Jump.fbx",
  sitLaugh: "/animations/new-model/Sitting%20Laughing.fbx",
  dodgeBack: "/animations/new-model/Standing%20Dodge%20Backward.fbx",
  turnLeft: "/animations/new-model/standing%20turn%2090%20left.fbx",
  turnRight: "/animations/new-model/standing%20turn%2090%20right.fbx",
  runStop: "/animations/new-model/standing%20run%20forward%20stop.fbx",
};

export const ANIMATION_TIME_SCALE = Object.fromEntries(
  Object.keys(DEFAULT_ANIMATION_SET).map((key) => [key, 1])
);

export const DIRECTOR_POSE_PREFIX = "pose:";

export const DIRECTOR_POSE_RECIPES = {
  "stand-relaxed": [
    { bones: ["spine"], rotation: [-0.08, 0.02, -0.05] },
    { bones: ["leftarm"], rotation: [0.16, 0.02, 0.18] },
    { bones: ["rightarm"], rotation: [0.12, -0.02, -0.16] },
    { bones: ["leftupleg"], rotation: [0.03, 0.04, 0.08] },
    { bones: ["rightupleg"], rotation: [-0.02, -0.02, -0.05] },
  ],
  "stand-contrapposto": [
    { bones: ["spine"], rotation: [-0.05, 0.05, -0.16] },
    { bones: ["spine1", "spine2"], rotation: [0.03, -0.04, 0.12] },
    { bones: ["leftupleg"], rotation: [0.02, 0.1, 0.16] },
    { bones: ["rightupleg"], rotation: [-0.04, -0.04, -0.11] },
    { bones: ["leftarm"], rotation: [0.08, -0.06, 0.34] },
    { bones: ["rightarm"], rotation: [0.04, 0.04, -0.22] },
  ],
  "stand-alert": [
    { bones: ["spine", "spine1"], rotation: [0.08, 0, 0] },
    { bones: ["neck"], rotation: [0.06, 0, 0] },
    { bones: ["leftarm"], rotation: [-0.08, 0.02, 0.08] },
    { bones: ["rightarm"], rotation: [-0.08, -0.02, -0.08] },
    { bones: ["leftupleg"], rotation: [-0.03, 0, 0.04] },
    { bones: ["rightupleg"], rotation: [-0.03, 0, -0.04] },
  ],
  "stand-lean": [
    { bones: ["spine"], rotation: [-0.16, 0.08, -0.2] },
    { bones: ["spine1", "spine2"], rotation: [0.05, -0.04, 0.13] },
    { bones: ["leftarm"], rotation: [0.22, -0.1, 0.38] },
    { bones: ["rightarm"], rotation: [0.05, 0.08, -0.18] },
    { bones: ["leftupleg"], rotation: [0.1, 0.05, 0.1] },
  ],
  "stand-crossed-arms": [
    { bones: ["spine"], rotation: [-0.04, 0, 0.02] },
    { bones: ["leftarm"], rotation: [0.72, 0.18, 0.78] },
    { bones: ["rightarm"], rotation: [0.72, -0.18, -0.78] },
    { bones: ["leftforearm"], rotation: [0.34, -0.1, -1.18] },
    { bones: ["rightforearm"], rotation: [0.34, 0.1, 1.18] },
  ],
  "stand-hands-hips": [
    { bones: ["spine"], rotation: [0.02, 0, -0.04] },
    { bones: ["leftarm"], rotation: [0.48, -0.1, 0.68] },
    { bones: ["rightarm"], rotation: [0.48, 0.1, -0.68] },
    { bones: ["leftforearm"], rotation: [0.16, -0.2, -0.92] },
    { bones: ["rightforearm"], rotation: [0.16, 0.2, 0.92] },
  ],
  "sit-low": [
    { bones: ["spine"], rotation: [-0.12, 0, 0] },
    { bones: ["leftupleg"], rotation: [-1.18, 0.06, 0.12] },
    { bones: ["rightupleg"], rotation: [-1.18, -0.06, -0.12] },
    { bones: ["leftleg"], rotation: [1.18, 0, 0] },
    { bones: ["rightleg"], rotation: [1.18, 0, 0] },
    { bones: ["leftarm"], rotation: [0.32, 0.04, 0.18] },
    { bones: ["rightarm"], rotation: [0.32, -0.04, -0.18] },
  ],
  "sit-side": [
    { bones: ["spine"], rotation: [-0.08, 0.14, -0.1] },
    { bones: ["leftupleg"], rotation: [-1, 0.2, 0.46] },
    { bones: ["rightupleg"], rotation: [-1.18, -0.26, 0.18] },
    { bones: ["leftleg"], rotation: [1.02, 0, -0.12] },
    { bones: ["rightleg"], rotation: [1.08, 0, 0.18] },
  ],
  crouch: [
    { bones: ["spine"], rotation: [-0.32, 0, 0] },
    { bones: ["leftupleg"], rotation: [-0.92, 0.04, 0.12] },
    { bones: ["rightupleg"], rotation: [-0.92, -0.04, -0.12] },
    { bones: ["leftleg"], rotation: [1.32, 0, 0] },
    { bones: ["rightleg"], rotation: [1.32, 0, 0] },
    { bones: ["leftarm"], rotation: [0.55, -0.08, 0.25] },
    { bones: ["rightarm"], rotation: [0.55, 0.08, -0.25] },
  ],
  kneel: [
    { bones: ["spine"], rotation: [-0.18, 0, 0] },
    { bones: ["leftupleg"], rotation: [-1.22, 0.06, 0.12] },
    { bones: ["leftleg"], rotation: [1.52, 0, 0] },
    { bones: ["rightupleg"], rotation: [-0.35, -0.08, -0.12] },
    { bones: ["rightleg"], rotation: [0.72, 0, 0] },
    { bones: ["leftarm"], rotation: [0.35, -0.05, 0.18] },
    { bones: ["rightarm"], rotation: [0.35, 0.05, -0.18] },
  ],
  "kneel-both": [
    { bones: ["spine"], rotation: [-0.1, 0, 0] },
    { bones: ["leftupleg"], rotation: [-1.28, 0.08, 0.12] },
    { bones: ["rightupleg"], rotation: [-1.28, -0.08, -0.12] },
    { bones: ["leftleg"], rotation: [1.48, 0, 0] },
    { bones: ["rightleg"], rotation: [1.48, 0, 0] },
    { bones: ["leftarm"], rotation: [0.22, -0.04, 0.14] },
    { bones: ["rightarm"], rotation: [0.22, 0.04, -0.14] },
  ],
  "lie-prone": [
    { bones: ["spine"], rotation: [-1.32, 0, 0] },
    { bones: ["spine1", "spine2"], rotation: [0.1, 0, 0] },
    { bones: ["leftupleg"], rotation: [0.12, 0.04, 0.1] },
    { bones: ["rightupleg"], rotation: [0.12, -0.04, -0.1] },
    { bones: ["leftarm"], rotation: [0.92, -0.1, 0.38] },
    { bones: ["rightarm"], rotation: [0.92, 0.1, -0.38] },
  ],
  "lie-back": [
    { bones: ["spine"], rotation: [1.28, 0, 0] },
    { bones: ["leftupleg"], rotation: [-0.16, 0.08, 0.12] },
    { bones: ["rightupleg"], rotation: [-0.16, -0.08, -0.12] },
    { bones: ["leftleg"], rotation: [0.42, 0, 0] },
    { bones: ["rightleg"], rotation: [0.42, 0, 0] },
    { bones: ["leftarm"], rotation: [0.7, -0.2, 0.62] },
    { bones: ["rightarm"], rotation: [0.7, 0.2, -0.62] },
  ],
  "point-forward": [
    { bones: ["spine"], rotation: [0.03, -0.1, 0] },
    { bones: ["rightarm"], rotation: [-0.12, -0.52, -1.18] },
    { bones: ["rightforearm"], rotation: [-0.08, -0.12, -0.28] },
    { bones: ["leftarm"], rotation: [0.18, 0.06, 0.18] },
  ],
  "reach-up": [
    { bones: ["spine"], rotation: [0.08, 0, 0.06] },
    { bones: ["rightarm"], rotation: [-1.42, -0.14, -0.36] },
    { bones: ["rightforearm"], rotation: [-0.18, 0.06, -0.08] },
    { bones: ["leftarm"], rotation: [0.2, 0.02, 0.22] },
  ],
  "guard-ready": [
    { bones: ["spine"], rotation: [-0.16, 0, 0] },
    { bones: ["leftarm"], rotation: [0.76, -0.08, 0.42] },
    { bones: ["rightarm"], rotation: [0.76, 0.08, -0.42] },
    { bones: ["leftforearm"], rotation: [0.42, -0.18, -0.76] },
    { bones: ["rightforearm"], rotation: [0.42, 0.18, 0.76] },
    { bones: ["leftupleg"], rotation: [-0.12, 0.06, 0.1] },
    { bones: ["rightupleg"], rotation: [-0.12, -0.06, -0.1] },
  ],
  surrender: [
    { bones: ["spine"], rotation: [0.04, 0, 0] },
    { bones: ["leftarm"], rotation: [-1.28, 0.1, 0.46] },
    { bones: ["rightarm"], rotation: [-1.28, -0.1, -0.46] },
    { bones: ["leftforearm"], rotation: [-0.24, 0.05, -0.22] },
    { bones: ["rightforearm"], rotation: [-0.24, -0.05, 0.22] },
  ],
  "hands-head": [
    { bones: ["spine"], rotation: [-0.08, 0, 0] },
    { bones: ["leftarm"], rotation: [-0.84, 0.18, 0.82] },
    { bones: ["rightarm"], rotation: [-0.84, -0.18, -0.82] },
    { bones: ["leftforearm"], rotation: [-0.54, 0, -1.12] },
    { bones: ["rightforearm"], rotation: [-0.54, 0, 1.12] },
  ],
  "talk-open": [
    { bones: ["spine"], rotation: [0.02, 0.06, -0.04] },
    { bones: ["leftarm"], rotation: [0.1, -0.16, 0.58] },
    { bones: ["rightarm"], rotation: [0.1, 0.16, -0.58] },
    { bones: ["leftforearm"], rotation: [0.34, -0.12, -0.34] },
    { bones: ["rightforearm"], rotation: [0.34, 0.12, 0.34] },
  ],
};

export const normalizeBoneName = (name) =>
  name.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();

export const getDirectorPoseId = (state) =>
  typeof state === "string" && state.startsWith(DIRECTOR_POSE_PREFIX)
    ? state.slice(DIRECTOR_POSE_PREFIX.length)
    : null;

const findPoseBone = (model, selectors) => {
  let matchedBone = null;
  model.traverse((child) => {
    if (matchedBone || !child.isBone) return;
    const normalizedName = normalizeBoneName(child.name);
    if (selectors.some((selector) => normalizedName.includes(selector))) {
      matchedBone = child;
    }
  });
  return matchedBone;
};

export const applyDirectorPose = (model, state) => {
  const poseId = getDirectorPoseId(state);
  const recipe = DIRECTOR_POSE_RECIPES[poseId];
  if (!recipe) return;

  recipe.forEach(({ bones, rotation }) => {
    const bone = findPoseBone(model, bones);
    if (!bone) return;
    bone.rotation.x += rotation[0];
    bone.rotation.y += rotation[1];
    bone.rotation.z += rotation[2];
  });
};

export const retargetClipToScene = (clip, name, sceneNameMap) => {
  const tracks = clip.tracks
    .map((track) => {
      const separatorIndex = track.name.indexOf(".");
      if (separatorIndex === -1) return null;

      const sourceBoneName = track.name.slice(0, separatorIndex);
      const propertyName = track.name.slice(separatorIndex + 1);
      const targetBoneName = sceneNameMap.get(normalizeBoneName(sourceBoneName));

      if (!targetBoneName || propertyName === "scale" || propertyName === "position") {
        return null;
      }

      const retargetedTrack = track.clone();
      retargetedTrack.name = `${targetBoneName}.${propertyName}`;
      return retargetedTrack;
    })
    .filter(Boolean);

  return new THREE.AnimationClip(name, clip.duration, tracks).optimize();
};
