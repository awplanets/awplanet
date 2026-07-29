import {
  createInitialCommandHistory,
  createInitialCommandLog,
  runEngineCommand,
} from "../layers/commands/commandBus";
import {
  TERRAIN_LIBRARY,
  createInitialScene,
} from "../scene/createInitialScene";

export const createInitialEngineState = (overrides = {}) => {
  const baseState = {
    scene: createInitialScene(),
    mode: "select",
    gameplay: {
    status: "idle",
    objectiveLabel: "Generate a map, then press Play.",
    visitedMarkerIds: [],
    collectedTreasure: 0,
    triggeredEncounters: 0,
    totalTreasure: 0,
    totalEncounters: 0,
    lastEvent: "Editor ready.",
    },
    editor: {
    activeTool: "select",
    transformMode: "translate",
    selectedAssetKey: "boulder",
    brushMode: "raise",
    brushSize: 12,
    brushStrength: 0.92,
    },
    commandLog: createInitialCommandLog(),
    history: createInitialCommandHistory(),
  };

  return {
    ...baseState,
    ...overrides,
    gameplay: {
      ...baseState.gameplay,
      ...(overrides.gameplay ?? {}),
    },
    editor: {
      ...baseState.editor,
      ...(overrides.editor ?? {}),
    },
  };
};

const createProjectCommandLog = (label, detail) => [
  {
    id: `project-${Date.now().toString(36)}`,
    label,
    detail,
    time: new Date().toISOString(),
  },
  ...createInitialCommandLog(),
].slice(0, 8);

const normalizeLoadedEngineState = (loadedState = {}) => {
  const baseState = createInitialEngineState();
  const loadedScene = loadedState.scene ?? {};
  const loadedProject = loadedScene.project ?? {};
  const baseScene = baseState.scene.scenes["scene-main"];
  const sourceScenes = loadedScene.scenes ?? baseState.scene.scenes;
  const loadedScenes = Object.fromEntries(
    Object.entries(sourceScenes).map(([sceneId, sourceScene]) => {
      const terrainIsAvailable = Boolean(
        TERRAIN_LIBRARY[sourceScene?.terrainId]
      );
      return [
        sceneId,
        {
          ...baseScene,
          ...sourceScene,
          id: sourceScene?.id ?? sceneId,
          terrainId: terrainIsAvailable ? sourceScene.terrainId : "blank",
          backgroundColor: terrainIsAvailable
            ? sourceScene?.backgroundColor ?? baseScene.backgroundColor
            : baseScene.backgroundColor,
          lighting: {
            ...baseScene.lighting,
            ...(sourceScene?.lighting ?? {}),
          },
          camera: {
            ...baseScene.camera,
            ...(sourceScene?.camera ?? {}),
          },
          terrainFloorColors: {
            ...baseScene.terrainFloorColors,
            ...(sourceScene?.terrainFloorColors ?? {}),
          },
          terrainParameters: {
            ...baseScene.terrainParameters,
            ...(sourceScene?.terrainParameters ?? {}),
          },
          terrainSculptStamps: {
            ...baseScene.terrainSculptStamps,
            ...(sourceScene?.terrainSculptStamps ?? {}),
          },
          timeline: {
            ...baseScene.timeline,
            ...(sourceScene?.timeline ?? {}),
          },
        },
      ];
    })
  );
  const activeSceneId = loadedScenes[loadedScene.activeSceneId]
    ? loadedScene.activeSceneId
    : Object.keys(loadedScenes)[0] ?? baseState.scene.activeSceneId;

  return {
    ...baseState,
    ...loadedState,
    mode: "select",
    scene: {
      ...baseState.scene,
      ...loadedScene,
      activeSceneId,
      scenes: loadedScenes,
      project: {
        ...baseState.scene.project,
        ...loadedProject,
        version: undefined,
      },
    },
    gameplay: {
      ...baseState.gameplay,
      ...(loadedState.gameplay ?? {}),
      status: "idle",
      lastEvent: "Project loaded.",
    },
    editor: {
      ...baseState.editor,
      ...(loadedState.editor ?? {}),
      activeTool: "select",
    },
    commandLog: createProjectCommandLog(
      "Project loaded",
      "A saved project file replaced the current scene state."
    ),
    history: createInitialCommandHistory(),
  };
};

export const engineReducer = (state, action) => {
  if (action.type === "new-project") {
    return {
      ...createInitialEngineState(),
      commandLog: createProjectCommandLog(
        "New project",
        "Created a blank project workspace."
      ),
    };
  }

  if (action.type === "load-project-state") {
    return normalizeLoadedEngineState(action.state);
  }

  return runEngineCommand(state, action);
};
