export const BONE_RIG_JOINTS = [
  { id: "head", label: "Head", selectors: ["head"] },
  { id: "neck", label: "Neck", selectors: ["neck"] },
  { id: "chest", label: "Chest", selectors: ["spine2", "chest", "upperchest"] },
  { id: "spine", label: "Spine", selectors: ["spine1", "spine"] },
  { id: "hips", label: "Hips", selectors: ["hips", "pelvis"] },
  { id: "leftUpperArm", label: "L Arm", selectors: ["leftarm", "leftupperarm"] },
  { id: "leftForeArm", label: "L Elbow", selectors: ["leftforearm", "leftlowerarm"] },
  { id: "leftHand", label: "L Hand", selectors: ["lefthand"] },
  { id: "rightUpperArm", label: "R Arm", selectors: ["rightarm", "rightupperarm"] },
  { id: "rightForeArm", label: "R Elbow", selectors: ["rightforearm", "rightlowerarm"] },
  { id: "rightHand", label: "R Hand", selectors: ["righthand"] },
  { id: "leftUpLeg", label: "L Thigh", selectors: ["leftupleg", "leftupperleg"] },
  { id: "leftLeg", label: "L Knee", selectors: ["leftleg", "leftlowerleg"] },
  { id: "leftFoot", label: "L Foot", selectors: ["leftfoot"] },
  { id: "rightUpLeg", label: "R Thigh", selectors: ["rightupleg", "rightupperleg"] },
  { id: "rightLeg", label: "R Knee", selectors: ["rightleg", "rightlowerleg"] },
  { id: "rightFoot", label: "R Foot", selectors: ["rightfoot"] },
];

export const BONE_RIG_LINKS = [
  ["hips", "spine"],
  ["spine", "chest"],
  ["chest", "neck"],
  ["neck", "head"],
  ["chest", "leftUpperArm"],
  ["leftUpperArm", "leftForeArm"],
  ["leftForeArm", "leftHand"],
  ["chest", "rightUpperArm"],
  ["rightUpperArm", "rightForeArm"],
  ["rightForeArm", "rightHand"],
  ["hips", "leftUpLeg"],
  ["leftUpLeg", "leftLeg"],
  ["leftLeg", "leftFoot"],
  ["hips", "rightUpLeg"],
  ["rightUpLeg", "rightLeg"],
  ["rightLeg", "rightFoot"],
];

export const BONE_RIG_LINKED_JOINTS = BONE_RIG_LINKS.reduce((map, [a, b]) => {
  map[a] = [...(map[a] ?? []), b];
  map[b] = [...(map[b] ?? []), a];
  return map;
}, {});

export const CUSTOM_POSE_PREFIX = "customPose:";

export const isCustomPoseState = (state) =>
  typeof state === "string" && state.startsWith(CUSTOM_POSE_PREFIX);

export const getCustomPoseId = (state) =>
  isCustomPoseState(state) ? state.slice(CUSTOM_POSE_PREFIX.length) : null;

export const normalizeRigBoneName = (name) =>
  String(name ?? "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();

export const resolveRigJointBone = (model, jointId) => {
  const joint = BONE_RIG_JOINTS.find((candidate) => candidate.id === jointId);
  if (!joint || !model) return null;

  let bestBone = null;
  let bestScore = -1;
  let bestNameLength = Infinity;
  let bestStructureScore = -1;
  model.traverse((child) => {
    if (!child.isBone) return;
    const normalized = normalizeRigBoneName(child.name);
    const score = joint.selectors.reduce((highestScore, selector, index) => {
      const specificity = selector.length * 0.01;
      const selectorPriority = (joint.selectors.length - index) * 0.001;
      if (normalized === selector) {
        return Math.max(highestScore, 100 + specificity + selectorPriority);
      }
      if (normalized.endsWith(selector)) {
        return Math.max(highestScore, 70 + specificity + selectorPriority);
      }
      if (normalized.includes(selector)) {
        return Math.max(highestScore, 10 + specificity + selectorPriority);
      }
      return highestScore;
    }, -1);

    if (score < 0) return;
    const structureScore = child.children.filter((candidate) => candidate.isBone)
      .length;
    if (
      score > bestScore ||
      (score === bestScore && structureScore > bestStructureScore) ||
      (score === bestScore &&
        structureScore === bestStructureScore &&
        normalized.length < bestNameLength)
    ) {
      bestBone = child;
      bestScore = score;
      bestNameLength = normalized.length;
      bestStructureScore = structureScore;
    }
  });

  return bestBone;
};
