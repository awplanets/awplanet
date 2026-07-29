export const runtimeTimelineState = {
  characters: {},
  captureFrame: null,
  captureSequence: 0,
  captureSkeletons: false,
  playbackFrame: null,
  version: 0,
};

const cloneArray = (value, fallback) =>
  Array.isArray(value) ? [...value] : [...fallback];

const cloneSkeletonPose = (pose) =>
  Array.isArray(pose)
    ? pose.map((entry) => ({
        key: entry.key,
        position: cloneArray(entry.position, [0, 0, 0]),
        quaternion: cloneArray(entry.quaternion, [0, 0, 0, 1]),
      }))
    : undefined;

export const setRuntimeTimelineSkeletonCaptureEnabled = (enabled) => {
  runtimeTimelineState.captureSkeletons = Boolean(enabled);
};

export const isRuntimeTimelineSkeletonCaptureEnabled = () =>
  runtimeTimelineState.captureSkeletons;

export const setRuntimeCharacterTimelinePose = ({
  id,
  label,
  position,
  rotation,
  scale,
  locomotionState,
  activeAction,
  animationClipName,
  animationTime,
  animationDuration,
  animationLayers,
  renderPosition,
  renderRotation,
  renderFootY,
  skeletonPose,
  boneOverrides,
  boneMoveOverrides,
}) => {
  if (!id) return;
  runtimeTimelineState.characters[id] = {
    id,
    label: label ?? id,
    position: cloneArray(position, [0, 0, 0]),
    rotation: cloneArray(rotation, [0, Math.PI, 0]),
    scale: cloneArray(scale, [1, 1, 1]),
    locomotionState: locomotionState ?? "idle",
    activeAction,
    animationClipName,
    animationTime: Number.isFinite(animationTime) ? animationTime : undefined,
    animationDuration: Number.isFinite(animationDuration)
      ? animationDuration
      : undefined,
    animationLayers: Array.isArray(animationLayers)
      ? animationLayers.map((layer) => ({
          ...layer,
          time: Number.isFinite(layer?.time) ? layer.time : 0,
          weight: Number.isFinite(layer?.weight) ? layer.weight : 0,
          duration: Number.isFinite(layer?.duration) ? layer.duration : undefined,
        }))
      : undefined,
    renderPosition: Array.isArray(renderPosition)
      ? cloneArray(renderPosition, [0, 0, 0])
      : undefined,
    renderRotation: Array.isArray(renderRotation)
      ? cloneArray(renderRotation, [0, Math.PI, 0])
      : undefined,
    renderFootY: Number.isFinite(renderFootY) ? renderFootY : undefined,
    skeletonPose: cloneSkeletonPose(skeletonPose),
    boneOverrides,
    boneMoveOverrides,
    updatedAt: performance.now(),
  };
  runtimeTimelineState.version += 1;
};

const cloneTimelineCharacter = (character) => ({
  ...character,
  position: cloneArray(character.position, [0, 0, 0]),
  rotation: cloneArray(character.rotation, [0, Math.PI, 0]),
  scale: cloneArray(character.scale, [1, 1, 1]),
  renderPosition: Array.isArray(character.renderPosition)
    ? [...character.renderPosition]
    : undefined,
  renderRotation: Array.isArray(character.renderRotation)
    ? [...character.renderRotation]
    : undefined,
  renderFootY: Number.isFinite(character.renderFootY)
    ? character.renderFootY
    : undefined,
  skeletonPose: cloneSkeletonPose(character.skeletonPose),
  animationLayers: Array.isArray(character.animationLayers)
    ? character.animationLayers.map((layer) => ({ ...layer }))
    : undefined,
});

export const commitRuntimeTimelineCaptureFrame = (camera) => {
  if (!camera) return null;
  const characters = Object.fromEntries(
    Object.entries(runtimeTimelineState.characters).map(([id, character]) => [
      id,
      cloneTimelineCharacter(character),
    ])
  );
  runtimeTimelineState.captureSequence += 1;
  runtimeTimelineState.captureFrame = {
    sequence: runtimeTimelineState.captureSequence,
    camera: {
      ...camera,
      position: cloneArray(camera.position, [0, 20, 30]),
      rotation: cloneArray(camera.rotation, [0, 0, 0]),
      target: cloneArray(camera.target, [0, 7, 0]),
      viewport: Array.isArray(camera.viewport) ? [...camera.viewport] : undefined,
    },
    characters,
    updatedAt: performance.now(),
  };
  return runtimeTimelineState.captureFrame;
};

export const getRuntimeTimelineCaptureFrame = () =>
  runtimeTimelineState.captureFrame;

export const getRuntimeCharacterTimelinePose = (id) =>
  id ? runtimeTimelineState.characters[id] : null;

export const setRuntimeTimelinePlaybackFrame = (frame, options = {}) => {
  runtimeTimelineState.playbackFrame = frame
    ? {
        camera: frame.camera ?? null,
        characters: frame.characters ?? {},
        mode: options.mode ?? "preview",
        updatedAt: performance.now(),
      }
    : null;
  runtimeTimelineState.version += 1;
};

export const clearRuntimeTimelinePlaybackFrame = () => {
  if (!runtimeTimelineState.playbackFrame) return;
  runtimeTimelineState.playbackFrame = null;
  runtimeTimelineState.version += 1;
};

export const getRuntimeTimelinePlaybackFrame = () =>
  runtimeTimelineState.playbackFrame;
