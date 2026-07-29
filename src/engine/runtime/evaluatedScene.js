import { getActiveScene } from "../scene/createInitialScene";
import { getRuntimeTimelinePlaybackFrame } from "./runtimeTimelineState";

const cloneArray = (value, fallback) =>
  Array.isArray(value) ? [...value] : fallback;

export const sanitizeEvaluatedCamera = (camera = {}) => {
  const safeCamera = { ...camera };
  delete safeCamera.phonePilotEnabled;
  delete safeCamera.phonePilotStartPose;
  return {
    ...safeCamera,
    phonePilotEnabled: false,
    phonePilotStartPose: null,
  };
};

const mergeTimelineCharacter = (entity, patch) => {
  if (!entity || !patch) return entity;
  return {
    ...entity,
    position: cloneArray(patch.position, entity.position),
    rotation: cloneArray(patch.rotation, entity.rotation),
    scale: cloneArray(patch.scale, entity.scale),
    locomotionState: patch.locomotionState ?? entity.locomotionState,
    activeAction: patch.activeAction ?? entity.activeAction,
    animationClipName: patch.animationClipName ?? entity.animationClipName,
    animationTime: patch.animationTime ?? entity.animationTime,
    animationDuration: patch.animationDuration ?? entity.animationDuration,
    boneOverrides: patch.boneOverrides ?? entity.boneOverrides,
    boneMoveOverrides: patch.boneMoveOverrides ?? entity.boneMoveOverrides,
  };
};

export const createEvaluatedScene = (baseScene, frame) => {
  if (!baseScene) return baseScene;

  const snapshot = frame?.sceneSnapshot ?? baseScene;
  const characterPatches = frame?.characters ?? {};
  const hasCharacterPatches = Object.keys(characterPatches).length > 0;
  const hasCameraPatch = Boolean(frame?.camera);

  if (!hasCameraPatch && !hasCharacterPatches && snapshot === baseScene) {
    return baseScene;
  }

  const nextEntities = hasCharacterPatches
    ? Object.entries(characterPatches).reduce(
        (entities, [entityId, patch]) => {
          if (!entities[entityId]) return entities;
          return {
            ...entities,
            [entityId]: mergeTimelineCharacter(entities[entityId], patch),
          };
        },
        snapshot.entities
      )
    : snapshot.entities;

  return {
    ...snapshot,
    camera: hasCameraPatch
      ? {
          ...(snapshot.camera ?? {}),
          ...sanitizeEvaluatedCamera(frame.camera),
        }
      : snapshot.camera,
    entities: nextEntities,
  };
};

export const getEvaluatedActiveScene = (
  sceneState,
  frame = getRuntimeTimelinePlaybackFrame()
) => createEvaluatedScene(getActiveScene(sceneState), frame);
