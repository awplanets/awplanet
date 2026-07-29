export const createEntityId = (assetKey) =>
  `${assetKey}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

export const DEFAULT_SCENE_LIGHTING = {
  height: 18,
  intensity: 1,
  angle: 40,
};

export const createTransform = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) => ({
  position,
  rotation,
  scale,
});

export const createCharacterEntity = (characterAsset) => ({
  ...characterAsset,
  locomotionState: "idle",
  collisionEnabled: characterAsset.collisionEnabled ?? true,
  color: characterAsset.color ?? "#173345",
  ...createTransform({
    position: [0, 0, 0],
    rotation: [0, Math.PI, 0],
  }),
});

export const createEntityFromAsset = (assetKey, asset, overrides = {}) => ({
  id: overrides.id ?? createEntityId(assetKey),
  label: overrides.label ?? asset.label,
  assetKey,
  type: asset.type,
  primitive: asset.primitive,
  modelUrl: asset.modelUrl,
  animationSet: asset.animationSet,
  targetHeight: asset.targetHeight,
  color: asset.color,
  position: overrides.position ?? [0, 0, -4],
  rotation:
    overrides.rotation ??
    (asset.primitive === "character" ? [0, Math.PI, 0] : [0, 0, 0]),
  scale: overrides.scale ?? asset.scale,
  terrainId: overrides.terrainId,
  collider: asset.collider,
  collisionEnabled: overrides.collisionEnabled ?? asset.collisionEnabled ?? Boolean(asset.collider),
  locomotionState:
    overrides.locomotionState ?? asset.locomotionState ?? (asset.primitive === "character" ? "idle" : undefined),
});

export const createSceneState = ({
  id = "scene-main",
  name = "blank world",
  terrainLibrary,
  characterAsset,
} = {}) => ({
  id,
  name,
  terrainId: "blank",
  backgroundColor: "#696969",
  lighting: {
    ...DEFAULT_SCENE_LIGHTING,
  },
  terrainFloorColors: Object.fromEntries(
    Object.entries(terrainLibrary).map(([terrainId, terrain]) => [
      terrainId,
      terrain.floorColor ?? terrain.color,
    ])
  ),
  terrainParameters: Object.fromEntries(
    Object.entries(terrainLibrary).map(([terrainId, terrain]) => [
      terrainId,
      {
        relief: terrain.relief,
        roughness: terrain.roughness,
        density: terrain.density,
        ...(terrain.grassHeight !== undefined
          ? {
              grassHeight: terrain.grassHeight,
              wind: terrain.wind,
              colorVariation: terrain.colorVariation,
            }
          : {}),
      },
    ])
  ),
  camera: {
    id: "camera-main",
    label: "Camera Rig",
    mode: "third-person",
    manual: false,
    targetEntityId: "hero",
    followDistance: 18,
    followHeight: 8,
    followSmoothing: 8,
    lookHeight: 3.4,
    targetLead: 0.8,
    shotYawOffset: 0,
    shotPitchOffset: 0,
    shotLateralOffset: 0,
    motionType: "none",
    motionLoop: true,
    motionAmplitude: 0,
    motionSpeed: 0.4,
    motionPhase: 0,
    fovSwing: 0,
    cameraRoll: 0,
    compositionX: 0,
    compositionY: 0,
    pilotLockTargetEnabled: false,
    pilotLockTargetEntityId: "hero",
    pilotSpeed: 16,
    pilotElevationSpeed: 16,
    pilotLookSpeed: 0.72,
    pilotLookSmoothing: 6.2,
    pilotSmoothing: 10,
    pilotInputLag: 0.55,
    pilotSwingAmount: 0.55,
    pilotFov: 45,
    pilotRoll: 0,
    phonePilotEnabled: false,
    phonePilotLookAmount: 1,
    phonePilotPitchAmount: 0.78,
    phonePilotRollAmount: 0.28,
    phonePilotSmoothing: 10,
    phonePilotMoveScale: 7.5,
    phonePilotHeightAmount: 0.65,
    position: [0, 20, 30],
    target: [0, 7, 0],
    minDistance: 0.85,
    maxDistance: 90,
    maxPolarAngle: Math.PI * 0.49,
  },
  terrainSculptStamps: {},
  timeline: {
    clips: [],
  },
  entities: {
    hero: createCharacterEntity(characterAsset),
  },
  entityOrder: ["hero"],
  selectedEntityId: "hero",
});

export const createInitialSceneState = ({
  terrainLibrary,
  characterAsset,
}) => ({
  project: {
    name: "project 1",
  },
  activeSceneId: "scene-main",
  scenes: {
    "scene-main": createSceneState({
      id: "scene-main",
      name: "blank world",
      terrainLibrary,
      characterAsset,
    }),
  },
});

export const getActiveScene = (sceneState) =>
  sceneState.scenes[sceneState.activeSceneId];

export const updateActiveScene = (sceneState, updater) => {
  const activeScene = getActiveScene(sceneState);
  const nextScene = updater(activeScene);

  return {
    ...sceneState,
    scenes: {
      ...sceneState.scenes,
      [activeScene.id]: nextScene,
    },
  };
};

export const getActiveTerrain = (sceneState, terrainLibrary) => {
  const scene = getActiveScene(sceneState);
  return terrainLibrary[scene.terrainId] ?? terrainLibrary.blank;
};
