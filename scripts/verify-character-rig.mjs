import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import {
  commitRuntimeTimelineCaptureFrame,
  getRuntimeTimelineCaptureFrame,
  isRuntimeTimelineSkeletonCaptureEnabled,
  setRuntimeCharacterTimelinePose,
  setRuntimeTimelineSkeletonCaptureEnabled,
} from "../src/engine/runtime/runtimeTimelineState.js";
import {
  applyTimelineSkeletonPose,
  captureTimelineSkeletonPose,
} from "../src/engine/runtime/renderers/characters/timelineSkeletonPose.js";
import { canTimelineControlViewport } from "../src/engine/runtime/timelineViewportPriority.js";

assert.equal(
  canTimelineControlViewport({ mode: "select", editorTool: "select" }),
  true,
  "Timeline preview should be available only in the neutral editor viewport."
);
[
  { mode: "play", editorTool: "select" },
  { mode: "pilot", editorTool: "select" },
  { mode: "select", editorTool: "camera-move" },
  { mode: "select", editorTool: "object-placement" },
  { mode: "select", editorTool: "brush" },
  { mode: "select", editorTool: "select", phonePilotEnabled: true },
  { mode: "select", editorTool: "select", phoneRuntimeEnabled: true },
  { mode: "select", editorTool: "select", phoneProfile: true },
].forEach((state) => {
  assert.equal(
    canTimelineControlViewport(state),
    false,
    `Main viewport state must outrank timeline preview: ${JSON.stringify(state)}`
  );
});

const MODEL_PATH = new URL(
  "../public/animations/uploaded/Standing%20Idle.fbx",
  import.meta.url
);

const readFbx = () => {
  const source = fs.readFileSync(MODEL_PATH);
  return new FBXLoader().parse(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    ""
  );
};

const resolveStructuralBone = (model, name) => {
  const candidates = [];
  model.traverse((node) => {
    if (!node.isBone || node.name !== name) return;
    const boneChildren = node.children.filter((child) => child.isBone);
    const distinctChildren = boneChildren.filter(
      (child) => child.name !== node.name
    ).length;
    candidates.push({
      bone: node,
      score:
        distinctChildren * 100 +
        boneChildren.length -
        (node.parent?.isBone && node.parent.name === node.name ? 20 : 0),
    });
  });
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.bone ?? null;
};

const model = readFbx();
const requiredRigBones = [
  "mixamorigHips",
  "mixamorigSpine",
  "mixamorigSpine1",
  "mixamorigSpine2",
  "mixamorigNeck",
  "mixamorigHead",
  "mixamorigLeftArm",
  "mixamorigLeftForeArm",
  "mixamorigLeftHand",
  "mixamorigRightArm",
  "mixamorigRightForeArm",
  "mixamorigRightHand",
  "mixamorigLeftUpLeg",
  "mixamorigLeftLeg",
  "mixamorigLeftFoot",
  "mixamorigRightUpLeg",
  "mixamorigRightLeg",
  "mixamorigRightFoot",
];

requiredRigBones.forEach((name) => {
  const bone = resolveStructuralBone(model, name);
  assert.ok(bone, `Expected a structural ${name} joint.`);
  assert.ok(
    bone.children.some((child) => child.isBone && child.name !== bone.name),
    `${name} resolved to a duplicate surface bone instead of the structure bone.`
  );
});

const forearm = resolveStructuralBone(model, "mixamorigLeftForeArm");
const visibleMesh = model.getObjectByName("Alpha_Surface");
const visibleHand = visibleMesh?.skeleton?.getBoneByName("mixamorigLeftHand");

assert.ok(forearm, "Expected a structural left forearm joint.");
assert.ok(visibleHand, "Expected Alpha_Surface to expose its visible hand joint.");

model.updateMatrixWorld(true);
const handBefore = visibleHand.getWorldPosition(new THREE.Vector3()).clone();
const initialQuaternion = forearm.quaternion.clone();
const finalQuaternion = initialQuaternion
  .clone()
  .multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45)
  );
const clip = new THREE.AnimationClip("uuid-rig-check", 1, [
  new THREE.QuaternionKeyframeTrack(
    `${forearm.uuid}.quaternion`,
    [0, 1],
    [...initialQuaternion.toArray(), ...finalQuaternion.toArray()]
  ),
]);
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(clip).play();
mixer.update(0.5);
model.updateMatrixWorld(true);
const handAfter = visibleHand.getWorldPosition(new THREE.Vector3());

assert.ok(
  forearm.quaternion.angleTo(initialQuaternion) > 0.1,
  "The UUID animation track did not bind to the structural forearm."
);
assert.ok(
  handAfter.distanceTo(handBefore) > 0.1,
  "The visible hand did not follow the driven structural forearm."
);

const replayModel = readFbx();
const replayForearm = resolveStructuralBone(
  replayModel,
  "mixamorigLeftForeArm"
);
const replayVisibleHand = replayModel
  .getObjectByName("Alpha_Surface")
  ?.skeleton?.getBoneByName("mixamorigLeftHand");
const capturedAnimatedPose = captureTimelineSkeletonPose(
  model,
  new Map([["leftforearm", { id: forearm.uuid }]])
);
assert.equal(
  applyTimelineSkeletonPose(
    replayModel,
    new Map([["leftforearm", { id: replayForearm.uuid }]]),
    capturedAnimatedPose
  ),
  true,
  "The recorded evaluated skeleton pose must apply to the replay model."
);
model.updateMatrixWorld(true);
replayModel.updateMatrixWorld(true);
assert.ok(
  replayForearm.quaternion.angleTo(forearm.quaternion) < 0.00025,
  "Replay must restore the evaluated joint quaternion exactly."
);
assert.ok(
  replayVisibleHand
    .getWorldPosition(new THREE.Vector3())
    .distanceTo(visibleHand.getWorldPosition(new THREE.Vector3())) < 0.000001,
  "Replay must restore the visible animated limb position exactly."
);

const recordedSkeletonPose = [
  {
    key: "mixamorighips",
    position: [0, 1, 0],
    quaternion: [0, 0, 0, 1],
  },
];
setRuntimeTimelineSkeletonCaptureEnabled(true);
assert.equal(
  isRuntimeTimelineSkeletonCaptureEnabled(),
  true,
  "Timeline recording must be able to enable evaluated skeleton capture."
);
setRuntimeCharacterTimelinePose({
  id: "timeline-rig-check",
  position: [1, 2, 3],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  renderPosition: [1, 2.35, 3],
  renderRotation: [0.1, 0.2, 0.3],
  renderFootY: 0.04,
  skeletonPose: recordedSkeletonPose,
});
commitRuntimeTimelineCaptureFrame({
  position: [4, 5, 6],
  rotation: [0, 0, 0],
  target: [0, 0, 0],
  fov: 45,
});
const capture = getRuntimeTimelineCaptureFrame();
assert.deepEqual(
  capture?.characters?.["timeline-rig-check"]?.renderPosition,
  [1, 2.35, 3],
  "Timeline capture must retain the evaluated render root position."
);
assert.equal(
  capture?.characters?.["timeline-rig-check"]?.renderFootY,
  0.04,
  "Timeline capture must retain the evaluated foot height."
);
recordedSkeletonPose[0].quaternion[0] = 1;
assert.deepEqual(
  capture?.characters?.["timeline-rig-check"]?.skeletonPose,
  [
    {
      key: "mixamorighips",
      position: [0, 1, 0],
      quaternion: [0, 0, 0, 1],
    },
  ],
  "Timeline capture must retain an immutable evaluated skeleton pose."
);
setRuntimeTimelineSkeletonCaptureEnabled(false);

console.log("Character rig and timeline capture checks passed.");
