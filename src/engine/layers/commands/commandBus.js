import {
  CHARACTER_LIBRARY,
  ENTITY_LIBRARY,
  TERRAIN_LIBRARY,
  getEntityAsset,
} from "../assets/assetRegistry";
import {
  createProceduralMap,
  isGeneratedEntityId,
} from "../../generation/proceduralMaps";
import { createOsmMapFromGeoData } from "../../generation/osmMapGenerator";
import {
  createEntityId,
  createEntityFromAsset,
  createSceneState,
  getActiveScene,
  updateActiveScene,
} from "../runtime/sceneGraph";
import { createSculptStamp } from "../../terrain/terrainSculpt";

export const createInitialCommandLog = () => [
  {
    id: "boot",
    label: "Engine boot",
    detail: "Runtime, asset pipeline, and command bus are online.",
    time: new Date().toISOString(),
  },
];

export const createInitialCommandHistory = () => ({
  past: [],
  future: [],
  limit: 30,
});

const UNDOABLE_COMMAND_TYPES = new Set([
  "set-mode",
  "set-project-property",
  "set-scene-property",
  "add-scene",
  "add-timeline-clips",
  "move-timeline-clip",
  "delete-timeline-clip",
  "sculpt-terrain",
  "set-camera-property",
  "set-camera-preset",
  "switch-terrain",
  "set-terrain-parameter",
  "generate-map",
  "generate-osm-map",
  "add-entity",
  "duplicate-entity",
  "set-entity-property",
  "transform-entity",
  "delete-selected",
]);

const cloneSerializableValue = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const createHistorySnapshot = (state) => ({
  scene: state.scene,
  mode: state.mode,
  gameplay: state.gameplay,
  editor: state.editor,
});

const TIMELINE_OVERLAP_EPSILON = 0.001;

const roundTimelineTime = (value) => Math.round(Math.max(0, value) * 100) / 100;

const getTimelineClipEnd = (clip) =>
  (clip.start ?? 0) + Math.max(0, clip.duration ?? 0);

const timelineRangesOverlap = (start, duration, clip) => {
  const end = start + Math.max(0, duration);
  const clipStart = clip.start ?? 0;
  const clipEnd = getTimelineClipEnd(clip);
  return (
    start < clipEnd - TIMELINE_OVERLAP_EPSILON &&
    end > clipStart + TIMELINE_OVERLAP_EPSILON
  );
};

const findNonOverlappingTimelineStart = (
  clips,
  clip,
  requestedStart,
  { maxEnd = Infinity, fallbackStart = clip.start ?? 0 } = {}
) => {
  const duration = Math.max(0.01, clip.duration ?? 0);
  const sameTrackClips = clips.filter(
    (existingClip) =>
      existingClip.trackId === clip.trackId && existingClip.id !== clip.id
  );
  const maxStart = Number.isFinite(maxEnd)
    ? Math.max(0, maxEnd - duration)
    : Infinity;
  const desiredStart = Math.max(0, requestedStart ?? fallbackStart ?? 0);
  const candidateStarts = [
    desiredStart,
    ...sameTrackClips.flatMap((existingClip) => [
      (existingClip.start ?? 0) - duration,
      getTimelineClipEnd(existingClip),
    ]),
  ];

  const uniqueCandidates = [
    ...new Set(
      candidateStarts
        .filter(Number.isFinite)
        .map((candidate) => roundTimelineTime(candidate))
    ),
  ]
    .filter((candidate) => candidate >= 0 && candidate <= maxStart)
    .sort(
      (a, b) =>
        Math.abs(a - desiredStart) - Math.abs(b - desiredStart) || a - b
    );

  const legalCandidate = uniqueCandidates.find(
    (candidate) =>
      !sameTrackClips.some((existingClip) =>
        timelineRangesOverlap(candidate, duration, existingClip)
      )
  );
  if (Number.isFinite(legalCandidate)) return legalCandidate;

  const afterLastClip = sameTrackClips.reduce(
    (max, existingClip) => Math.max(max, getTimelineClipEnd(existingClip)),
    0
  );
  const afterLastCandidate = roundTimelineTime(afterLastClip);
  if (
    !sameTrackClips.some((existingClip) =>
      timelineRangesOverlap(afterLastCandidate, duration, existingClip)
    )
  ) {
    return afterLastCandidate;
  }

  return roundTimelineTime(fallbackStart);
};

const findSharedTimelineStart = (
  existingClips,
  incomingClips,
  requestedStart,
  { maxEnd = Infinity } = {}
) => {
  if (incomingClips.length === 0) return Math.max(0, requestedStart ?? 0);

  const desiredStart = Math.max(0, requestedStart ?? 0);
  const relevantExistingClips = existingClips.filter((existingClip) =>
    incomingClips.some((clip) => clip.trackId === existingClip.trackId)
  );
  const maxDuration = incomingClips.reduce(
    (maximum, clip) => Math.max(maximum, Math.max(0.01, clip.duration ?? 0)),
    0.01
  );
  const maxStart = Number.isFinite(maxEnd)
    ? Math.max(0, maxEnd - maxDuration)
    : Infinity;
  const isLegalStart = (candidate) =>
    incomingClips.every((incomingClip) => {
      const duration = Math.max(0.01, incomingClip.duration ?? 0);
      return !relevantExistingClips.some(
        (existingClip) =>
          existingClip.trackId === incomingClip.trackId &&
          timelineRangesOverlap(candidate, duration, existingClip)
      );
    });

  const candidates = [
    desiredStart,
    ...incomingClips.flatMap((incomingClip) =>
      relevantExistingClips
        .filter((existingClip) => existingClip.trackId === incomingClip.trackId)
        .flatMap((existingClip) => [
          (existingClip.start ?? 0) - Math.max(0.01, incomingClip.duration ?? 0),
          getTimelineClipEnd(existingClip),
        ])
    ),
  ];
  const legalCandidate = [...new Set(
    candidates
      .filter(Number.isFinite)
      .map((candidate) => roundTimelineTime(candidate))
  )]
    .filter((candidate) => candidate >= 0 && candidate <= maxStart)
    .sort(
      (a, b) =>
        Math.abs(a - desiredStart) - Math.abs(b - desiredStart) || a - b
    )
    .find(isLegalStart);
  if (Number.isFinite(legalCandidate)) return legalCandidate;

  const afterLastClip = roundTimelineTime(
    relevantExistingClips.reduce(
      (maximum, existingClip) => Math.max(maximum, getTimelineClipEnd(existingClip)),
      0
    )
  );
  if (afterLastClip <= maxStart && isLegalStart(afterLastClip)) {
    return afterLastClip;
  }

  return Math.min(maxStart, roundTimelineTime(desiredStart));
};

const getFiniteVector = (value, length) =>
  Array.isArray(value) &&
  value.length >= length &&
  value.slice(0, length).every((entry) => Number.isFinite(Number(entry)))
    ? value.slice(0, length).map(Number)
    : null;

const sanitizeBoneOverrideMap = (overrides, minimumLength) => {
  if (!overrides || typeof overrides !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(overrides).filter(
      ([, value]) =>
        Array.isArray(value) &&
        value.length >= minimumLength &&
        value.every((entry) => Number.isFinite(Number(entry)))
    )
  );
};

const sanitizeTimelineCameraFrame = (camera = {}) => {
  const safeCamera = { ...camera };
  delete safeCamera.phonePilotEnabled;
  delete safeCamera.phonePilotStartPose;
  ["position", "rotation", "target"].forEach((property) => {
    const vector = getFiniteVector(camera[property], 3);
    if (vector) safeCamera[property] = vector;
    else delete safeCamera[property];
  });
  const viewport = getFiniteVector(camera.viewport, 2);
  if (viewport && viewport.every((entry) => entry > 0)) {
    safeCamera.viewport = viewport;
  } else {
    delete safeCamera.viewport;
  }
  const fov = Number(camera.fov);
  if (Number.isFinite(fov)) safeCamera.fov = Math.max(10, Math.min(120, fov));
  else delete safeCamera.fov;
  const aspect = Number(camera.aspect);
  if (Number.isFinite(aspect) && aspect > 0.01) safeCamera.aspect = aspect;
  else delete safeCamera.aspect;
  return {
    ...safeCamera,
    phonePilotEnabled: false,
    phonePilotStartPose: null,
  };
};

const getGeneratedScenePatch = (activeScene, generatedMap) => {
  const preservedEntityOrder = activeScene.entityOrder.filter(
    (entityId) => !isGeneratedEntityId(entityId)
  );
  const preservedEntities = Object.fromEntries(
    preservedEntityOrder
      .map((entityId) => [entityId, activeScene.entities[entityId]])
      .filter(([, entity]) => Boolean(entity))
  );
  const generatedEntities = Object.fromEntries(
    generatedMap.entities.map((entity) => [entity.id, entity])
  );

  const terrainParameters = generatedMap.terrainId
    ? {
        ...activeScene.terrainParameters,
        [generatedMap.terrainId]: {
          ...(activeScene.terrainParameters?.[generatedMap.terrainId] ?? {}),
          ...(generatedMap.terrainParameters ?? {}),
        },
      }
    : activeScene.terrainParameters;

  return {
    generation: {
      preset: generatedMap.preset,
      label: generatedMap.label,
      seed: generatedMap.seed,
      config: generatedMap.config,
      entityCount: generatedMap.entities.length,
    },
    terrainId: generatedMap.terrainId ?? activeScene.terrainId,
    terrainParameters,
    entities: {
      ...preservedEntities,
      ...generatedEntities,
    },
    entityOrder: [
      ...preservedEntityOrder,
      ...generatedMap.entities.map((entity) => entity.id),
    ],
  };
};

const pushUndoSnapshot = (state) => ({
  ...state,
  history: {
    ...state.history,
    past: [
      createHistorySnapshot(state),
      ...(state.history?.past ?? []),
    ].slice(0, state.history?.limit ?? 30),
    future: [],
  },
});

const appendLog = (state, entry) => ({
  ...state,
  commandLog: [
    {
      id: `${entry.type}-${Date.now().toString(36)}`,
      label: entry.label,
      detail: entry.detail,
      time: new Date().toISOString(),
    },
    ...state.commandLog,
  ].slice(0, 8),
});

const undoCommand = (state) => {
  const [previous, ...past] = state.history?.past ?? [];
  if (!previous) return state;

  return appendLog(
    {
      ...state,
      scene: previous.scene,
      mode: previous.mode,
      gameplay: previous.gameplay ?? state.gameplay,
      editor: previous.editor ?? state.editor,
      history: {
        ...state.history,
        past,
        future: [
          createHistorySnapshot(state),
          ...(state.history?.future ?? []),
        ].slice(0, state.history?.limit ?? 30),
      },
    },
    {
      type: "undo",
      label: "Undo",
      detail: "Reverted the last engine transaction.",
    }
  );
};

const redoCommand = (state) => {
  const [next, ...future] = state.history?.future ?? [];
  if (!next) return state;

  return appendLog(
    {
      ...state,
      scene: next.scene,
      mode: next.mode,
      gameplay: next.gameplay ?? state.gameplay,
      editor: next.editor ?? state.editor,
      history: {
        ...state.history,
        past: [
          createHistorySnapshot(state),
          ...(state.history?.past ?? []),
        ].slice(0, state.history?.limit ?? 30),
        future,
      },
    },
    {
      type: "redo",
      label: "Redo",
      detail: "Reapplied the next engine transaction.",
    }
  );
};

const commandHandlers = {
  "set-editor-tool": (state, action) => ({
    ...state,
    editor: {
      ...(state.editor ?? {}),
      activeTool: action.tool ?? state.editor?.activeTool ?? "select",
      transformMode:
        action.transformMode ?? state.editor?.transformMode ?? "translate",
      selectedAssetKey:
        action.selectedAssetKey ?? state.editor?.selectedAssetKey ?? "boulder",
      brushMode: action.brushMode ?? state.editor?.brushMode ?? "raise",
      brushSize: action.brushSize ?? state.editor?.brushSize ?? 12,
      brushStrength: action.brushStrength ?? state.editor?.brushStrength ?? 0.92,
    },
  }),

  "set-mode": (state, action) =>
    appendLog(
      {
        ...state,
        mode: action.mode,
      },
      {
        type: action.type,
        label: "Mode changed",
        detail: `Editor mode is now ${action.mode}.`,
      }
    ),

  "start-play-session": (state) => {
    const activeScene = getActiveScene(state.scene);
    const markers = activeScene.entityOrder
      .map((entityId) => activeScene.entities[entityId])
      .filter((entity) => entity?.primitive?.endsWith("-marker"));
    const spawn =
      markers.find((entity) => entity.primitive === "safe-marker") ??
      markers.find((entity) => entity.primitive === "entrance-marker");
    const exit = markers.find((entity) => entity.primitive === "exit-marker");
    const treasures = markers.filter((entity) => entity.primitive === "treasure-marker");
    const encounters = markers.filter((entity) => entity.primitive === "encounter-marker");
    const objectives = markers.filter((entity) =>
      ["objective-marker", "quest-marker"].includes(entity.primitive)
    );
    const scene = updateActiveScene(state.scene, (sceneToUpdate) => {
      const hero = sceneToUpdate.entities.hero;
      if (!hero) return sceneToUpdate;
      return {
        ...sceneToUpdate,
        selectedEntityId: null,
        entities: {
          ...sceneToUpdate.entities,
          hero: {
            ...hero,
            locomotionState: "idle",
            teleportToken: `play-${Date.now()}`,
          },
        },
      };
    });

    return appendLog(
      {
        ...state,
        mode: "play",
        editor: {
          ...(state.editor ?? {}),
          activeTool: "select",
        },
        scene,
        gameplay: {
          status: "running",
          objectiveLabel: exit
            ? `Reach ${exit.label}`
            : objectives[0]
              ? `Find ${objectives[0].label}`
              : "Explore the generated map.",
          exitEntityId: exit?.id ?? null,
          visitedMarkerIds: spawn ? [spawn.id] : [],
          collectedTreasure: 0,
          triggeredEncounters: 0,
          totalTreasure: treasures.length,
          totalEncounters: encounters.length,
          lastEvent: spawn ? `Started at ${spawn.label}.` : "Play session started.",
        },
      },
      {
        type: "start-play-session",
        label: "Play started",
        detail: "Runtime play mode is active.",
      }
    );
  },

  "stop-play-session": (state, action) =>
    appendLog(
      {
        ...state,
        mode: "select",
        editor: {
          ...(state.editor ?? {}),
          activeTool: "select",
        },
        scene: updateActiveScene(state.scene, (activeScene) => {
          const hero = activeScene.entities.hero;
          if (!hero) return activeScene;
          return {
            ...activeScene,
            entities: {
              ...activeScene.entities,
              hero: {
                ...hero,
                ...(action.heroTransform ?? {}),
                locomotionState: "idle",
              },
            },
          };
        }),
        gameplay: {
          ...state.gameplay,
          status: "idle",
          lastEvent: "Returned to edit mode.",
        },
      },
      {
        type: "stop-play-session",
        label: "Play stopped",
        detail: "Runtime play mode ended.",
      }
    ),

  "start-pilot-session": (state) =>
    appendLog(
      {
        ...state,
        mode: "pilot",
        editor: {
          ...(state.editor ?? {}),
          activeTool: "select",
        },
        scene: updateActiveScene(state.scene, (activeScene) => ({
          ...activeScene,
          selectedEntityId: null,
        })),
        gameplay: {
          ...state.gameplay,
          status: "pilot",
          objectiveLabel: "Pilot the camera while the scene keeps performing.",
          lastEvent: "Camera pilot mode is active.",
        },
      },
      {
        type: "start-pilot-session",
        label: "Pilot started",
        detail: "WASD, QE, Shift, Alt, and mouse now drive the camera rig.",
      }
    ),

  "stop-pilot-session": (state) =>
    appendLog(
      {
        ...state,
        mode: "select",
        editor: {
          ...(state.editor ?? {}),
          activeTool: "select",
        },
        gameplay: {
          ...state.gameplay,
          status: "idle",
          lastEvent: "Returned from pilot mode.",
        },
      },
      {
        type: "stop-pilot-session",
        label: "Pilot stopped",
        detail: "Camera pilot mode ended.",
      }
    ),

  "set-hero-runtime-transform": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const hero = activeScene.entities.hero;
      if (!hero) return activeScene;

      return {
        ...activeScene,
        entities: {
          ...activeScene.entities,
          hero: {
            ...hero,
            position: action.position ?? hero.position,
            rotation: action.rotation ?? hero.rotation,
            locomotionState: action.locomotionState ?? hero.locomotionState ?? "idle",
          },
        },
      };
    });

    return {
      ...state,
      scene,
    };
  },

  "collect-gameplay-marker": (state, action) => {
    const activeScene = getActiveScene(state.scene);
    const marker = activeScene.entities[action.entityId];
    if (!marker || state.gameplay?.visitedMarkerIds?.includes(marker.id)) {
      return state;
    }

    const primitive = marker.primitive;
    const nextVisited = [...(state.gameplay?.visitedMarkerIds ?? []), marker.id];
    if (primitive === "exit-marker" && activeScene.generation?.preset === "maze") {
      const nextSeed = `maze-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const generatedMap = createProceduralMap(
        "maze",
        nextSeed,
        activeScene.generation.config
      );
      const nextEntrance =
        generatedMap.entities.find((entity) => entity.primitive === "safe-marker") ??
        generatedMap.entities.find((entity) => entity.primitive === "entrance-marker");
      const nextExit = generatedMap.entities.find(
        (entity) => entity.primitive === "exit-marker"
      );
      const spawnPosition = nextEntrance?.position ?? [0, 0, 0];
      const scene = updateActiveScene(state.scene, (sceneToUpdate) => {
        const generatedPatch = getGeneratedScenePatch(sceneToUpdate, generatedMap);
        const hero = generatedPatch.entities.hero;

        return {
          ...sceneToUpdate,
          ...generatedPatch,
          entities: {
            ...generatedPatch.entities,
            ...(hero
              ? {
                  hero: {
                    ...hero,
                    position: [spawnPosition[0], 0, spawnPosition[2]],
                    rotation: [0, Math.PI, 0],
                    locomotionState: "idle",
                    teleportToken: `maze-${nextSeed}`,
                  },
                }
              : {}),
          },
          selectedEntityId: null,
        };
      });

      return appendLog(
        {
          ...state,
          scene,
          gameplay: {
            ...state.gameplay,
            status: "running",
            objectiveLabel: nextExit
              ? `Reach ${nextExit.label}`
              : "Find the next dungeon exit.",
            exitEntityId: nextExit?.id ?? null,
            visitedMarkerIds: nextEntrance ? [nextEntrance.id] : [],
            lastEvent: `Entered a new maze seed: ${generatedMap.seed}.`,
          },
        },
        {
          type: action.type,
          label: "Maze advanced",
          detail: `Generated the next maze from seed ${generatedMap.seed}.`,
        }
      );
    }

    const completed = primitive === "exit-marker";
    const collectedTreasure =
      (state.gameplay?.collectedTreasure ?? 0) +
      (primitive === "treasure-marker" ? 1 : 0);
    const triggeredEncounters =
      (state.gameplay?.triggeredEncounters ?? 0) +
      (primitive === "encounter-marker" ? 1 : 0);
    const label =
      primitive === "treasure-marker"
        ? `Collected ${marker.label}.`
        : primitive === "encounter-marker"
          ? `Encountered ${marker.label}.`
        : primitive === "exit-marker"
          ? `Reached ${marker.label}.`
        : `Discovered ${marker.label}.`;

    return appendLog(
      {
        ...state,
        gameplay: {
          ...state.gameplay,
          status: completed ? "complete" : "running",
          visitedMarkerIds: nextVisited,
          collectedTreasure,
          triggeredEncounters,
          lastEvent: completed ? "Map objective complete." : label,
        },
      },
      {
        type: action.type,
        label: completed ? "Objective complete" : "Gameplay marker",
        detail: label,
      }
    );
  },

  "set-project-property": (state, action) => {
    const scene = {
      ...state.scene,
      project: {
        ...state.scene.project,
        [action.property]: action.value,
      },
    };

    if (action.transient) {
      return {
        ...state,
        scene,
      };
    }

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Project property",
        detail: `project.${action.property} updated.`,
      }
    );
  },

  "set-scene-property": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      [action.property]: action.value,
    }));

    if (action.transient) {
      return {
        ...state,
        scene,
      };
    }

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Scene property",
        detail: `scene.${action.property} updated.`,
      }
    );
  },

  "add-scene": (state, action) => {
    const existingSceneIds = Object.keys(state.scene.scenes ?? {});
    const nextIndex = existingSceneIds.length + 1;
    let nextId = `scene-${nextIndex}`;
    let suffix = nextIndex;
    while (state.scene.scenes[nextId]) {
      suffix += 1;
      nextId = `scene-${suffix}`;
    }

    const nextScene = createSceneState({
      id: nextId,
      name: action.name ?? `blank world ${suffix}`,
      terrainLibrary: TERRAIN_LIBRARY,
      characterAsset: CHARACTER_LIBRARY.uploadedHero,
    });

    return appendLog(
      {
        ...state,
        scene: {
          ...state.scene,
          activeSceneId: nextId,
          scenes: {
            ...state.scene.scenes,
            [nextId]: nextScene,
          },
        },
        mode: "select",
        editor: {
          ...state.editor,
          activeTool: "select",
        },
      },
      {
        type: action.type,
        label: "Scene added",
        detail: `${nextScene.name} created.`,
      }
    );
  },

  "switch-scene": (state, action) => {
    const nextScene = state.scene.scenes?.[action.sceneId];
    if (!nextScene || action.sceneId === state.scene.activeSceneId) return state;

    return appendLog(
      {
        ...state,
        scene: {
          ...state.scene,
          activeSceneId: action.sceneId,
        },
        mode: "select",
        editor: {
          ...state.editor,
          activeTool: "select",
        },
      },
      {
        type: action.type,
        label: "Scene switched",
        detail: `${nextScene.name} is now active.`,
      }
    );
  },

  "add-timeline-clips": (state, action) => {
    const clips = action.clips?.filter(Boolean) ?? [];
    if (clips.length === 0) return state;

    const scene = updateActiveScene(state.scene, (activeScene) => {
      const existingClips = activeScene.timeline?.clips ?? [];
      const nextClips = [...existingClips];
      const takeGroups = clips.reduce((groups, clip) => {
        const key = clip.takeId ?? clip.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(clip);
        return groups;
      }, new Map());

      takeGroups.forEach((takeClips) => {
        const requestedStart = takeClips[0]?.start ?? 0;
        const sharedStart = findSharedTimelineStart(
          nextClips,
          takeClips,
          requestedStart,
          { maxEnd: action.timelineDuration }
        );
        takeClips.forEach((clip) => {
          nextClips.push({
            ...clip,
            // Camera and character tracks from one recording are one take.
            // Moving them independently destroys their temporal relationship.
            start: sharedStart,
          });
        });
      });

      return {
        ...activeScene,
        timeline: {
          ...(activeScene.timeline ?? {}),
          clips: nextClips,
        },
      };
    });

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Timeline recorded",
        detail: `${clips.length} clip${clips.length === 1 ? "" : "s"} added.`,
      }
    );
  },

  "move-timeline-clip": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const clips = activeScene.timeline?.clips ?? [];
      const targetClip = clips.find((clip) => clip.id === action.clipId);
      const nextStart = targetClip
        ? findNonOverlappingTimelineStart(clips, targetClip, action.start, {
            maxEnd: action.timelineDuration,
            fallbackStart: targetClip.start ?? 0,
          })
        : Math.max(0, action.start ?? 0);

      return {
        ...activeScene,
        timeline: {
          ...(activeScene.timeline ?? {}),
          clips: clips.map((clip) =>
            clip.id === action.clipId ? { ...clip, start: nextStart } : clip
          ),
        },
      };
    });

    if (action.transient) {
      return {
        ...state,
        scene,
      };
    }

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Timeline clip moved",
        detail: `${action.clipId} moved to ${Math.max(0, action.start ?? 0).toFixed(2)}s.`,
      }
    );
  },

  "delete-timeline-clip": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      timeline: {
        ...(activeScene.timeline ?? {}),
        clips: (activeScene.timeline?.clips ?? []).filter(
          (clip) => clip.id !== action.clipId
        ),
      },
    }));

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Timeline clip deleted",
        detail: `${action.clipId} removed.`,
      }
    );
  },

  "apply-timeline-frame": (state, action) => {
    const frame = action.frame ?? {};
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const nextEntities = { ...activeScene.entities };
      Object.entries(frame.characters ?? {}).forEach(([entityId, patch]) => {
        const entity = nextEntities[entityId];
        if (!entity) return;
        const position = getFiniteVector(patch.position, 3);
        const rotation = getFiniteVector(patch.rotation, 3);
        const scale = getFiniteVector(patch.scale, 3);
        const animationTime = Number(patch.animationTime);
        const animationDuration = Number(patch.animationDuration);
        const boneOverrides = sanitizeBoneOverrideMap(patch.boneOverrides, 3);
        const boneMoveOverrides = sanitizeBoneOverrideMap(
          patch.boneMoveOverrides,
          3
        );
        nextEntities[entityId] = {
          ...entity,
          position: position ?? entity.position,
          rotation: rotation ?? entity.rotation,
          scale:
            scale?.every((entry) => Math.abs(entry) > 0.0001)
              ? scale
              : entity.scale,
          locomotionState: patch.locomotionState ?? entity.locomotionState,
          activeAction: patch.activeAction ?? entity.activeAction,
          animationClipName: patch.animationClipName ?? entity.animationClipName,
          animationTime: Number.isFinite(animationTime)
            ? animationTime
            : entity.animationTime,
          animationDuration: Number.isFinite(animationDuration)
            ? animationDuration
            : entity.animationDuration,
          boneOverrides: boneOverrides ?? entity.boneOverrides,
          boneMoveOverrides: boneMoveOverrides ?? entity.boneMoveOverrides,
        };
      });

      return {
        ...activeScene,
        camera: frame.camera
          ? {
              ...activeScene.camera,
              ...sanitizeTimelineCameraFrame(frame.camera),
            }
          : activeScene.camera,
        entities: nextEntities,
      };
    });

    return {
      ...state,
      scene,
    };
  },

  "apply-timeline-camera-frame": (state, action) => {
    const frame = action.frame ?? {};
    if (!frame.camera) return state;

    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      camera: {
        ...activeScene.camera,
        ...sanitizeTimelineCameraFrame(frame.camera),
      },
    }));

    return {
      ...state,
      scene,
    };
  },

  "set-camera-property": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      camera: {
        ...activeScene.camera,
        [action.property]: action.value,
      },
    }));

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Camera property",
        detail: `camera.${action.property} updated.`,
      }
    );
  },

  "set-camera-preset": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      camera: {
        ...activeScene.camera,
        ...action.camera,
        preset: action.preset,
      },
    }));

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Camera preset",
        detail: `Camera preset changed to ${action.preset}.`,
      }
    );
  },

  "switch-terrain": (state, action) => {
    const terrainId = TERRAIN_LIBRARY[action.terrainId]
      ? action.terrainId
      : "blank";
    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      terrainId,
      selectedEntityId: null,
    }));

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Terrain switched",
        detail: `Active terrain changed to ${terrainId}.`,
      }
    );
  },

  "set-terrain-parameter": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const terrainParameters =
        activeScene.terrainParameters[action.terrainId] ?? {};

      return {
        ...activeScene,
        terrainParameters: {
          ...activeScene.terrainParameters,
          [action.terrainId]: {
            ...terrainParameters,
            [action.parameter]: action.value,
          },
        },
      };
    });

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Terrain parameter",
        detail: `${action.terrainId}.${action.parameter} = ${action.value}`,
      }
    );
  },

  "generate-map": (state, action) => {
    const seed = action.seed ?? `${action.preset}-${Date.now()}`;
    const generatedMap = createProceduralMap(action.preset, seed, action.config);
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const generatedPatch = getGeneratedScenePatch(activeScene, generatedMap);

      return {
        ...activeScene,
        ...generatedPatch,
        selectedEntityId: null,
      };
    });

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Map generated",
        detail: `${generatedMap.label} generated with ${generatedMap.entities.length} nodes from seed ${generatedMap.seed}.`,
      }
    );
  },

  "generate-osm-map": (state, action) => {
    let generatedMap;
    try {
      generatedMap = createOsmMapFromGeoData(action.data, {
        label: action.label,
        seed: action.seed,
        ...(action.config ?? {}),
      });
    } catch (error) {
      return appendLog(state, {
        type: action.type,
        label: "OSM import failed",
        detail: error instanceof Error ? error.message : "Unsupported OSM import data.",
      });
    }

    const scene = updateActiveScene(state.scene, (activeScene) => {
      const generatedPatch = getGeneratedScenePatch(activeScene, generatedMap);

      return {
        ...activeScene,
        ...generatedPatch,
        selectedEntityId: null,
      };
    });

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "OSM map imported",
        detail: `${generatedMap.entities.length} scene nodes generated from ${generatedMap.config.featureCount} OSM features.`,
      }
    );
  },

  "add-entity": (state, action) => {
    const asset = getEntityAsset(action.assetKey);
    const entity = createEntityFromAsset(action.assetKey, asset, {
      id: action.id,
      position: action.position,
      rotation: action.rotation,
      scale: action.scale,
      terrainId: action.terrainId,
      collisionEnabled: action.collisionEnabled,
    });
    const scene = updateActiveScene(state.scene, (activeScene) => ({
      ...activeScene,
      entities: {
        ...activeScene.entities,
        [entity.id]: entity,
      },
      entityOrder: [...activeScene.entityOrder, entity.id],
      selectedEntityId: entity.id,
    }));

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Entity added",
        detail: `${asset.label} inserted into the active scene.`,
      }
    );
  },

  "duplicate-entity": (state, action) => {
    const activeScene = getActiveScene(state.scene);
    const sourceEntity =
      action.entity ?? activeScene.entities[action.entityId];
    const phonePilotEnabled = Boolean(activeScene.camera?.phonePilotEnabled);
    if (
      state.mode !== "select" ||
      phonePilotEnabled ||
      !sourceEntity ||
      sourceEntity.id === "hero" ||
      sourceEntity.primitive === "character" ||
      sourceEntity.generated
    ) {
      return state;
    }

    const duplicate = cloneSerializableValue(sourceEntity);
    const duplicateId = createEntityId(
      duplicate.assetKey ?? duplicate.primitive ?? "object"
    );
    const sourcePosition = Array.isArray(duplicate.position)
      ? duplicate.position
      : [0, 0, 0];
    const offset = Array.isArray(action.offset) ? action.offset : [1.25, 0, 1.25];
    const position = [0, 1, 2].map(
      (axis) => Number(sourcePosition[axis] ?? 0) + Number(offset[axis] ?? 0)
    );
    const entity = {
      ...duplicate,
      id: duplicateId,
      label: action.label ?? `${duplicate.label ?? "Object"} Copy`,
      position,
    };
    const scene = updateActiveScene(state.scene, (sceneToUpdate) => ({
      ...sceneToUpdate,
      entities: {
        ...sceneToUpdate.entities,
        [duplicateId]: entity,
      },
      entityOrder: [...sceneToUpdate.entityOrder, duplicateId],
      selectedEntityId: duplicateId,
    }));

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Entity pasted",
        detail: `${entity.label} duplicated in the active scene.`,
      }
    );
  },

  "sculpt-terrain": (state, action) => {
    const activeScene = getActiveScene(state.scene);
    const terrainId = action.terrainId ?? activeScene.terrainId;
    if (!action.point) return state;

    const stamp = createSculptStamp({
      terrainId,
      point: action.point,
      mode: action.mode ?? state.editor?.brushMode ?? "raise",
      size: action.size ?? state.editor?.brushSize ?? 12,
      strength: action.strength ?? state.editor?.brushStrength ?? 1.05,
    });

    const scene = updateActiveScene(state.scene, (sceneToUpdate) => {
      const currentStamps = sceneToUpdate.terrainSculptStamps?.[terrainId] ?? [];
      const lastStamp = currentStamps.at(-1);
      const canMergeRepeat =
        action.repeat &&
        lastStamp &&
        lastStamp.mode === stamp.mode &&
        Math.hypot(lastStamp.x - stamp.x, lastStamp.z - stamp.z) <=
          Math.max(0.45, Math.min(stamp.radius * 0.1, 2));
      const nextStamps = canMergeRepeat
        ? [
            ...currentStamps.slice(0, -1),
            {
              ...lastStamp,
              strength: Math.max(
                -18,
                Math.min(18, (lastStamp.strength ?? 0) + (stamp.strength ?? 0))
              ),
            },
          ]
        : [...currentStamps, stamp];

      return {
        ...sceneToUpdate,
        terrainSculptStamps: {
          ...(sceneToUpdate.terrainSculptStamps ?? {}),
          [terrainId]: nextStamps,
        },
      };
    });

    return {
      ...state,
      scene,
    };
  },

  "select-entity": (state, action) => {
    const activeScene = getActiveScene(state.scene);
    const canSelectEntity =
      state.mode === "select" && !activeScene.camera?.phonePilotEnabled;
    if (action.entityId && !canSelectEntity) return state;

    return {
      ...state,
      scene: updateActiveScene(state.scene, (sceneToUpdate) => ({
        ...sceneToUpdate,
        selectedEntityId: action.entityId ?? null,
      })),
    };
  },

  "set-entity-property": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const entity = activeScene.entities[action.entityId];
      if (!entity) return activeScene;

      return {
        ...activeScene,
        entities: {
          ...activeScene.entities,
          [action.entityId]: {
            ...entity,
            [action.property]: action.value,
          },
        },
      };
    });

    if (action.transient) {
      return {
        ...state,
        scene,
      };
    }

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Entity property",
        detail: `${action.entityId}.${action.property} updated.`,
      }
    );
  },

  "transform-entity": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const entity = activeScene.entities[action.entityId];
      if (!entity) return activeScene;

      return {
        ...activeScene,
        entities: {
          ...activeScene.entities,
          [action.entityId]: {
            ...entity,
            ...action.patch,
          },
        },
      };
    });

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Entity transformed",
        detail: `${action.entityId} transform updated.`,
      }
    );
  },

  "drag-entity-transform": (state, action) => {
    const scene = updateActiveScene(state.scene, (activeScene) => {
      const entity = activeScene.entities[action.entityId];
      if (!entity) return activeScene;

      return {
        ...activeScene,
        entities: {
          ...activeScene.entities,
          [action.entityId]: {
            ...entity,
            ...action.patch,
          },
        },
      };
    });

    return {
      ...state,
      scene,
    };
  },

  "delete-selected": (state, action) => {
    const activeScene = getActiveScene(state.scene);
    const selectedId = activeScene.selectedEntityId;
    if (!selectedId || selectedId === "hero") return state;

    const scene = updateActiveScene(state.scene, (currentScene) => {
      const entities = { ...currentScene.entities };
      delete entities[selectedId];

      return {
        ...currentScene,
        entities,
        entityOrder: currentScene.entityOrder.filter((id) => id !== selectedId),
        selectedEntityId: null,
      };
    });

    return appendLog(
      {
        ...state,
        scene,
      },
      {
        type: action.type,
        label: "Entity deleted",
        detail: `${selectedId} removed from the active scene.`,
      }
    );
  },
};

const applyCommand = (state, action) => {
  const handler = commandHandlers[action.type];
  if (!handler) return state;
  return handler(state, action);
};

const runCommandBatch = (state, action) => {
  const commands = action.commands?.filter(Boolean) ?? [];
  if (commands.length === 0) return state;

  const undoable = commands.some((command) =>
    UNDOABLE_COMMAND_TYPES.has(command.type)
  );
  const startState = undoable ? pushUndoSnapshot(state) : state;
  const nextState = commands.reduce(applyCommand, startState);

  return appendLog(nextState, {
    type: action.type,
    label: action.label ?? "Command batch",
    detail: `${commands.length} command${commands.length === 1 ? "" : "s"} executed.`,
  });
};

export const runEngineCommand = (state, action) => {
  if (action.type === "undo") return undoCommand(state);
  if (action.type === "redo") return redoCommand(state);
  if (action.type === "run-command-batch") return runCommandBatch(state, action);

  if (action.transient) {
    return applyCommand(state, action);
  }

  if (!UNDOABLE_COMMAND_TYPES.has(action.type)) {
    return applyCommand(state, action);
  }

  const nextState = applyCommand(pushUndoSnapshot(state), action);
  return nextState === state ? state : nextState;
};

export const getCommandAssetLibrary = () => ENTITY_LIBRARY;
