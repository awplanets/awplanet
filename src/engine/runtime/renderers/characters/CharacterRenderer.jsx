/* eslint-disable react/prop-types */
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";

import { useEngine } from "../../../core/useEngine";
import { importCharacterFbxAsset } from "../../../layers/assets/importers/characterImporter";
import { getActiveScene } from "../../../scene/createInitialScene";
import {
  isRuntimeTimelineSkeletonCaptureEnabled,
  setRuntimeCharacterTimelinePose,
} from "../../runtimeTimelineState";
import { SelectionHighlight } from "../props/SelectionHighlight";
import {
  BONE_RIG_JOINTS,
  BONE_RIG_LINKED_JOINTS,
  BONE_RIG_LINKS,
  getCustomPoseId,
  resolveRigJointBone,
} from "./characterRig";
import {
  CHARACTER_MOTION_STATES,
  getAnimationClipKeyForState,
  getDirectorPoseId,
  getStaticPoseDefinition,
} from "./characterStaticPoses";
import {
  applyTimelineSkeletonPose,
  captureTimelineSkeletonPose,
} from "./timelineSkeletonPose";

const CHARACTER_TARGET_HEIGHT = 6.8;
const MAX_ANIMATION_DELTA = 1 / 30;
const BONE_MOVE_WORLD_SCALE = 0.72;
const BONE_IK_ITERATIONS = 6;
const SHOW_BONE_ROTATION_HANDLES = true;
const BONE_ROTATION_LIMIT = Math.PI * 0.62;
const BONE_ROTATION_DRAG_SCALE = 0.00235;

const DEFAULT_ANIMATION_SET = {
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

const ANIMATION_KEYS = Object.keys(DEFAULT_ANIMATION_SET);

const ANIMATION_TIME_SCALE = {
  idle: 1,
  walkForward: 1,
  walkBack: 1,
  walkLeft: 1,
  walkRight: 1,
  runForward: 1.18,
  runBack: 1.18,
  runLeft: 1.18,
  runRight: 1.18,
  jump: 1,
  runningJump: 1,
  sitLaugh: 1,
  dodgeBack: 1,
  turnLeft: 1,
  turnRight: 1,
  runStop: 1,
};

const normalizeBoneName = (name) =>
  name.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();

const createSceneNameMap = (scene) => {
  const candidatesByName = new Map();
  scene.traverse((child) => {
    if (!child.isBone || !child.name) return;
    const key = normalizeBoneName(child.name);
    const boneChildren = child.children.filter((candidate) => candidate.isBone);
    const distinctChildren = boneChildren.filter(
      (candidate) => candidate.name !== child.name
    ).length;
    const duplicateSkinBone =
      child.parent?.isBone && child.parent.name === child.name;
    const score =
      distinctChildren * 100 + boneChildren.length - (duplicateSkinBone ? 20 : 0);
    const candidate = { id: child.uuid, name: child.name, score };
    const current = candidatesByName.get(key);
    if (!current || candidate.score > current.score) {
      candidatesByName.set(key, candidate);
    }
  });
  return candidatesByName;
};

const retargetClipToScene = (clip, name, sceneNameMap) => {
  const tracks = clip.tracks
    .map((track) => {
      const separatorIndex = track.name.indexOf(".");
      if (separatorIndex === -1) return null;

      const sourceBoneName = track.name.slice(0, separatorIndex);
      const propertyName = track.name.slice(separatorIndex + 1);
      const targetBone = sceneNameMap.get(normalizeBoneName(sourceBoneName));

      if (!targetBone || propertyName === "scale") return null;

      const retargetedTrack = track.clone();
      // This character FBX contains paired skeletons with identical names:
      // the visible mesh is bound to surface bones parented under structural
      // joints. Binding animation by name can select a different duplicate
      // from the rig editor. UUID bindings make animation, rig edits and
      // timeline playback address the same structural joint.
      retargetedTrack.name = `${targetBone.id}.${propertyName}`;
      if (propertyName === "position") {
        const normalizedTargetBone = normalizeBoneName(targetBone.name);
        const keepsBodyHeight =
          normalizedTargetBone.includes("hips") ||
          normalizedTargetBone.includes("pelvis") ||
          normalizedTargetBone.includes("root");
        if (!keepsBodyHeight) return null;
        // Runtime movement owns X/Z. The source hip Y remains animated so walk
        // and run keep their original crouch, weight shift and foot contact.
        for (let index = 0; index < retargetedTrack.values.length; index += 3) {
          retargetedTrack.values[index] = track.values[0] ?? 0;
          retargetedTrack.values[index + 2] = track.values[2] ?? 0;
        }
      }
      return retargetedTrack;
    })
    .filter(Boolean);

  return new THREE.AnimationClip(name, clip.duration, tracks).optimize();
};

const createNamedClip = (fbx, name, sceneNameMap) => {
  const clip = fbx.animations?.[0];
  if (!clip) return null;
  return retargetClipToScene(clip, name, sceneNameMap);
};

const getAnimationEntries = (animationSet = DEFAULT_ANIMATION_SET) => {
  const mergedSet = {
    ...DEFAULT_ANIMATION_SET,
    ...animationSet,
    walkForward: animationSet.walkForward ?? animationSet.walk,
    runForward: animationSet.runForward ?? animationSet.run,
  };

  return ANIMATION_KEYS.map((key) => [key, mergedSet[key]]).filter(([, url]) =>
    Boolean(url)
  );
};

const getMobileAnimationEntries = (animationSet, locomotionState) => {
  const entries = getAnimationEntries(animationSet);
  const currentState = normalizeLocomotionState(locomotionState);
  const wantedKeys = new Set(["idle"]);
  wantedKeys.add(getAnimationClipKeyForState(currentState));
  const filtered = entries.filter(([key]) => wantedKeys.has(key));
  return filtered.length > 0 ? filtered : entries.slice(0, 1);
};

const normalizeLocomotionState = (state) => {
  if (state === "walk") return "walkForward";
  if (state === "run") return "runForward";
  if (getDirectorPoseId(state)) return state;
  if (getCustomPoseId(state)) return "idle";
  return state ?? "idle";
};

const createBoneRotationSnapshot = (model) => {
  const snapshot = {
    __boneRotationSnapshot: true,
    entries: [],
  };
  model.traverse((child) => {
    if (!child.isBone) return;
    snapshot.entries.push({
      uuid: child.uuid,
      rotation: child.rotation.toArray().slice(0, 3),
    });
  });
  return snapshot;
};

const applyBonePose = (model, pose = {}) => {
  if (!model || !pose) return;
  if (pose.__boneRotationSnapshot && Array.isArray(pose.entries)) {
    pose.entries.forEach((entry) => {
      const bone = model.getObjectByProperty("uuid", entry.uuid);
      if (!bone?.isBone || !Array.isArray(entry.rotation)) return;
      bone.rotation.set(
        entry.rotation[0] ?? 0,
        entry.rotation[1] ?? 0,
        entry.rotation[2] ?? 0
      );
    });
    return;
  }
  model.traverse((child) => {
    if (!child.isBone) return;
    const rotation = pose[child.name];
    if (!Array.isArray(rotation) || rotation.length < 3) return;
    child.rotation.set(rotation[0], rotation[1], rotation[2]);
  });
};

const coreBoneQuaternion = new THREE.Quaternion();
const coreBoneEuler = new THREE.Euler();
const identityBoneQuaternion = new THREE.Quaternion();
const unclampedBoneQuaternion = new THREE.Quaternion();

const resolveCanonicalRigBoneByKey = (model, boneKey) => {
  if (!model || !boneKey) return null;
  const uuidBone = model.getObjectByProperty("uuid", boneKey);
  if (uuidBone?.isBone) return uuidBone;

  let bestBone = null;
  let bestScore = -Infinity;
  model.traverse((child) => {
    if (!child.isBone || child.name !== boneKey) return;
    const boneChildren = child.children.filter((candidate) => candidate.isBone);
    const distinctChildren = boneChildren.filter(
      (candidate) => candidate.name !== child.name
    ).length;
    const duplicateParentPenalty =
      child.parent?.isBone && child.parent.name === child.name ? 20 : 0;
    const score = distinctChildren * 100 + boneChildren.length - duplicateParentPenalty;
    if (score > bestScore) {
      bestBone = child;
      bestScore = score;
    }
  });
  return bestBone;
};

const clampBoneRotationDelta = (quaternion) => {
  const angle = identityBoneQuaternion.angleTo(quaternion);
  if (angle <= BONE_ROTATION_LIMIT) return quaternion;
  unclampedBoneQuaternion.copy(quaternion);
  quaternion
    .copy(identityBoneQuaternion)
    .slerp(
      unclampedBoneQuaternion,
      BONE_ROTATION_LIMIT / Math.max(angle, 0.0001)
    );
  return quaternion.normalize();
};

const applyCoreBoneRotationOverrides = (model, overrides = {}) => {
  if (!model || !overrides) return;
  const resolvedOverrides = new Map();
  Object.entries(overrides).forEach(([boneKey, override]) => {
    const bone = resolveCanonicalRigBoneByKey(model, boneKey);
    if (!bone) return;
    const existing = resolvedOverrides.get(bone.uuid);
    const usesExactUuid = boneKey === bone.uuid;
    if (!existing || usesExactUuid) {
      resolvedOverrides.set(bone.uuid, { bone, override, usesExactUuid });
    }
  });

  resolvedOverrides.forEach(({ bone: child, override }) => {
    if (!override) return;
    if (Array.isArray(override) && override.length >= 4) {
      coreBoneQuaternion
        .set(override[0], override[1], override[2], override[3])
        .normalize();
      clampBoneRotationDelta(coreBoneQuaternion);
      child.quaternion.multiply(coreBoneQuaternion).normalize();
      return;
    }
    if (Array.isArray(override) && override.length >= 3) {
      coreBoneEuler.set(override[0], override[1], override[2]);
      coreBoneQuaternion.setFromEuler(coreBoneEuler);
      clampBoneRotationDelta(coreBoneQuaternion);
      child.quaternion.multiply(coreBoneQuaternion).normalize();
    }
  });
};

const getEntityCustomPose = (entity, locomotionState) => {
  const poseId = getCustomPoseId(locomotionState);
  if (!poseId) return null;
  return (entity.customPoses ?? []).find((pose) => pose.id === poseId) ?? null;
};

const applyActionFirstFrame = (mixer, action) => {
  if (!mixer || !action) return false;
  action.enabled = true;
  action.paused = false;
  action.weight = 1;
  action.setEffectiveWeight(1);
  action.reset().play();
  mixer.update(0);
  return true;
};

const isCoreRigBone = (bone) => {
  const normalized = normalizeBoneName(bone?.name ?? "");
  return (
    normalized.includes("spine") ||
    normalized.includes("chest") ||
    normalized.includes("upperchest") ||
    normalized.includes("hips") ||
    normalized.includes("pelvis") ||
    normalized.includes("neck") ||
    normalized.includes("head")
  );
};

const getLimitedIkChain = (bone, limit = 4) => {
  const chain = [];
  let parent = bone?.parent;
  while (parent && chain.length < limit) {
    if (parent.isBone) {
      if (chain.length > 0 && isCoreRigBone(parent)) break;
      chain.push(parent);
    }
    parent = parent.parent;
  }
  return chain;
};

const ikTargetWorld = new THREE.Vector3();
const ikOffsetWorld = new THREE.Vector3();
const ikAxisQuaternion = new THREE.Quaternion();
const ikJointWorld = new THREE.Vector3();
const ikEndWorld = new THREE.Vector3();
const ikToEnd = new THREE.Vector3();
const ikToTarget = new THREE.Vector3();
const ikDeltaQuaternion = new THREE.Quaternion();
const ikJointWorldQuaternion = new THREE.Quaternion();
const ikParentWorldQuaternion = new THREE.Quaternion();
const ikParentInverseQuaternion = new THREE.Quaternion();
const ikNextLocalQuaternion = new THREE.Quaternion();

const solveIkChainToTarget = (endBone, targetWorld, chain) => {
  if (!endBone || chain.length === 0) return;

  for (let iteration = 0; iteration < BONE_IK_ITERATIONS; iteration += 1) {
    for (const jointBone of chain) {
      jointBone.updateWorldMatrix(true, true);
      endBone.updateWorldMatrix(true, false);
      jointBone.getWorldPosition(ikJointWorld);
      endBone.getWorldPosition(ikEndWorld);

      ikToEnd.subVectors(ikEndWorld, ikJointWorld);
      ikToTarget.subVectors(targetWorld, ikJointWorld);
      if (ikToEnd.lengthSq() < 0.000001 || ikToTarget.lengthSq() < 0.000001) {
        continue;
      }

      ikToEnd.normalize();
      ikToTarget.normalize();
      ikDeltaQuaternion.setFromUnitVectors(ikToEnd, ikToTarget);
      jointBone.getWorldQuaternion(ikJointWorldQuaternion);

      if (jointBone.parent) {
        jointBone.parent.getWorldQuaternion(ikParentWorldQuaternion);
      } else {
        ikParentWorldQuaternion.identity();
      }

      ikParentInverseQuaternion.copy(ikParentWorldQuaternion).invert();
      ikNextLocalQuaternion
        .copy(ikParentInverseQuaternion)
        .multiply(ikDeltaQuaternion)
        .multiply(ikJointWorldQuaternion)
        .normalize();
      jointBone.quaternion.copy(ikNextLocalQuaternion);
      jointBone.updateMatrixWorld(true);
    }

    endBone.getWorldPosition(ikEndWorld);
    if (ikEndWorld.distanceToSquared(targetWorld) < 0.0004) break;
  }
};

const applyConnectedBoneMove = (
  bone,
  offset = [0, 0, 0],
  axisRoot = null,
  options = {}
) => {
  if (!bone || !Array.isArray(offset)) return;
  if (isCoreRigBone(bone)) return;
  const [x = 0, y = 0, z = 0] = offset;
  if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 0.0001) return;

  const chain = getLimitedIkChain(bone, options.chainLimit ?? 4);
  if (chain.length === 0) return;

  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(ikTargetWorld);

  if (axisRoot) {
    axisRoot.updateWorldMatrix(true, false);
    axisRoot.getWorldQuaternion(ikAxisQuaternion);
  } else {
    ikAxisQuaternion.identity();
  }

  ikOffsetWorld
    .set(x, y, z)
    .multiplyScalar(BONE_MOVE_WORLD_SCALE)
    .applyQuaternion(ikAxisQuaternion);
  ikTargetWorld.add(ikOffsetWorld);
  solveIkChainToTarget(bone, ikTargetWorld, chain);
};

const resolveMovePoseBone = (model, moveKey, profile = {}) => {
  if (!model) return null;
  if (profile?.boneUuid) {
    const bone = model.getObjectByProperty("uuid", profile.boneUuid);
    if (bone?.isBone) return bone;
  }
  const uuidBone = model.getObjectByProperty("uuid", moveKey);
  if (uuidBone?.isBone) return uuidBone;
  return resolveCanonicalRigBoneByKey(model, moveKey);
};

const applyBoneMovePose = (
  model,
  movePose = {},
  axisRoot = null,
  moveProfiles = {}
) => {
  if (!model || !movePose) return;
  Object.entries(movePose).forEach(([moveKey, offset]) => {
    const profile = moveProfiles?.[moveKey];
    applyConnectedBoneMove(
      resolveMovePoseBone(model, moveKey, profile),
      offset,
      axisRoot,
      profile
    );
  });
};

const BoneRigControls = ({
  entity,
  model,
  parentGroupRef,
  rigPreviewRef,
  markerScale = 1,
}) => {
  const { runCommand } = useEngine();
  const { camera, gl, size } = useThree();
  const markerRefs = useRef({});
  const linkRefs = useRef({});
  const gizmoRef = useRef(null);
  const moveHandleRefs = useRef({});
  const rotateHandleRefs = useRef({});
  const draggingGizmoRef = useRef(null);
  const dragMoveOffsetsRef = useRef({});
  const tempWorldA = useMemo(() => new THREE.Vector3(), []);
  const tempWorldB = useMemo(() => new THREE.Vector3(), []);
  const tempLocalA = useMemo(() => new THREE.Vector3(), []);
  const tempLocalB = useMemo(() => new THREE.Vector3(), []);
  const tempAxis = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempInverseQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempDeltaQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempNextQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempProjectedA = useMemo(() => new THREE.Vector3(), []);
  const tempProjectedB = useMemo(() => new THREE.Vector3(), []);
  const lastCommitRef = useRef(0);
  const [activeGizmoHandle, setActiveGizmoHandle] = useState(null);
  const [hoveredGizmoHandle, setHoveredGizmoHandle] = useState(null);
  const [hoveredRigJointId, setHoveredRigJointId] = useState(null);
  const rigVisible = Boolean(entity.boneRigEnabled);
  const selectedBone = useMemo(
    () => resolveRigJointBone(model, entity.selectedBoneJointId),
    [entity.selectedBoneJointId, model]
  );
  const selectedBoneIsCore = isCoreRigBone(selectedBone);

  const finishGizmoDrag = (forceCommit = true) => {
    const drag = draggingGizmoRef.current;
    const preview = rigPreviewRef.current;
    if (drag && forceCommit) {
      const bone = resolveRigJointBone(model, drag.jointId);
      if (drag.type === "move") {
        if (preview?.moveOverrides || preview?.moveProfiles) {
          commitBoneMoveState(
            preview.moveOverrides ?? entity.boneMoveOverrides ?? {},
            preview.moveProfiles ?? entity.boneMoveProfiles ?? {},
            true
          );
        } else {
          commitBoneMoveOffset(
            bone,
            dragMoveOffsetsRef.current[bone?.name] ??
              entity.boneMoveOverrides?.[bone?.name] ??
              [0, 0, 0],
            true
          );
        }
      } else {
        if (drag.mode === "direct") {
          if (
            preview?.rotationOverrides ||
            preview?.moveOverrides ||
            preview?.moveProfiles
          ) {
            runCommand({
              type: "run-command-batch",
              label: "Update bone pose",
              commands: [
                {
                  type: "set-entity-property",
                  entityId: entity.id,
                  property: "boneOverrides",
                  value:
                    preview.rotationOverrides ?? entity.boneOverrides ?? {},
                },
                {
                  type: "set-entity-property",
                  entityId: entity.id,
                  property: "boneMoveOverrides",
                  value: preview.moveOverrides ?? entity.boneMoveOverrides ?? {},
                },
                {
                  type: "set-entity-property",
                  entityId: entity.id,
                  property: "boneMoveProfiles",
                  value: preview.moveProfiles ?? entity.boneMoveProfiles ?? {},
                },
              ],
            });
          } else {
            commitBoneRotationOverrides(
              preview?.rotationOverrides ??
                drag.nextRotationOverrides ??
                entity.boneOverrides ??
                {},
              true
            );
          }
        } else {
          commitBoneMoveState(
            drag.nextMoveOverrides ?? entity.boneMoveOverrides ?? {},
            drag.nextMoveProfiles ?? entity.boneMoveProfiles ?? {},
            true
          );
        }
      }
      if (rigPreviewRef.current) {
        rigPreviewRef.current = {
          ...rigPreviewRef.current,
          pendingCommit: true,
        };
      }
    } else if (!forceCommit) {
      rigPreviewRef.current = null;
    }

    draggingGizmoRef.current = null;
    dragMoveOffsetsRef.current = {};
    setActiveGizmoHandle(null);
    setHoveredGizmoHandle(null);
    gl.domElement.style.cursor = "";
    document.body.dataset.boneRigCanvasDrag = "idle";
  };

  const clearGizmoInteraction = ({ clearHandles = true } = {}) => {
    finishGizmoDrag(true);
    if (clearHandles) {
      moveHandleRefs.current = {};
      rotateHandleRefs.current = {};
    }
  };

  const positionGizmoAtBone = (bone) => {
    if (!bone || !gizmoRef.current || !parentGroupRef.current) return;
    model.updateMatrixWorld(true);
    parentGroupRef.current.updateMatrixWorld(true);
    bone.getWorldPosition(tempWorldA);
    tempLocalA.copy(tempWorldA);
    parentGroupRef.current.worldToLocal(tempLocalA);
    gizmoRef.current.position.copy(tempLocalA);
    gizmoRef.current.visible = true;
  };

  const selectRigJoint = (jointId) => {
    const bone = resolveRigJointBone(model, jointId);
    clearGizmoInteraction({
      clearHandles: entity.selectedBoneJointId !== jointId,
    });
    positionGizmoAtBone(bone);
    runCommand({
      type: "run-command-batch",
      label: "Select rig joint",
      commands: [
        {
          type: "set-entity-property",
          entityId: entity.id,
          property: "boneRigEnabled",
          value: true,
        },
        {
          type: "set-entity-property",
          entityId: entity.id,
          property: "selectedBoneJointId",
          value: jointId,
        },
        {
          type: "set-entity-property",
          entityId: entity.id,
          property: "selectedBoneName",
          value: bone?.name ?? null,
        },
      ],
    });
  };

  useEffect(() => {
    draggingGizmoRef.current = null;
    dragMoveOffsetsRef.current = {};
    setActiveGizmoHandle(null);
    setHoveredGizmoHandle(null);
    gl.domElement.style.cursor = "";
    document.body.dataset.boneRigCanvasDrag = "idle";
  }, [entity.selectedBoneJointId, gl.domElement]);

  useEffect(() => {
    if (!selectedBone || entity.selectedBoneName === selectedBone.name) return;
    runCommand({
      type: "set-entity-property",
      entityId: entity.id,
      property: "selectedBoneName",
      value: selectedBone.name,
    });
  }, [entity.id, entity.selectedBoneName, runCommand, selectedBone]);

  const commitBoneMoveState = (
    nextOverrides,
    nextProfiles = entity.boneMoveProfiles ?? {},
    force = false
  ) => {
    const now = Date.now();
    if (!force && now - lastCommitRef.current < 80) return;
    lastCommitRef.current = now;
    runCommand({
      type: "run-command-batch",
      label: "Update bone pose",
      commands: [
        {
          type: "set-entity-property",
          entityId: entity.id,
          property: "boneMoveOverrides",
          value: nextOverrides,
          transient: !force,
        },
        {
          type: "set-entity-property",
          entityId: entity.id,
          property: "boneMoveProfiles",
          value: nextProfiles,
          transient: !force,
        },
      ],
    });
  };

  const commitBoneMoveOffset = (bone, offset, force = false) => {
    if (!bone || isCoreRigBone(bone)) return;
    const nextProfiles = { ...(entity.boneMoveProfiles ?? {}) };
    delete nextProfiles[bone.name];
    const nextOverrides = {
      ...(entity.boneMoveOverrides ?? {}),
      [bone.name]: offset.slice(0, 3),
    };
    commitBoneMoveState(nextOverrides, nextProfiles, force);
  };

  const commitBoneRotationOverrides = (nextOverrides, force = false) => {
    const now = Date.now();
    if (!force && now - lastCommitRef.current < 80) return;
    lastCommitRef.current = now;
    runCommand({
      type: "set-entity-property",
      entityId: entity.id,
      property: "boneOverrides",
      value: nextOverrides,
      transient: !force,
    });
  };

  const nudgeBoneMoveOffset = (bone, axisIndex, delta, force = false) => {
    if (!bone || isCoreRigBone(bone)) return;
    const drag = draggingGizmoRef.current;
    const current =
      dragMoveOffsetsRef.current[bone.name] ??
      entity.boneMoveOverrides?.[bone.name] ??
      [0, 0, 0];
    const next = [...current];
    next[axisIndex] = next[axisIndex] + delta;
    dragMoveOffsetsRef.current[bone.name] = next;
    const nextMoveOverrides = {
      ...(drag?.baseMoveOverrides ?? entity.boneMoveOverrides ?? {}),
      [bone.name]: next.slice(0, 3),
    };
    const nextMoveProfiles = {
      ...(drag?.baseMoveProfiles ?? entity.boneMoveProfiles ?? {}),
    };
    delete nextMoveProfiles[bone.name];
    if (drag) {
      drag.nextMoveOverrides = nextMoveOverrides;
      drag.nextMoveProfiles = nextMoveProfiles;
    }
    rigPreviewRef.current = {
      rotationOverrides:
        drag?.baseRotationOverrides ?? entity.boneOverrides ?? {},
      moveOverrides: nextMoveOverrides,
      moveProfiles: nextMoveProfiles,
      pendingCommit: false,
    };
    if (force) commitBoneMoveOffset(bone, next, true);
  };

  const getRotationBoneForJoint = (_jointId, fallbackBone) => fallbackBone;

  const getBoneOverrideQuaternion = (bone, overrides = {}) => {
    const override = overrides?.[bone?.uuid] ?? overrides?.[bone?.name];
    if (Array.isArray(override) && override.length >= 4) {
      return new THREE.Quaternion(
        override[0],
        override[1],
        override[2],
        override[3]
      ).normalize();
    }
    if (Array.isArray(override) && override.length >= 3) {
      return new THREE.Quaternion().setFromEuler(
        new THREE.Euler(override[0], override[1], override[2])
      );
    }
    return new THREE.Quaternion();
  };

  const applyDirectBoneRotationAngle = (bone, angle, force = false) => {
    if (!bone) return;
    const drag = draggingGizmoRef.current;
    if (!drag?.localAxis) return;
    const rotationBone =
      (drag.rotationBoneUuid
        ? model.getObjectByProperty("uuid", drag.rotationBoneUuid)
        : null) ?? bone;
    if (!rotationBone?.isBone) return;
    drag.angle = THREE.MathUtils.clamp(
      angle,
      -BONE_ROTATION_LIMIT,
      BONE_ROTATION_LIMIT
    );
    tempDeltaQuaternion.setFromAxisAngle(drag.localAxis, drag.angle);
    tempNextQuaternion
      .copy(drag.baseOverrideQuaternion)
      .multiply(tempDeltaQuaternion)
      .normalize();
    clampBoneRotationDelta(tempNextQuaternion);
    const nextRotationOverrides = {
      ...(drag.baseRotationOverrides ?? {}),
    };
    // Persist the stable FBX bone name. Application resolves that name to one
    // canonical skeleton bone, so duplicate skin-layer bones are never rotated.
    delete nextRotationOverrides[rotationBone.uuid];
    nextRotationOverrides[rotationBone.name] = tempNextQuaternion.toArray();
    drag.nextRotationOverrides = nextRotationOverrides;
    rigPreviewRef.current = {
      rotationOverrides: nextRotationOverrides,
      moveOverrides: drag.baseMoveOverrides ?? entity.boneMoveOverrides ?? {},
      moveProfiles: drag.baseMoveProfiles ?? entity.boneMoveProfiles ?? {},
      pendingCommit: false,
    };
    if (force) commitBoneRotationOverrides(nextRotationOverrides, true);
  };

  const normalizeProjectedWorldVector = (origin, direction) => {
    tempWorldB.copy(origin).addScaledVector(direction, 1.5);
    tempProjectedA.copy(origin).project(camera);
    tempProjectedB.copy(tempWorldB).project(camera);
    const dx = (tempProjectedB.x - tempProjectedA.x) * size.width * 0.5;
    const dy = -(tempProjectedB.y - tempProjectedA.y) * size.height * 0.5;
    const length = Math.hypot(dx, dy);
    if (length < 0.0001) return null;
    return { x: dx / length, y: dy / length };
  };

  const getFallbackAxisVector = (axisIndex) => {
    const selectedBoneForAxis = resolveRigJointBone(model, entity.selectedBoneJointId);
    if (!selectedBoneForAxis || !parentGroupRef.current) {
      return axisIndex === 1 ? { x: 0, y: -1 } : { x: 1, y: 0 };
    }

    selectedBoneForAxis.getWorldPosition(tempWorldA);
    parentGroupRef.current.getWorldQuaternion(tempQuaternion);
    tempAxis.set(
      axisIndex === 0 ? 1 : 0,
      axisIndex === 1 ? 1 : 0,
      axisIndex === 2 ? 1 : 0
    );
    tempAxis.applyQuaternion(tempQuaternion).normalize();
    return (
      normalizeProjectedWorldVector(tempWorldA, tempAxis) ??
      (axisIndex === 1 ? { x: 0, y: -1 } : { x: 1, y: 0 })
    );
  };

  const getProjectedMoveAxisVector = (axisIndex) => {
    const handle = moveHandleRefs.current[axisIndex];
    if (!handle) return getFallbackAxisVector(axisIndex);
    handle.updateWorldMatrix(true, false);
    handle.getWorldPosition(tempWorldA);
    tempAxis.set(0, 1, 0).transformDirection(handle.matrixWorld).normalize();
    return normalizeProjectedWorldVector(tempWorldA, tempAxis) ?? getFallbackAxisVector(axisIndex);
  };

  const getProjectedDragDelta = (drag, event, sensitivity) => {
    const axisVector = drag?.screenAxis ?? { x: 1, y: 0 };
    return (
      ((event.movementX ?? 0) * axisVector.x +
        (event.movementY ?? 0) * axisVector.y) *
      sensitivity
    );
  };

  const getRotationDragAngle = (drag, event, fallbackSensitivity) => {
    return (drag?.angle ?? 0) + getProjectedDragDelta(drag, event, fallbackSensitivity);
  };

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = draggingGizmoRef.current;
      if (!drag) return;
      event.preventDefault();
      const bone = resolveRigJointBone(model, drag.jointId);
      if (!bone) return;
      if (drag.type === "move") {
        nudgeBoneMoveOffset(
          bone,
          drag.axis,
          getProjectedDragDelta(drag, event, 0.008),
          false
        );
        return;
      }
      applyDirectBoneRotationAngle(
        bone,
        getRotationDragAngle(drag, event, BONE_ROTATION_DRAG_SCALE),
        false
      );
    };

    const handlePointerUp = () => finishGizmoDrag(true);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  });

  useFrame(() => {
    if (!rigVisible || !parentGroupRef.current) return;
    model.updateMatrixWorld(true);
    parentGroupRef.current.updateMatrixWorld(true);
    BONE_RIG_JOINTS.forEach((joint) => {
      const marker = markerRefs.current[joint.id];
      if (!marker) return;
      const bone = resolveRigJointBone(model, joint.id);
      marker.visible = Boolean(bone);
      if (!bone) return;
      bone.getWorldPosition(tempWorldA);
      tempLocalA.copy(tempWorldA);
      parentGroupRef.current.worldToLocal(tempLocalA);
      marker.position.copy(tempLocalA);
    });

    BONE_RIG_LINKS.forEach(([fromJointId, toJointId]) => {
      const link = linkRefs.current[`${fromJointId}:${toJointId}`];
      if (!link) return;
      const fromBone = resolveRigJointBone(model, fromJointId);
      const toBone = resolveRigJointBone(model, toJointId);
      link.visible = Boolean(fromBone && toBone);
      if (!fromBone || !toBone) return;

      fromBone.getWorldPosition(tempWorldA);
      toBone.getWorldPosition(tempWorldB);
      tempLocalA.copy(tempWorldA);
      tempLocalB.copy(tempWorldB);
      parentGroupRef.current.worldToLocal(tempLocalA);
      parentGroupRef.current.worldToLocal(tempLocalB);

      const position = link.geometry.attributes.position;
      position.setXYZ(0, tempLocalA.x, tempLocalA.y, tempLocalA.z);
      position.setXYZ(1, tempLocalB.x, tempLocalB.y, tempLocalB.z);
      position.needsUpdate = true;
      link.geometry.computeBoundingSphere();
    });

    if (gizmoRef.current) {
      const selectedBoneForGizmo = resolveRigJointBone(
        model,
        entity.selectedBoneJointId
      );
      gizmoRef.current.visible = Boolean(selectedBoneForGizmo);
      if (selectedBoneForGizmo) {
        selectedBoneForGizmo.getWorldPosition(tempWorldA);
        tempLocalA.copy(tempWorldA);
        parentGroupRef.current.worldToLocal(tempLocalA);
        gizmoRef.current.position.copy(tempLocalA);
      }
    }
  });

  if (!rigVisible) return null;

  return (
    <>
      <group renderOrder={79}>
        {BONE_RIG_LINKS.map(([fromJointId, toJointId]) => {
          const selectedJointId = entity.selectedBoneJointId;
          const isSelectedChain =
            selectedJointId === fromJointId ||
            selectedJointId === toJointId ||
            BONE_RIG_LINKED_JOINTS[selectedJointId]?.includes(fromJointId) ||
            BONE_RIG_LINKED_JOINTS[selectedJointId]?.includes(toJointId);

          return (
            <line
              key={`${fromJointId}:${toJointId}`}
              ref={(node) => {
                if (node) linkRefs.current[`${fromJointId}:${toJointId}`] = node;
              }}
              renderOrder={79}
            >
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={2}
                  array={new Float32Array(6)}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color={isSelectedChain ? "#ffffff" : "#9bd4c8"}
                depthTest={false}
                transparent
                opacity={isSelectedChain ? 0.82 : 0.38}
                toneMapped={false}
              />
            </line>
          );
        })}
      </group>
      <group renderOrder={80}>
        {BONE_RIG_JOINTS.map((joint) => {
          const selectedJointId = entity.selectedBoneJointId;
          const isSelected = selectedJointId === joint.id;
          const isLinked = BONE_RIG_LINKED_JOINTS[selectedJointId]?.includes(joint.id);
          const isHovered = hoveredRigJointId === joint.id;
          return (
            <mesh
              key={joint.id}
              scale={[markerScale, markerScale, markerScale]}
              ref={(node) => {
                if (node) markerRefs.current[joint.id] = node;
              }}
              renderOrder={80}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                selectRigJoint(joint.id);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredRigJointId(joint.id);
                gl.domElement.style.cursor = "pointer";
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                setHoveredRigJointId((current) =>
                  current === joint.id ? null : current
                );
                gl.domElement.style.cursor = "";
              }}
            >
              <sphereGeometry
                args={[
                  isSelected ? 0.13 : isHovered ? 0.12 : isLinked ? 0.102 : 0.092,
                  20,
                  14,
                ]}
              />
              <meshBasicMaterial
                color={
                  isSelected || isHovered
                    ? "#ffffff"
                    : isLinked
                      ? "#d5fff6"
                      : "#9bd4c8"
                }
                depthTest={false}
                transparent
                opacity={isSelected ? 0.98 : isHovered ? 0.92 : isLinked ? 0.86 : 0.68}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>
      {selectedBone && (
        <group
          key={`bone-gizmo-${entity.selectedBoneJointId}-${selectedBone.name}`}
          ref={gizmoRef}
          renderOrder={92}
          scale={[markerScale, markerScale, markerScale]}
        >
          {!selectedBoneIsCore && [
            { axis: 0, color: "#ff6262", rotation: [0, 0, -Math.PI / 2], position: [0.58, 0, 0] },
            { axis: 1, color: "#7dff9b", rotation: [0, 0, 0], position: [0, 0.58, 0] },
            { axis: 2, color: "#6aa7ff", rotation: [Math.PI / 2, 0, 0], position: [0, 0, 0.58] },
          ].map((handle) => {
            const handleId = `move-${handle.axis}`;
            const isActive = activeGizmoHandle === handleId;
            const isHovered = hoveredGizmoHandle === handleId;
            const isInteractive = isActive || isHovered;
            const color = isInteractive ? "#ffffff" : handle.color;
            return (
              <group
                key={handleId}
                ref={(node) => {
                  if (node) {
                    moveHandleRefs.current[handle.axis] = node;
                  } else {
                    delete moveHandleRefs.current[handle.axis];
                  }
                }}
                position={handle.position}
                rotation={handle.rotation}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  draggingGizmoRef.current = {
                    type: "move",
                    axis: handle.axis,
                    jointId: entity.selectedBoneJointId,
                    screenAxis: getProjectedMoveAxisVector(handle.axis),
                    baseBonePose: createBoneRotationSnapshot(model),
                    baseMoveOffset: [
                      ...(entity.boneMoveOverrides?.[selectedBone.name] ?? [0, 0, 0]),
                    ],
                    baseMoveOverrides: entity.boneMoveOverrides ?? {},
                    baseMoveProfiles: entity.boneMoveProfiles ?? {},
                  };
                  dragMoveOffsetsRef.current = {};
                  setActiveGizmoHandle(handleId);
                  document.body.dataset.boneRigCanvasDrag = handleId;
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  setHoveredGizmoHandle(handleId);
                  gl.domElement.style.cursor = "grab";
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                  setHoveredGizmoHandle((current) =>
                    current === handleId ? null : current
                  );
                  if (!draggingGizmoRef.current) gl.domElement.style.cursor = "";
                }}
                onPointerUp={(event) => {
                  if (
                    draggingGizmoRef.current?.type !== "move" ||
                    draggingGizmoRef.current.axis !== handle.axis
                  ) {
                    return;
                  }
                  event.stopPropagation();
                  finishGizmoDrag(true);
                }}
              >
                <mesh>
                  <cylinderGeometry args={[0.105, 0.105, 0.72, 12]} />
                  <meshBasicMaterial
                    color={color}
                    depthWrite={false}
                    depthTest={false}
                    transparent
                    opacity={isActive ? 0.15 : isHovered ? 0.1 : 0.03}
                    toneMapped={false}
                  />
                </mesh>
                <mesh>
                  <cylinderGeometry args={[isInteractive ? 0.036 : 0.026, isInteractive ? 0.036 : 0.026, 0.56, 12]} />
                  <meshBasicMaterial
                    color={color}
                    depthTest={false}
                    transparent
                    opacity={isInteractive ? 1 : 0.86}
                    toneMapped={false}
                  />
                </mesh>
                <mesh position={[0, 0.36, 0]}>
                  <coneGeometry args={[isInteractive ? 0.098 : 0.075, 0.18, 16]} />
                  <meshBasicMaterial
                    color={color}
                    depthTest={false}
                    transparent
                    opacity={isInteractive ? 1 : 0.92}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            );
          })}
          {SHOW_BONE_ROTATION_HANDLES && [
            { axis: 0, color: "#ff6262", rotation: [0, Math.PI / 2, 0] },
            { axis: 1, color: "#7dff9b", rotation: [Math.PI / 2, 0, 0] },
            { axis: 2, color: "#6aa7ff", rotation: [0, 0, 0] },
          ].map((handle) => {
            const handleId = `rotate-${handle.axis}`;
            const isActive = activeGizmoHandle === handleId;
            const isHovered = hoveredGizmoHandle === handleId;
            const isInteractive = isActive || isHovered;
            const color = isInteractive ? "#ffffff" : handle.color;
            return (
              <mesh
                key={handleId}
                ref={(node) => {
                  if (node) {
                    rotateHandleRefs.current[handle.axis] = node;
                  } else {
                    delete rotateHandleRefs.current[handle.axis];
                  }
                }}
                rotation={handle.rotation}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const bone = resolveRigJointBone(model, entity.selectedBoneJointId);
                  if (!bone) return;
                  model.updateMatrixWorld(true);
                  parentGroupRef.current?.updateWorldMatrix(true, false);
                  const worldAxis = new THREE.Vector3(
                    handle.axis === 0 ? 1 : 0,
                    handle.axis === 1 ? 1 : 0,
                    handle.axis === 2 ? 1 : 0
                  );
                  if (parentGroupRef.current) {
                    parentGroupRef.current.getWorldQuaternion(tempQuaternion);
                    worldAxis.applyQuaternion(tempQuaternion);
                  }
                  worldAxis.normalize();
                  const rotationBone = getRotationBoneForJoint(
                    entity.selectedBoneJointId,
                    bone
                  );
                  if (!rotationBone?.isBone) return;
                  const localAxis = worldAxis.clone();
                  rotationBone.updateWorldMatrix(true, false);
                  rotationBone.getWorldQuaternion(tempInverseQuaternion);
                  tempInverseQuaternion.invert();
                  localAxis.applyQuaternion(tempInverseQuaternion).normalize();
                  draggingGizmoRef.current = {
                    type: "rotate",
                    mode: "direct",
                    axis: handle.axis,
                    jointId: entity.selectedBoneJointId,
                    screenAxis: getFallbackAxisVector(handle.axis),
                    localAxis,
                    angle: 0,
                    rotationBoneUuid: rotationBone.uuid,
                    baseBonePose: createBoneRotationSnapshot(model),
                    baseRotationOverrides: entity.boneOverrides ?? {},
                    baseOverrideQuaternion: getBoneOverrideQuaternion(
                      rotationBone,
                      entity.boneOverrides ?? {}
                    ),
                    baseMoveOverrides: entity.boneMoveOverrides ?? {},
                    baseMoveProfiles: entity.boneMoveProfiles ?? {},
                  };
                  dragMoveOffsetsRef.current = {};
                  setActiveGizmoHandle(handleId);
                  document.body.dataset.boneRigCanvasDrag = handleId;
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  setHoveredGizmoHandle(handleId);
                  gl.domElement.style.cursor = "grab";
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                  setHoveredGizmoHandle((current) =>
                    current === handleId ? null : current
                  );
                  if (!draggingGizmoRef.current) gl.domElement.style.cursor = "";
                }}
                onPointerUp={(event) => {
                  if (
                    draggingGizmoRef.current?.type !== "rotate" ||
                    draggingGizmoRef.current.axis !== handle.axis
                  ) {
                    return;
                  }
                  event.stopPropagation();
                  finishGizmoDrag(true);
                }}
              >
                <torusGeometry args={[0.43, isInteractive ? 0.046 : 0.035, 8, 72]} />
                <meshBasicMaterial
                  color={color}
                  depthWrite={false}
                  depthTest={false}
                  transparent
                  opacity={isActive ? 0.18 : isHovered ? 0.1 : 0.025}
                  toneMapped={false}
                />
                <mesh>
                  <torusGeometry args={[0.43, isInteractive ? 0.019 : 0.012, 8, 72]} />
                  <meshBasicMaterial
                    color={color}
                    depthTest={false}
                    transparent
                    opacity={isInteractive ? 1 : 0.68}
                    toneMapped={false}
                  />
                </mesh>
              </mesh>
            );
          })}
        </group>
      )}
    </>
  );
};

const CharacterEntity = ({
  entity,
  mobile = false,
  selected,
  onSelect,
  onPointerDown,
  runtimeTransformRef,
}) => {
  const { engineState } = useEngine();
  const activeScene = getActiveScene(engineState.scene);
  const hideLocalFirstPersonModel =
    activeScene.camera?.mode === "first-person" &&
    (activeScene.camera?.targetEntityId ?? "hero") === entity.id &&
    engineState.mode === "play";
  const isRigEditingMode =
    selected && entity.boneRigEnabled && engineState.mode === "select";
  const groupRef = useRef();
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const activeActionRef = useRef(null);
  const activeLocomotionRef = useRef(null);
  const baseBonePoseRef = useRef(null);
  const rigPreviewRef = useRef(null);
  const footGroundingOffsetRef = useRef(0);
  const footGroundingBoundsRef = useRef(new THREE.Box3());
  const shouldApplyDirectorBones =
    entity.id !== "hero" || engineState.mode !== "play";
  const animationFrameStatsRef = useRef({
    maxDelta: 0,
    reportClock: 0,
  });
  const fbx = useLoader(
    FBXLoader,
    entity.modelUrl ?? "/animations/uploaded/Standing%20Idle.fbx"
  );
  const animationEntries = useMemo(
    () => {
      return mobile
        ? getMobileAnimationEntries(entity.animationSet, entity.locomotionState)
        : getAnimationEntries(entity.animationSet);
    },
    [entity.animationSet, entity.locomotionState, mobile]
  );
  const animationUrls = useMemo(
    () => animationEntries.map(([, url]) => url),
    [animationEntries]
  );
  const animationFbxs = useLoader(FBXLoader, animationUrls);
  const importedAsset = useMemo(() => {
    const imported = importCharacterFbxAsset(fbx, {
      modelUrl: entity.modelUrl,
      targetHeight: entity.targetHeight ?? CHARACTER_TARGET_HEIGHT,
    });
    document.body.dataset.characterStatus = "loaded";
    return imported;
  }, [entity.modelUrl, entity.targetHeight, fbx]);
  const model = importedAsset.object;
  const scaleMultiplier = entity.scale ?? [1, 1, 1];
  const normalizedScale = importedAsset.normalizedScale;
  const sceneNameMap = useMemo(() => createSceneNameMap(model), [model]);
  const clips = useMemo(
    () =>
      animationFbxs
        .map((animationFbx, index) =>
          createNamedClip(animationFbx, animationEntries[index]?.[0], sceneNameMap)
        )
        .filter((clip) => clip && clip.tracks.length > 0),
    [animationEntries, animationFbxs, sceneNameMap]
  );

  useEffect(() => {
    baseBonePoseRef.current = createBoneRotationSnapshot(model);
  }, [model]);

  useEffect(() => {
    const preview = rigPreviewRef.current;
    if (!isRigEditingMode) {
      rigPreviewRef.current = null;
      return;
    }
    if (!preview?.pendingCommit) return;
    const rotationCommitted =
      JSON.stringify(preview.rotationOverrides ?? {}) ===
      JSON.stringify(entity.boneOverrides ?? {});
    const moveCommitted =
      JSON.stringify(preview.moveOverrides ?? {}) ===
      JSON.stringify(entity.boneMoveOverrides ?? {});
    const profilesCommitted =
      JSON.stringify(preview.moveProfiles ?? {}) ===
      JSON.stringify(entity.boneMoveProfiles ?? {});
    if (rotationCommitted && moveCommitted && profilesCommitted) {
      rigPreviewRef.current = null;
    }
  }, [
    entity.boneMoveOverrides,
    entity.boneMoveProfiles,
    entity.boneOverrides,
    isRigEditingMode,
  ]);

  useEffect(() => {
    if (!model || !entity.color) return;
    const nextColor = new THREE.Color(entity.color);
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => {
        if (!material?.color) return;
        material.color.copy(nextColor);
        material.needsUpdate = true;
      });
    });
  }, [entity.color, model]);

  useEffect(() => {
    if (!model || !selected || !entity.boneRigEnabled || engineState.mode === "play") {
      return undefined;
    }

    const disabledMeshes = [];
    model.traverse((child) => {
      if (!child.isMesh) return;
      disabledMeshes.push([child, child.raycast]);
      child.raycast = () => null;
    });

    return () => {
      disabledMeshes.forEach(([child, originalRaycast]) => {
        child.raycast = originalRaycast;
      });
    };
  }, [engineState.mode, entity.boneRigEnabled, model, selected]);

  useLayoutEffect(() => {
    if (!model || clips.length === 0) return undefined;

    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(
      clips.map((clip) => {
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.clampWhenFinished = false;
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = ANIMATION_TIME_SCALE[clip.name] ?? 1;
        return [clip.name, action];
      })
    );

    mixerRef.current = mixer;
    actionsRef.current = actions;
    const idleAction = actions.idle ?? actions[Object.keys(actions)[0]];
    if (idleAction) {
      applyActionFirstFrame(mixer, idleAction);
      activeActionRef.current = idleAction;
      activeLocomotionRef.current = idleAction.getClip().name;
    }
    document.body.dataset.characterAnimations = JSON.stringify(
      Object.keys(actions)
    );
    document.body.dataset.characterStatus = "ready";

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      mixerRef.current = null;
      actionsRef.current = {};
      activeActionRef.current = null;
      activeLocomotionRef.current = null;
    };
  }, [clips, model]);

  useLayoutEffect(() => {
    if (shouldApplyDirectorBones || !model) return;
    const actions = actionsRef.current;
    const runtimeState = normalizeLocomotionState(
      runtimeTransformRef?.current?.locomotionState ?? entity.locomotionState
    );
    const clipKey = getAnimationClipKeyForState(runtimeState);
    const action =
      actions[clipKey] ??
      actions.idle ??
      actions[Object.keys(actions)[0]];
    if (!applyActionFirstFrame(mixerRef.current, action)) return;
    activeActionRef.current = action;
    activeLocomotionRef.current = normalizeLocomotionState(runtimeState);
    model.updateMatrixWorld(true);
  }, [
    entity.locomotionState,
    model,
    runtimeTransformRef,
    shouldApplyDirectorBones,
  ]);

  const playLocomotion = (locomotionState, fade = 0.16) => {
    const nextState = normalizeLocomotionState(locomotionState);
    if (activeLocomotionRef.current === nextState) {
      const currentAction = activeActionRef.current;
      const staticPose = getStaticPoseDefinition(nextState);
      if (currentAction) {
        currentAction.paused = Boolean(staticPose);
        currentAction.timeScale =
          ANIMATION_TIME_SCALE[currentAction.getClip()?.name] ?? 1;
      }
      return;
    }

    const actions = actionsRef.current;
    const staticPose = getStaticPoseDefinition(nextState);
    const nextClipKey = getAnimationClipKeyForState(nextState);
    const nextAction = actions[nextClipKey] ?? actions.idle;
    if (!nextAction) return;

    const previousAction = activeActionRef.current;
    nextAction.enabled = true;
    nextAction.weight = 1;
    nextAction.timeScale = ANIMATION_TIME_SCALE[nextClipKey] ?? 1;
    nextAction.paused = Boolean(staticPose);
    nextAction.clampWhenFinished = Boolean(staticPose);
    if (staticPose) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.time = Math.max(
        0,
        Math.min(
          nextAction.getClip().duration,
          nextAction.getClip().duration * staticPose.timeRatio
        )
      );
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.clampWhenFinished = false;
    }
    nextAction.play();
    if (previousAction && previousAction !== nextAction) {
      previousAction.crossFadeTo(nextAction, fade, false);
    } else if (previousAction !== nextAction) {
      nextAction.fadeIn(0.08);
    }
    activeActionRef.current = nextAction;
    activeLocomotionRef.current = nextState;
    document.body.dataset.characterLocomotion = nextState;
    document.body.dataset.characterMotionKind = CHARACTER_MOTION_STATES.has(nextState)
      ? "motion"
      : "static-pose";
  };

  const forceTimelineLocomotion = (runtimeTransform) => {
    const actions = actionsRef.current;
    const nextState = normalizeLocomotionState(
      runtimeTransform?.locomotionState ?? entity.locomotionState
    );
    const requestedClipName =
      runtimeTransform?.animationClipName ?? getAnimationClipKeyForState(nextState);
    const nextAction =
      actions[requestedClipName] ??
      actions[getAnimationClipKeyForState(nextState)] ??
      actions.idle;
    if (!nextAction) return null;

    if (activeActionRef.current !== nextAction) {
      Object.values(actions).forEach((action) => {
        if (action !== nextAction) {
          action.stop();
          action.enabled = false;
        }
      });
      nextAction.enabled = true;
      nextAction.weight = 1;
      nextAction.timeScale = 0;
      nextAction.paused = false;
      nextAction.clampWhenFinished = false;
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.play();
      activeActionRef.current = nextAction;
    }

    nextAction.enabled = true;
    nextAction.weight = 1;
    nextAction.timeScale = 0;
    nextAction.paused = false;
    nextAction.clampWhenFinished = false;
    activeLocomotionRef.current = nextState;
    return nextAction;
  };

  const applyTimelineAnimationLayers = (runtimeTransform) => {
    const layers = runtimeTransform?.animationLayers;
    if (!Array.isArray(layers) || layers.length === 0) return null;

    const actions = actionsRef.current;
    const layerByName = new Map(
      layers
        .filter((layer) => layer?.name && actions[layer.name])
        .map((layer) => [layer.name, layer])
    );
    if (layerByName.size === 0) return null;

    let strongestAction = null;
    let strongestWeight = -1;
    Object.entries(actions).forEach(([name, action]) => {
      const layer = layerByName.get(name);
      const weight = Math.max(0, Math.min(1, Number(layer?.weight) || 0));
      if (!layer || weight <= 0.0001) {
        action.stopFading();
        action.stopWarping();
        action.enabled = false;
        action.setEffectiveWeight(0);
        return;
      }

      const duration = action.getClip()?.duration ?? layer.duration ?? 0;
      action.stopFading();
      action.stopWarping();
      action.enabled = true;
      action.paused = false;
      action.timeScale = 0;
      action.clampWhenFinished = false;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.time =
        duration > 0
          ? THREE.MathUtils.euclideanModulo(Number(layer.time) || 0, duration)
          : Number(layer.time) || 0;
      action.play();
      action.setEffectiveWeight(weight);
      if (weight > strongestWeight) {
        strongestWeight = weight;
        strongestAction = action;
      }
    });
    mixerRef.current?.update(0);
    if (strongestAction) {
      activeActionRef.current = strongestAction;
      activeLocomotionRef.current = normalizeLocomotionState(
        runtimeTransform?.locomotionState ?? entity.locomotionState
      );
    }
    return strongestAction;
  };

  useEffect(() => {
    playLocomotion(entity.locomotionState);
  }, [entity.locomotionState]);

  const settleFootGroundingOffset = (delta) => {
    if (!groupRef.current) return;
    footGroundingOffsetRef.current = THREE.MathUtils.damp(
      footGroundingOffsetRef.current,
      0,
      10,
      delta
    );
    if (Math.abs(footGroundingOffsetRef.current) < 0.0001) {
      footGroundingOffsetRef.current = 0;
    }
    if (footGroundingOffsetRef.current !== 0) {
      groupRef.current.position.y += footGroundingOffsetRef.current;
    }
  };

  const alignAnimatedFeetToGround = (desiredFootY) => {
    if (!groupRef.current || !model) return;
    groupRef.current.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const bounds = footGroundingBoundsRef.current.setFromObject(model);
    if (!Number.isFinite(bounds.min.y) || !Number.isFinite(desiredFootY)) return;
    const correction = desiredFootY - bounds.min.y;
    if (Math.abs(correction) > 0.0001) {
      groupRef.current.position.y += correction;
      groupRef.current.updateMatrixWorld(true);
    }
  };

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    // Timeline preview and timeline playback are the same evaluated pose.
    // Ignoring preview frames while the rig UI was visible made scrubbing show
    // the editor pose instead of the recorded pose.
    const runtimeTransform = runtimeTransformRef?.current;
    const groundOffset = entity.groundOffset ?? 0;
    const playbackUsesCapturedRoot = Boolean(
      runtimeTransform?.timelinePlayback &&
        Array.isArray(runtimeTransform.renderPosition) &&
        runtimeTransform.renderPosition.length >= 3
    );
    if (runtimeTransform) {
      groupRef.current.position.fromArray(
        playbackUsesCapturedRoot
          ? runtimeTransform.renderPosition
          : runtimeTransform.position
      );
      if (!playbackUsesCapturedRoot) {
        groupRef.current.position.y += groundOffset;
      }
      const runtimeRotation =
        playbackUsesCapturedRoot && Array.isArray(runtimeTransform.renderRotation)
          ? runtimeTransform.renderRotation
          : runtimeTransform.rotation;
      groupRef.current.rotation.set(
        runtimeRotation[0],
        runtimeRotation[1],
        runtimeRotation[2]
      );
      if (!runtimeTransform.timelinePlayback) {
        playLocomotion(runtimeTransform.locomotionState ?? entity.locomotionState);
      }
    } else {
      const entityPosition = entity.position ?? [0, 0, 0];
      const entityRotation = entity.rotation ?? [0, Math.PI, 0];
      groupRef.current.position.set(
        entityPosition[0],
        entityPosition[1] + groundOffset,
        entityPosition[2]
      );
      groupRef.current.rotation.set(
        entityRotation[0],
        entityRotation[1],
        entityRotation[2]
      );
    }
    const animationDelta = Math.min(delta, MAX_ANIMATION_DELTA);
    const activeAction = activeActionRef.current;
    const hasCapturedTimelineSkeleton = Boolean(
      runtimeTransform?.timelinePlayback &&
        Array.isArray(runtimeTransform.skeletonPose) &&
        runtimeTransform.skeletonPose.length > 0
    );
    document.body.dataset.timelineCharacterReplay = runtimeTransform?.timelinePlayback
      ? hasCapturedTimelineSkeleton
        ? "evaluated-skeleton"
        : "animation-state"
      : "live";
    // Manual rig offsets are deltas from the evaluated animation pose. Resetting
    // first makes their application idempotent instead of multiplying the same
    // quaternion again on every render frame.
    if (shouldApplyDirectorBones) {
      applyBonePose(model, baseBonePoseRef.current);
    }
    if (hasCapturedTimelineSkeleton) {
      applyTimelineSkeletonPose(
        model,
        sceneNameMap,
        runtimeTransform.skeletonPose
      );
    } else if (runtimeTransform?.timelinePlayback) {
      const layeredTimelineAction = applyTimelineAnimationLayers(runtimeTransform);
      const timelineAction =
        layeredTimelineAction ?? forceTimelineLocomotion(runtimeTransform);
      if (
        !layeredTimelineAction &&
        timelineAction &&
        Number.isFinite(runtimeTransform.animationTime)
      ) {
        const clipDuration = timelineAction.getClip()?.duration ?? 0;
        const nextTime =
          clipDuration > 0
            ? THREE.MathUtils.euclideanModulo(
                runtimeTransform.animationTime,
                clipDuration
              )
            : runtimeTransform.animationTime;
        timelineAction.time = nextTime;
        mixerRef.current?.update(0);
      } else {
        mixerRef.current?.update(animationDelta);
      }
    } else if (isRigEditingMode) {
      // Rig edits need an immutable animation base. Advancing the idle clip
      // between pointer preview and commit changes every joint underneath the
      // same override and makes the released pose visibly jump.
      mixerRef.current?.update(0);
    } else if (runtimeTransform && activeAction) {
      mixerRef.current?.update(animationDelta);
      const activeClip = activeAction.getClip();
      runtimeTransform.animationClipName = activeClip?.name;
      runtimeTransform.animationTime = activeAction.time;
      runtimeTransform.animationDuration = activeClip?.duration;
    } else {
      mixerRef.current?.update(animationDelta);
    }
    if (runtimeTransform && !playbackUsesCapturedRoot) {
      settleFootGroundingOffset(animationDelta);
    } else {
      footGroundingOffsetRef.current = 0;
    }
    const activeDirectorState =
      runtimeTransform?.locomotionState ?? entity.locomotionState;
    const activeCustomPoseId = getCustomPoseId(activeDirectorState);
    const rigPreview = isRigEditingMode ? rigPreviewRef.current : null;
    if (shouldApplyDirectorBones && !hasCapturedTimelineSkeleton && activeCustomPoseId) {
      applyBonePose(model, baseBonePoseRef.current);
      const customPose = getEntityCustomPose(entity, activeDirectorState);
      const editedBoneOverrides =
        rigPreview?.rotationOverrides ??
        (runtimeTransform?.timelinePlayback && runtimeTransform.boneOverrides
          ? runtimeTransform.boneOverrides
          : entity.boneOverrides);
      const editedBoneMoveOverrides =
        rigPreview?.moveOverrides ??
        (runtimeTransform?.timelinePlayback && runtimeTransform.boneMoveOverrides
          ? runtimeTransform.boneMoveOverrides
          : entity.boneMoveOverrides);
      applyCoreBoneRotationOverrides(
        model,
        Object.keys(editedBoneOverrides ?? {}).length > 0
          ? editedBoneOverrides
          : customPose?.bones
      );
      applyBoneMovePose(
        model,
        Object.keys(editedBoneMoveOverrides ?? {}).length > 0
          ? editedBoneMoveOverrides
          : customPose?.moves,
        groupRef.current,
        rigPreview?.moveProfiles ??
          entity.boneMoveProfiles ??
          customPose?.moveProfiles
      );
    }
    if (shouldApplyDirectorBones && !hasCapturedTimelineSkeleton && !activeCustomPoseId) {
      const activeBoneOverrides =
        rigPreview?.rotationOverrides ??
        (runtimeTransform?.timelinePlayback && runtimeTransform.boneOverrides
          ? runtimeTransform.boneOverrides
          : entity.boneOverrides);
      const activeBoneMoveOverrides =
        rigPreview?.moveOverrides ??
        (runtimeTransform?.timelinePlayback && runtimeTransform.boneMoveOverrides
          ? runtimeTransform.boneMoveOverrides
          : entity.boneMoveOverrides);
      applyCoreBoneRotationOverrides(model, activeBoneOverrides);
      applyBoneMovePose(
        model,
        activeBoneMoveOverrides,
        groupRef.current,
        rigPreview?.moveProfiles ?? entity.boneMoveProfiles
      );
    }
    if (runtimeTransform) {
      const desiredFootY =
        playbackUsesCapturedRoot && Number.isFinite(runtimeTransform.renderFootY)
          ? runtimeTransform.renderFootY
          : runtimeTransform.position[1] + groundOffset;
      alignAnimatedFeetToGround(desiredFootY);
    }
    model.updateMatrixWorld(true);
    groupRef.current.updateMatrixWorld(true);
    const renderedBounds = footGroundingBoundsRef.current.setFromObject(model);
    const renderFootY = Number.isFinite(renderedBounds.min.y)
      ? renderedBounds.min.y
      : undefined;
    if (!runtimeTransform?.timelinePlayback) {
      const sampledAction = activeActionRef.current;
      const sampledClip = sampledAction?.getClip?.();
      const animationLayers = Object.entries(actionsRef.current)
        .map(([name, action]) => ({
          name,
          time: action.time,
          duration: action.getClip()?.duration,
          weight: action.enabled ? action.getEffectiveWeight() : 0,
        }))
        .filter((layer) => layer.weight > 0.0001);
      setRuntimeCharacterTimelinePose({
        id: entity.id,
        label: entity.label,
        position: runtimeTransform?.position ?? entity.position ?? [0, 0, 0],
        rotation:
          runtimeTransform?.rotation ?? entity.rotation ?? [0, Math.PI, 0],
        scale: entity.scale ?? [1, 1, 1],
        locomotionState:
          runtimeTransform?.locomotionState ?? entity.locomotionState ?? "idle",
        activeAction: entity.activeAction,
        animationClipName: sampledClip?.name,
        animationTime: sampledAction?.time,
        animationDuration: sampledClip?.duration,
        animationLayers,
        renderPosition: groupRef.current.position.toArray(),
        renderRotation: [
          groupRef.current.rotation.x,
          groupRef.current.rotation.y,
          groupRef.current.rotation.z,
        ],
        renderFootY,
        skeletonPose: isRuntimeTimelineSkeletonCaptureEnabled()
          ? captureTimelineSkeletonPose(model, sceneNameMap)
          : undefined,
        boneOverrides: entity.boneOverrides,
        boneMoveOverrides: entity.boneMoveOverrides,
      });
    }

    const stats = animationFrameStatsRef.current;
    stats.maxDelta = Math.max(stats.maxDelta, delta);
    if (state.clock.elapsedTime - stats.reportClock > 1.5) {
      stats.reportClock = state.clock.elapsedTime;
      document.body.dataset.characterFrameMaxDelta = stats.maxDelta.toFixed(4);
      document.body.dataset.characterAnimationDelta = animationDelta.toFixed(4);
      stats.maxDelta = 0;
    }
  }, -1);

  return (
    <group
      key="uploaded-standing-idle-character-v4"
      name="HeroCharacter"
      ref={groupRef}
      visible={!hideLocalFirstPersonModel}
      position={(() => {
        const sourcePosition =
          runtimeTransformRef?.current?.position ?? entity.position ?? [0, 0, 0];
        return [
          sourcePosition[0],
          sourcePosition[1] + (entity.groundOffset ?? 0),
          sourcePosition[2],
        ];
      })()}
      rotation={
        runtimeTransformRef?.current?.rotation ??
        entity.rotation ?? [0, Math.PI, 0]
      }
      scale={[
        normalizedScale * scaleMultiplier[0],
        normalizedScale * scaleMultiplier[1],
        normalizedScale * scaleMultiplier[2],
      ]}
      onClick={
        engineState.mode === "select" && onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
      onPointerDown={
        engineState.mode === "select" && onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
              onPointerDown?.(entity, event);
            }
          : undefined
      }
    >
      <primitive object={model} />
      {selected && engineState.mode === "select" && (
        <BoneRigControls
          entity={entity}
          model={model}
          parentGroupRef={groupRef}
          rigPreviewRef={rigPreviewRef}
          markerScale={
            1 /
            Math.max(
              0.001,
              normalizedScale *
                ((Math.abs(scaleMultiplier[0]) +
                  Math.abs(scaleMultiplier[1]) +
                  Math.abs(scaleMultiplier[2])) /
                  3)
            )
          }
        />
      )}
      {selected && entity.id !== "hero" && (
        <SelectionHighlight object={model} padding={1.035} />
      )}
    </group>
  );
};

const CharacterLoadingPlaceholder = () => {
  useFrame(() => {
    document.body.dataset.characterStatus = "loading";
  });

  return null;
};

export const CharacterRenderer = ({
  entity,
  mobile = false,
  selected,
  onSelect,
  onPointerDown,
  runtimeTransformRef,
}) => (
  <Suspense fallback={<CharacterLoadingPlaceholder />}>
    <CharacterEntity
      entity={entity}
      mobile={mobile}
      selected={selected}
      onSelect={onSelect}
      onPointerDown={onPointerDown}
      runtimeTransformRef={runtimeTransformRef}
    />
  </Suspense>
);
