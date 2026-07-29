import { getEntityObjectClassType } from "../object/objectClassRegistry";
import { getActiveScene } from "../layers/runtime/sceneGraph";

const createTreeNode = ({
  id,
  label,
  type,
  detail,
  depth = 0,
  children = [],
}) => ({
  id,
  label,
  type,
  detail,
  depth,
  children,
});

const createEntityTreeNode = (entity, depth) =>
  createTreeNode({
    id: `entity:${entity.id}`,
    label: entity.label,
    type: getEntityObjectClassType(entity),
    detail: entity.assetKey ?? entity.primitive,
    depth,
  });

export const createSceneDocumentOutline = (sceneState) => {
  const activeScene = getActiveScene(sceneState);
  const entityNodes = activeScene.entityOrder
    .map((entityId) => activeScene.entities[entityId])
    .filter(Boolean)
    .map((entity) => createEntityTreeNode(entity, 2));

  return [
    createTreeNode({
      id: "project",
      label: sceneState.project.name,
      type: "Project",
      detail: sceneState.activeSceneId,
      children: [
        createTreeNode({
          id: `scene:${activeScene.id}`,
          label: activeScene.name,
          type: "Scene",
          detail: activeScene.id,
          depth: 1,
          children: [
            createTreeNode({
              id: "camera",
              label: activeScene.camera?.label ?? "Camera Rig",
              type: "Camera3D",
              detail: activeScene.camera?.mode ?? "orbit",
              depth: 2,
            }),
            ...entityNodes,
          ],
        }),
      ],
    }),
  ];
};

export const flattenSceneDocumentOutline = (nodes) =>
  nodes.flatMap((node) => [
    node,
    ...flattenSceneDocumentOutline(node.children ?? []),
  ]);

export const getSceneDocumentInspectorTarget = ({
  nodeId,
  sceneState,
  terrainLibrary,
}) => {
  const activeScene = getActiveScene(sceneState);

  if (nodeId === "project") {
    return {
      id: "project",
      label: sceneState.project.name,
      classType: "Project",
      values: {
        name: sceneState.project.name,
        activeSceneId: sceneState.activeSceneId,
        sceneCount: Object.keys(sceneState.scenes).length,
      },
    };
  }

  if (nodeId?.startsWith("scene:")) {
    return {
      id: activeScene.id,
      label: activeScene.name,
      classType: "Scene",
      values: {
        id: activeScene.id,
        name: activeScene.name,
        terrainId: activeScene.terrainId,
        backgroundColor: activeScene.backgroundColor,
        floorColor:
          activeScene.terrainFloorColors?.[activeScene.terrainId] ??
          activeScene.floorColor,
        terrainFloorColors: activeScene.terrainFloorColors,
        selectedEntityId: activeScene.selectedEntityId,
        entityCount: activeScene.entityOrder.length,
      },
    };
  }

  if (nodeId === "terrain") {
    const terrain = terrainLibrary[activeScene.terrainId] ?? terrainLibrary.snow;
    const parameters = activeScene.terrainParameters[activeScene.terrainId] ?? {};

    return {
      id: `terrain:${activeScene.terrainId}`,
      label: terrain.label,
      classType: "Terrain3D",
      values: {
        id: activeScene.terrainId,
        label: terrain.label,
        color: terrain.color,
        fog: terrain.fog,
        relief: parameters.relief ?? terrain.relief,
        roughness: parameters.roughness ?? terrain.roughness,
        density: parameters.density ?? terrain.density,
      },
    };
  }

  if (nodeId === "camera") {
    const camera = activeScene.camera ?? {};

    return {
      id: camera.id ?? "camera-main",
      label: camera.label ?? "Camera Rig",
      classType: "Camera3D",
      values: {
        id: camera.id ?? "camera-main",
        label: camera.label ?? "Camera Rig",
        mode: camera.mode ?? "orbit",
        targetEntityId: camera.targetEntityId ?? "hero",
        preset: camera.preset ?? "custom",
        followDistance: camera.followDistance ?? 18,
        followHeight: camera.followHeight ?? 8,
        followSmoothing: camera.followSmoothing ?? 8,
        targetLead: camera.targetLead ?? 0.8,
        shotLateralOffset: camera.shotLateralOffset ?? 0,
        shotPitchOffset: camera.shotPitchOffset ?? 0,
        motionType: camera.motionType ?? "none",
        motionLoop: camera.motionLoop ?? true,
        motionAmplitude: camera.motionAmplitude ?? 0,
        motionSpeed: camera.motionSpeed ?? 0.4,
        motionPhase: camera.motionPhase ?? 0,
        fovSwing: camera.fovSwing ?? 0,
        cameraRoll: camera.cameraRoll ?? 0,
        compositionX: camera.compositionX ?? 0,
        compositionY: camera.compositionY ?? 0,
        pilotLookSpeed: camera.pilotLookSpeed ?? 0.72,
        pilotLookSmoothing: camera.pilotLookSmoothing ?? 6.2,
        pilotSpeed: camera.pilotSpeed ?? 16,
        pilotElevationSpeed: camera.pilotElevationSpeed ?? 16,
        pilotSmoothing: camera.pilotSmoothing ?? 10,
        pilotInputLag: camera.pilotInputLag ?? 0.55,
        pilotSwingAmount: camera.pilotSwingAmount ?? 0.55,
        pilotFov: camera.pilotFov ?? camera.fov ?? 45,
        pilotRoll: camera.pilotRoll ?? 0,
        pilotLockTargetEnabled: camera.pilotLockTargetEnabled ?? false,
        pilotLockTargetEntityId: camera.pilotLockTargetEntityId ?? "hero",
        phonePilotEnabled: camera.phonePilotEnabled ?? false,
        phonePilotLookAmount: camera.phonePilotLookAmount ?? 1,
        phonePilotPitchAmount: camera.phonePilotPitchAmount ?? 0.78,
        phonePilotRollAmount: camera.phonePilotRollAmount ?? 0.28,
        phonePilotSmoothing: camera.phonePilotSmoothing ?? 10,
        phonePilotMoveScale: camera.phonePilotMoveScale ?? 7.5,
        phonePilotHeightAmount: camera.phonePilotHeightAmount ?? 0.65,
        position: camera.position ?? [0, 20, 30],
        target: camera.target ?? [0, 7, 0],
        minDistance: camera.minDistance ?? 0.85,
        maxDistance: camera.maxDistance ?? 90,
      },
    };
  }

  if (nodeId?.startsWith("entity:")) {
    const entityId = nodeId.replace("entity:", "");
    const entity = activeScene.entities[entityId];
    if (!entity) return null;

    return {
      id: entity.id,
      label: entity.label,
      classType: getEntityObjectClassType(entity),
      values: {
        id: entity.id,
        label: entity.label,
        assetKey: entity.assetKey ?? "uploadedHero",
        modelUrl: entity.modelUrl,
        targetHeight: entity.targetHeight,
        primitive: entity.primitive,
        color: entity.color,
        position: entity.position,
        rotation: entity.rotation,
        scale: entity.scale,
        collider: entity.collider,
        collisionEnabled: entity.collisionEnabled ?? Boolean(entity.collider),
        boneRigEnabled: entity.boneRigEnabled,
        boneRigTransformMode: entity.boneRigTransformMode,
        selectedBoneName: entity.selectedBoneName,
        boneOverrides: entity.boneOverrides,
        boneMoveOverrides: entity.boneMoveOverrides,
        boneMoveProfiles: entity.boneMoveProfiles,
      },
    };
  }

  return null;
};
