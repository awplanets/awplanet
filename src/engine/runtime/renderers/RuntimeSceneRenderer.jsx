/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { useEngine } from "../../core/useEngine";
import { phonePilotRuntimeState } from "../phonePilotRuntime";
import { runtimeCameraState } from "../runtimeCameraState";
import { canTimelineControlViewport } from "../timelineViewportPriority";
import {
  clearRuntimeTimelinePlaybackFrame,
  getRuntimeTimelinePlaybackFrame,
  setRuntimeCharacterTimelinePose,
} from "../runtimeTimelineState";
import {
  TERRAIN_LIBRARY,
  ENTITY_LIBRARY,
  getActiveScene,
} from "../../scene/createInitialScene";
import { getEngineCapabilities } from "../../layers/commands/engineCapabilities";
import { CameraRig } from "./camera/CameraRig";
import { EnvironmentRenderer } from "./environment/EnvironmentRenderer";
import { EntityRenderer } from "./props/EntityRenderer";
import { GeneratedEntityBatchRenderer } from "./props/GeneratedEntityBatchRenderer";
import { PlacementPreview } from "./props/PlacementPreview";
import { ObjectTransformGizmo } from "./props/ObjectTransformGizmo";
import { isBasicPrimitive } from "./props/BasicPrimitiveGeometry";
import {
  InstancedGrass,
  TerrainGround,
  WaterRipples,
} from "./terrain/TerrainRenderer";
import {
  SCULPTABLE_TERRAINS,
  sampleSculptedHeight,
} from "../../terrain/terrainSculpt";
import {
  createObstacleSpatialIndex,
  createPhysicsObstacles,
  resolveCharacterMovement,
} from "../../physics/collision";

const dampAngle = (current, target, lambda, delta) => {
  const wrappedDelta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current)
  );
  return current + wrappedDelta * (1 - Math.exp(-lambda * delta));
};

const isEditableKeyboardTarget = (target) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  target?.isContentEditable;

const normalizeRuntimeKey = (event) => {
  if (event.code === "Space" || event.key === " ") return "space";
  return event.key.toLowerCase();
};

const TRIGGERABLE_MARKERS = new Set([
  "entrance-marker",
  "exit-marker",
  "safe-marker",
  "quest-marker",
  "objective-marker",
]);

const MOBILE_GENERATED_ENTITY_LIMIT = 900;
const HERO_WALK_SPEED = 6.6;
const HERO_RUN_SPEED = 12.8;
const HERO_ACCELERATION = 18;
const HERO_DECELERATION = 22;
const HERO_RUN_BLEND_THRESHOLD = 9.2;
const HERO_WALK_BLEND_THRESHOLD = 0.55;

const shouldRenderEntityForTerrain = (entity, terrainId) =>
  entity &&
  (entity.id === "hero" ||
    entity.generated ||
    !entity.terrainId ||
    entity.terrainId === terrainId);

export const RuntimeSceneRenderer = ({ profile = "desktop" } = {}) => {
  const { engineState, runCommand } = useEngine();
  const { gl, scene: threeScene, camera } = useThree();
  const isPhoneProfile =
    profile === "phone" ||
    (typeof window !== "undefined" && window.location.pathname === "/phone-pilot");
  const scene = getActiveScene(engineState.scene);
  const displayScene = scene;
  const terrain = TERRAIN_LIBRARY[displayScene.terrainId] ?? TERRAIN_LIBRARY.blank;
  const params = displayScene.terrainParameters[displayScene.terrainId] ?? {};
  const terrainFloorColor =
    displayScene.terrainFloorColors?.[displayScene.terrainId] ??
    terrain.floorColor ??
    terrain.color;
  const density = params.density ?? terrain.density;
  const grassHeight = params.grassHeight ?? terrain.grassHeight ?? 1.18;
  const grassWind = params.wind ?? terrain.wind ?? 1.08;
  const grassColorVariation =
    params.colorVariation ?? terrain.colorVariation ?? 0.92;
  const sculptStamps =
    displayScene.terrainSculptStamps?.[displayScene.terrainId] ?? [];
  const editorTool = engineState.editor?.activeTool ?? "select";
  const brushMode = engineState.editor?.brushMode ?? "raise";
  const brushSize = engineState.editor?.brushSize ?? 12;
  const brushStrength = engineState.editor?.brushStrength ?? 0.92;
  const selectedAssetKey = engineState.editor?.selectedAssetKey ?? "boulder";
  const transformMode = engineState.editor?.transformMode ?? "translate";
  const isEditorMode =
    !isPhoneProfile &&
    engineState.mode === "select" &&
    !displayScene.camera?.phonePilotEnabled &&
    !phonePilotRuntimeState.enabled;
  const isPlayMode = engineState.mode === "play";
  const pressedKeysRef = useRef(new Set());
  const sculptPaintingRef = useRef(false);
  const draggedEntityRef = useRef(null);
  const suppressNextGroundClickRef = useRef(false);
  const activeBrushPointRef = useRef(null);
  const lastSculptPointRef = useRef(null);
  const lastSculptTimeRef = useRef(0);
  const lastDragPointRef = useRef(null);
  const lastDragTimeRef = useRef(0);
  const runtimeCompileTokenRef = useRef(0);
  const debugClockRef = useRef(0);
  const lastLocomotionRef = useRef("idle");
  const previousModeRef = useRef(engineState.mode);
  const previousHeroTeleportTokenRef = useRef(scene.entities.hero?.teleportToken);
  const cameraYawVersionRef = useRef(runtimeCameraState.yawVersion);
  const headingYawRef = useRef(scene.entities.hero?.rotation?.[1] ?? Math.PI);
  const movementBaseYawRef = useRef({
    active: false,
    yaw: Math.PI,
  });
  const transformObjectRegistryRef = useRef(new Map());
  const selectedTransformEntityIdRef = useRef(displayScene.selectedEntityId);
  const characterRuntimeTransformRefs = useRef({});
  const heroRuntimeTransformRef = useRef({
    position: scene.entities.hero?.position ?? [0, 0, 0],
    rotation: scene.entities.hero?.rotation ?? [0, Math.PI, 0],
    locomotionState: scene.entities.hero?.locomotionState ?? "idle",
  });
  const heroVelocityRef = useRef([0, 0]);
  const [brushCursor, setBrushCursor] = useState({
    visible: false,
    position: [0, 0.16, 0],
  });
  const [placementPreview, setPlacementPreview] = useState({
    visible: false,
    position: [0, 0, 0],
  });
  const [selectedTransformObject, setSelectedTransformObject] = useState(null);
  selectedTransformEntityIdRef.current = displayScene.selectedEntityId;
  const canSculptTerrain = SCULPTABLE_TERRAINS.has(displayScene.terrainId);
  const sampleHeight = (x, z) => sampleSculptedHeight(x, z, sculptStamps);
  const physicsObstacles = useMemo(
    () => createPhysicsObstacles(displayScene, ENTITY_LIBRARY),
    [displayScene]
  );
  const physicsObstacleIndex = useMemo(
    () => createObstacleSpatialIndex(physicsObstacles),
    [physicsObstacles]
  );
  const visibleEntities = useMemo(
    () =>
      displayScene.entityOrder
        .map((entityId) => displayScene.entities[entityId])
        .filter((entity) =>
          shouldRenderEntityForTerrain(entity, displayScene.terrainId)
        ),
    [displayScene.entities, displayScene.entityOrder, displayScene.terrainId]
  );
  const generatedEntityCount = visibleEntities.reduce(
    (count, entity) => count + (entity.generated ? 1 : 0),
    0
  );
  const batchGeneratedEntities =
    isPlayMode || engineState.mode === "pilot" || generatedEntityCount > 96;
  const visibleGeneratedEntities = useMemo(
    () => {
      const generated = visibleEntities.filter((entity) => entity.generated);
      return isPhoneProfile
        ? generated.slice(0, MOBILE_GENERATED_ENTITY_LIMIT)
        : generated;
    },
    [isPhoneProfile, visibleEntities]
  );
  const visibleRenderableEntities = useMemo(
    () =>
      batchGeneratedEntities
        ? visibleEntities.filter((entity) => !entity.generated)
        : visibleEntities,
    [batchGeneratedEntities, visibleEntities]
  );
  const selectedTransformEntity = useMemo(() => {
    const entity = displayScene.entities[displayScene.selectedEntityId];
    const transformablePrimitive =
      entity?.primitive === "gltf" ||
      entity?.primitive === "obj" ||
      isBasicPrimitive(entity?.primitive);
    if (!entity || entity.id === "hero" || !transformablePrimitive) {
      return null;
    }
    return entity;
  }, [displayScene.entities, displayScene.selectedEntityId]);
  const registerTransformObject = useCallback((entityId, object) => {
    if (object) {
      transformObjectRegistryRef.current.set(entityId, object);
    } else {
      transformObjectRegistryRef.current.delete(entityId);
    }

    if (selectedTransformEntityIdRef.current === entityId) {
      setSelectedTransformObject(object ?? null);
    }
  }, []);

  useEffect(() => {
    setSelectedTransformObject(
      transformObjectRegistryRef.current.get(displayScene.selectedEntityId) ?? null
    );
  }, [displayScene.selectedEntityId]);
  const gameplayMarkers = useMemo(
    () =>
      displayScene.entityOrder
        .map((entityId) => displayScene.entities[entityId])
        .filter((entity) => TRIGGERABLE_MARKERS.has(entity?.primitive)),
    [displayScene.entities, displayScene.entityOrder]
  );

  const publishHeroRuntimeTimelinePose = useCallback(() => {
    const hero = scene.entities.hero;
    const runtimeTransform = heroRuntimeTransformRef.current;
    if (!hero || !runtimeTransform) return;
    setRuntimeCharacterTimelinePose({
      id: hero.id,
      label: hero.label,
      position: runtimeTransform.position,
      rotation: runtimeTransform.rotation,
      scale: hero.scale ?? [1, 1, 1],
      locomotionState: runtimeTransform.locomotionState ?? hero.locomotionState,
      activeAction: hero.activeAction,
      animationClipName: runtimeTransform.animationClipName,
      animationTime: runtimeTransform.animationTime,
      animationDuration: runtimeTransform.animationDuration,
      animationLayers: runtimeTransform.animationLayers,
      renderPosition: runtimeTransform.renderPosition,
      renderRotation: runtimeTransform.renderRotation,
      renderFootY: runtimeTransform.renderFootY,
      skeletonPose: runtimeTransform.skeletonPose,
      boneOverrides: hero.boneOverrides,
      boneMoveOverrides: hero.boneMoveOverrides,
    });
  }, [scene.entities.hero]);

  const getCharacterRuntimeTransformRef = (entity) => {
    if (entity.id === "hero") return heroRuntimeTransformRef;
    if (!characterRuntimeTransformRefs.current[entity.id]) {
      characterRuntimeTransformRefs.current[entity.id] = { current: null };
    }
    return characterRuntimeTransformRefs.current[entity.id];
  };

  const claimMainViewportAuthority = useCallback(() => {
    clearRuntimeTimelinePlaybackFrame();
    window.dispatchEvent(new Event("awplanet:main-viewport-authority"));
  }, []);

  const setCharacterPlaybackTransform = (entity, pose, mode = "preview") => {
    const transformRef = getCharacterRuntimeTransformRef(entity);
    if (!pose) {
      transformRef.current = null;
      return;
    }
    transformRef.current = {
      position: [...(pose.position ?? entity.position ?? [0, 0, 0])],
      rotation: [...(pose.rotation ?? entity.rotation ?? [0, Math.PI, 0])],
      scale: [...(pose.scale ?? entity.scale ?? [1, 1, 1])],
      locomotionState: pose.locomotionState ?? entity.locomotionState ?? "idle",
      activeAction: pose.activeAction,
      animationClipName: pose.animationClipName,
      animationTime: pose.animationTime,
      animationDuration: pose.animationDuration,
      animationLayers: pose.animationLayers,
      renderPosition: pose.renderPosition,
      renderRotation: pose.renderRotation,
      renderFootY: pose.renderFootY,
      skeletonPose: pose.skeletonPose,
      boneOverrides: pose.boneOverrides,
      boneMoveOverrides: pose.boneMoveOverrides,
      timelinePlayback: true,
      timelinePlaybackMode: mode,
    };
  };

  useEffect(() => {
    if (isPhoneProfile) {
      document.body.dataset.runtimeCompileStatus = "phone-skip";
      document.body.dataset.runtimeCompileMode = engineState.mode;
      return undefined;
    }

    let cancelled = false;
    const token = runtimeCompileTokenRef.current + 1;
    runtimeCompileTokenRef.current = token;
    const compileScene = () => {
      if (cancelled || runtimeCompileTokenRef.current !== token) return;

      const result =
        typeof gl.compileAsync === "function"
          ? gl.compileAsync(threeScene, camera)
          : Promise.resolve(gl.compile(threeScene, camera));

      document.body.dataset.runtimeCompileStatus = "warming";
      Promise.resolve(result)
        .then(() => {
          if (cancelled || runtimeCompileTokenRef.current !== token) return;
          document.body.dataset.runtimeCompileStatus = "ready";
          document.body.dataset.runtimeCompileMode = engineState.mode;
        })
        .catch(() => {
          if (cancelled || runtimeCompileTokenRef.current !== token) return;
          document.body.dataset.runtimeCompileStatus = "fallback";
        });
    };
    const warmup = () => {
      if (cancelled) return;
      compileScene();
      document.body.dataset.runtimeScenePrecompiled = "true";
    };
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(warmup);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [
    camera,
    gl,
    scene.terrainId,
    threeScene,
    engineState.mode,
    isPhoneProfile,
    visibleGeneratedEntities.length,
    visibleRenderableEntities.length,
  ]);

  const placeObjectAtPoint = (point) => {
    if (!isEditorMode || !selectedAssetKey) return;
    const y = sampleHeight(point.x, point.z);
    runCommand({
      type: "add-entity",
      assetKey: selectedAssetKey,
      terrainId: scene.terrainId,
      position: [point.x, y, point.z],
    });
  };

  const stopEntityDrag = useCallback(() => {
    if (!draggedEntityRef.current) return;
    draggedEntityRef.current = null;
    lastDragPointRef.current = null;
    lastDragTimeRef.current = 0;
    suppressNextGroundClickRef.current = true;
    gl.domElement.style.cursor = "";
    window.setTimeout(() => {
      suppressNextGroundClickRef.current = false;
    }, 80);
  }, [gl.domElement]);

  const moveDraggedEntityToPoint = (point) => {
    const dragged = draggedEntityRef.current;
    if (!dragged || !isEditorMode) return;
    const y = sampleHeight(point.x, point.z);
    const nextPosition = [point.x, y, point.z];
    const previousPoint = lastDragPointRef.current;
    const now = performance.now();
    if (
      previousPoint &&
      Math.hypot(previousPoint.x - point.x, previousPoint.z - point.z) < 0.08 &&
      now - lastDragTimeRef.current < 32
    ) {
      return;
    }

    lastDragPointRef.current = { x: point.x, z: point.z };
    lastDragTimeRef.current = now;
    runCommand({
      type: "drag-entity-transform",
      entityId: dragged.entityId,
      patch: {
        position: nextPosition,
      },
    });
  };

  const startEntityDrag = (entity, event) => {
    if (
      !isEditorMode ||
      editorTool !== "select" ||
      entity.primitive !== "character"
    ) {
      return;
    }

    event.stopPropagation();
    claimMainViewportAuthority();
    if (entity.boneRigEnabled) {
      runCommand({ type: "select-entity", entityId: entity.id });
      return;
    }
    draggedEntityRef.current = {
      entityId: entity.id,
    };
    lastDragPointRef.current = null;
    lastDragTimeRef.current = 0;
    gl.domElement.style.cursor = "grabbing";
    runCommand({ type: "select-entity", entityId: entity.id });
  };

  const updatePlacementPreview = (point) => {
    if (editorTool !== "object-placement" || !isEditorMode || !selectedAssetKey) {
      setPlacementPreview((preview) =>
        preview.visible ? { ...preview, visible: false } : preview
      );
      return;
    }

    const y = sampleHeight(point.x, point.z);
    setPlacementPreview((preview) => {
      const dx = point.x - preview.position[0];
      const dz = point.z - preview.position[2];
      if (preview.visible && dx * dx + dz * dz < 0.04) return preview;
      return {
        visible: true,
        position: [point.x, y, point.z],
      };
    });
  };

  const updateBrushCursor = (point) => {
    if (editorTool !== "brush" || !canSculptTerrain || !isEditorMode) {
      setBrushCursor((cursor) =>
        cursor.visible ? { ...cursor, visible: false } : cursor
      );
      return;
    }

    setBrushCursor((cursor) => {
      const dx = point.x - cursor.position[0];
      const dz = point.z - cursor.position[2];
      const y = sampleHeight(point.x, point.z);
      if (
        cursor.visible &&
        dx * dx + dz * dz < 0.16 &&
        Math.abs(cursor.position[1] - (y + 0.075)) < 0.04
      ) {
        return cursor;
      }
      return {
        visible: true,
        position: [point.x, y + 0.075, point.z],
      };
    });
  };

  const sculptAtPoint = (point) => {
    if (editorTool !== "brush" || !canSculptTerrain || !isEditorMode) {
      return;
    }

    const previousPoint = lastSculptPointRef.current;
    const now = performance.now();
    const minDistance = Math.max(brushSize * 0.34, 2.2);
    const distanceFromPrevious = previousPoint
      ? Math.hypot(point.x - previousPoint.x, point.z - previousPoint.z)
      : Infinity;
    const movedEnough = distanceFromPrevious >= minDistance;
    const isRepeatAtSamePoint = previousPoint && !movedEnough;
    const repeatInterval = 185;
    const moveInterval = 58;
    const requiredInterval = isRepeatAtSamePoint ? repeatInterval : moveInterval;

    if (!movedEnough && !isRepeatAtSamePoint) return;
    if (now - lastSculptTimeRef.current < requiredInterval) {
      return;
    }

    lastSculptTimeRef.current = now;
    lastSculptPointRef.current = { x: point.x, z: point.z };

    runCommand({
      type: "sculpt-terrain",
      terrainId: scene.terrainId,
      point: [point.x, point.y, point.z],
      mode: brushMode,
      size: brushSize,
      strength: isRepeatAtSamePoint ? brushStrength * 0.38 : brushStrength,
      repeat: isRepeatAtSamePoint,
    });
  };

  const handleGroundPointerDown = (event) => {
    if (!isEditorMode) return;
    event.stopPropagation();
    if (draggedEntityRef.current) {
      moveDraggedEntityToPoint(event.point);
      return;
    }
    if (editorTool === "object-placement") {
      updatePlacementPreview(event.point);
      placeObjectAtPoint(event.point);
      return;
    }

    if (editorTool === "brush") {
      sculptPaintingRef.current = true;
      activeBrushPointRef.current = { x: event.point.x, y: event.point.y, z: event.point.z };
      lastSculptPointRef.current = null;
      updateBrushCursor(event.point);
      sculptAtPoint(event.point);
    }
  };

  const handleGroundPointerMove = (event) => {
    if (!isEditorMode) return;
    if (draggedEntityRef.current) {
      event.stopPropagation();
      moveDraggedEntityToPoint(event.point);
      return;
    }
    if (editorTool === "object-placement") {
      event.stopPropagation();
      updatePlacementPreview(event.point);
      return;
    }
    if (editorTool !== "brush") return;
    event.stopPropagation();
    activeBrushPointRef.current = { x: event.point.x, y: event.point.y, z: event.point.z };
    updateBrushCursor(event.point);
    if (sculptPaintingRef.current) {
      sculptAtPoint(event.point);
    }
  };

  const stopBrushStroke = () => {
    sculptPaintingRef.current = false;
    activeBrushPointRef.current = null;
    lastSculptPointRef.current = null;
    lastSculptTimeRef.current = 0;
  };

  useEffect(() => {
    window.addEventListener("pointerup", stopEntityDrag);
    window.addEventListener("pointercancel", stopEntityDrag);
    return () => {
      window.removeEventListener("pointerup", stopEntityDrag);
      window.removeEventListener("pointercancel", stopEntityDrag);
    };
  }, [stopEntityDrag]);

  useEffect(() => {
    if (isEditorMode) return;
    stopEntityDrag();
    stopBrushStroke();
    setBrushCursor((cursor) =>
      cursor.visible ? { ...cursor, visible: false } : cursor
    );
    setPlacementPreview((preview) =>
      preview.visible ? { ...preview, visible: false } : preview
    );
  }, [isEditorMode, stopEntityDrag]);

  useEffect(() => {
    document.body.dataset.runtimeVersion = "renderer-systems-v1";
    document.body.dataset.heroEntity = JSON.stringify(scene.entities.hero);
    document.body.dataset.runtimeVisibleEntities = String(visibleEntities.length);
    document.body.dataset.engineCapabilities = JSON.stringify(
      getEngineCapabilities()
    );
  }, [scene.entities.hero, visibleEntities.length]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isTextTarget = isEditableKeyboardTarget(event.target);
      if (!isTextTarget && (event.metaKey || event.ctrlKey || event.altKey)) {
        return;
      }
      if (
        !isTextTarget &&
        isEditorMode &&
        scene.selectedEntityId &&
        scene.selectedEntityId !== "hero" &&
        (event.code === "Delete" || event.code === "Backspace")
      ) {
        event.preventDefault();
        event.stopPropagation();
        runCommand({ type: "delete-selected" });
        return;
      }
      if (!isTextTarget && event.code === "Space") {
        event.preventDefault();
      }
      if (!isTextTarget) {
        pressedKeysRef.current.add(normalizeRuntimeKey(event));
      }
    };
    const onKeyUp = (event) => {
      if (!isEditableKeyboardTarget(event.target) && event.code === "Space") {
        event.preventDefault();
      }
      pressedKeysRef.current.delete(normalizeRuntimeKey(event));
    };
    const clearRuntimeKeys = () => {
      pressedKeysRef.current.clear();
      movementBaseYawRef.current.active = false;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearRuntimeKeys();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearRuntimeKeys);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearRuntimeKeys);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearRuntimeKeys();
    };
  }, [isEditorMode, runCommand, scene.selectedEntityId]);

  useEffect(() => {
    const hero = scene.entities.hero;
    const modeChanged = previousModeRef.current !== engineState.mode;
    previousModeRef.current = engineState.mode;

    if (!hero) return;
    const teleportChanged =
      previousHeroTeleportTokenRef.current !== hero.teleportToken;
    previousHeroTeleportTokenRef.current = hero.teleportToken;
    const runtimePosition = heroRuntimeTransformRef.current.position ?? [0, 0, 0];
    const heroPosition = hero.position ?? [0, 0, 0];
    const externalPositionDelta = Math.hypot(
      runtimePosition[0] - heroPosition[0],
      runtimePosition[2] - heroPosition[2]
    );
    if (
      modeChanged ||
      teleportChanged ||
      engineState.mode !== "play" ||
      externalPositionDelta > 8
    ) {
      heroRuntimeTransformRef.current = {
        position: [...(hero.position ?? [0, 0, 0])],
        rotation: [...(hero.rotation ?? [0, Math.PI, 0])],
        locomotionState: hero.locomotionState ?? "idle",
      };
      heroVelocityRef.current = [0, 0];
      headingYawRef.current = hero.rotation?.[1] ?? Math.PI;
      lastLocomotionRef.current = hero.locomotionState ?? "idle";
    }
  }, [engineState.mode, scene.entities.hero]);

  useFrame((_, delta) => {
    debugClockRef.current += delta;
    if (debugClockRef.current > 6) {
      debugClockRef.current = 0;
      document.body.dataset.runtimeVersion = "renderer-systems-v1";
      document.body.dataset.heroEntity = JSON.stringify(scene.entities.hero);
    }

    const timelineViewportAllowed = canTimelineControlViewport({
      mode: engineState.mode,
      editorTool,
      phonePilotEnabled: scene.camera?.phonePilotEnabled,
      phoneProfile: isPhoneProfile,
    });
    const timelinePlaybackFrame = timelineViewportAllowed
      ? getRuntimeTimelinePlaybackFrame()
      : null;

    if (timelinePlaybackFrame) {
      scene.entityOrder
        .map((entityId) => scene.entities[entityId])
        .filter((entity) => entity?.primitive === "character")
        .forEach((entity) => {
          setCharacterPlaybackTransform(
            entity,
            timelinePlaybackFrame.characters?.[entity.id] ?? null,
            timelinePlaybackFrame.mode
          );
        });
      // Scrub preview and running playback are both authoritative timeline
      // evaluations. Continuing into the live runtime below used to clear a
      // preview transform in the very same frame, so the playhead displayed
      // the current editor pose instead of the recorded one.
      return;
    }
    Object.values(characterRuntimeTransformRefs.current).forEach((transformRef) => {
      if (transformRef.current?.timelinePlayback) {
        transformRef.current = null;
      }
    });
    if (heroRuntimeTransformRef.current?.timelinePlayback) {
      heroRuntimeTransformRef.current = {
        position: [...(scene.entities.hero?.position ?? [0, 0, 0])],
        rotation: [...(scene.entities.hero?.rotation ?? [0, Math.PI, 0])],
        locomotionState: scene.entities.hero?.locomotionState ?? "idle",
      };
    }

    if (
      isEditorMode &&
      sculptPaintingRef.current &&
      activeBrushPointRef.current
    ) {
      updateBrushCursor(activeBrushPointRef.current);
      sculptAtPoint(activeBrushPointRef.current);
    }

    if (!isPlayMode || engineState.gameplay?.status === "complete") {
      publishHeroRuntimeTimelinePose();
      return;
    }

    const keys = pressedKeysRef.current;
    const direction = [0, 0];
    if (keys.has("w") || keys.has("arrowup")) direction[1] -= 1;
    if (keys.has("s") || keys.has("arrowdown")) direction[1] += 1;
    if (keys.has("a") || keys.has("arrowleft")) direction[0] -= 1;
    if (keys.has("d") || keys.has("arrowright")) direction[0] += 1;
    const length = Math.hypot(direction[0], direction[1]);

    const hero = scene.entities.hero;
    const runtimeTransform = heroRuntimeTransformRef.current;
    if (
      runtimeCameraState.alignHero &&
      runtimeCameraState.yawVersion !== cameraYawVersionRef.current
    ) {
      cameraYawVersionRef.current = runtimeCameraState.yawVersion;
      headingYawRef.current = runtimeCameraState.yaw;
      if (length === 0) {
        runtimeTransform.rotation = [0, runtimeCameraState.yaw, 0];
      }
      movementBaseYawRef.current = {
        active: movementBaseYawRef.current.active,
        yaw: runtimeCameraState.yaw,
      };
    }
    const heroPosition = runtimeTransform.position;
    if (hero) {
      runtimeTransform.position[1] = sampleHeight(heroPosition[0], heroPosition[2]);
    }
    if (hero) {
      const isRunning = keys.has("shift");
      const speed = isRunning ? HERO_RUN_SPEED : HERO_WALK_SPEED;
      const input =
        length > 0 ? [direction[0] / length, direction[1] / length] : [0, 0];
      if (length > 0 && !movementBaseYawRef.current.active) {
        movementBaseYawRef.current = {
          active: true,
          yaw: headingYawRef.current,
        };
      }
      movementBaseYawRef.current.yaw = dampAngle(
        movementBaseYawRef.current.yaw,
        headingYawRef.current,
        14,
        delta
      );
      const movementYaw = movementBaseYawRef.current.yaw;
      const forward = [Math.sin(movementYaw), Math.cos(movementYaw)];
      const right = [-Math.cos(movementYaw), Math.sin(movementYaw)];
      const worldDirection = [
        -input[1] * forward[0] + input[0] * right[0],
        -input[1] * forward[1] + input[0] * right[1],
      ];
      const worldLength = Math.hypot(worldDirection[0], worldDirection[1]) || 1;
      const normalized = [
        worldDirection[0] / worldLength,
        worldDirection[1] / worldLength,
      ];
      const velocity = heroVelocityRef.current;
      const targetVelocity =
        length > 0 ? [normalized[0] * speed, normalized[1] * speed] : [0, 0];
      const velocityLambda = length > 0 ? HERO_ACCELERATION : HERO_DECELERATION;
      const velocityBlend = 1 - Math.exp(-velocityLambda * delta);
      velocity[0] += (targetVelocity[0] - velocity[0]) * velocityBlend;
      velocity[1] += (targetVelocity[1] - velocity[1]) * velocityBlend;
      const velocitySpeed = Math.hypot(velocity[0], velocity[1]);
      const motionDirection =
        velocitySpeed > 0.0001
          ? [velocity[0] / velocitySpeed, velocity[1] / velocitySpeed]
          : normalized;
      if (length === 0 && velocitySpeed < 0.05) {
        velocity[0] = 0;
        velocity[1] = 0;
        movementBaseYawRef.current.active = false;
        if (lastLocomotionRef.current !== "idle") {
          lastLocomotionRef.current = "idle";
          runtimeTransform.locomotionState = "idle";
        }
        publishHeroRuntimeTimelinePose();
        return;
      }
      const desiredPosition = [
        heroPosition[0] + velocity[0] * delta,
        heroPosition[1],
        heroPosition[2] + velocity[1] * delta,
      ];
      desiredPosition[1] = sampleHeight(
        desiredPosition[0],
        desiredPosition[2]
      );
      runtimeTransform.position = resolveCharacterMovement({
        currentPosition: heroPosition,
        desiredPosition,
        obstacles: physicsObstacleIndex,
        radius: hero.collider?.radius ?? 0.62,
      });
      const targetRotationY = Math.atan2(motionDirection[0], motionDirection[1]);
      runtimeTransform.rotation = [
        0,
        dampAngle(
          runtimeTransform.rotation?.[1] ?? targetRotationY,
          targetRotationY,
          12,
          delta
        ),
        0,
      ];

      const locomotionState =
        velocitySpeed > HERO_RUN_BLEND_THRESHOLD
          ? "runForward"
          : velocitySpeed > HERO_WALK_BLEND_THRESHOLD
            ? "walkForward"
            : "idle";
      if (lastLocomotionRef.current !== locomotionState) {
        lastLocomotionRef.current = locomotionState;
        runtimeTransform.locomotionState = locomotionState;
      }
    }

    publishHeroRuntimeTimelinePose();

    gameplayMarkers.forEach((marker) => {
      if (engineState.gameplay?.visitedMarkerIds?.includes(marker.id)) return;
      const markerPosition = marker.position ?? [0, 0, 0];
      const distance = Math.hypot(
        heroPosition[0] - markerPosition[0],
        heroPosition[2] - markerPosition[2]
      );
      if (distance < 1.65) {
        runCommand({
          type: "collect-gameplay-marker",
          entityId: marker.id,
        });
      }
    });
  }, -2);

  return (
    <>
      <EnvironmentRenderer
        terrain={terrain}
        mobile={isPhoneProfile}
        backgroundColor={displayScene.backgroundColor}
        lighting={displayScene.lighting}
      />
      <group
        onClick={(event) => {
          if (suppressNextGroundClickRef.current) {
            event.stopPropagation();
            return;
          }
          if (!isEditorMode) return;
          claimMainViewportAuthority();
          runCommand({ type: "select-entity", entityId: null });
        }}
      >
        <TerrainGround
          terrainId={displayScene.terrainId}
          terrain={terrain}
          params={params}
          floorColor={terrainFloorColor}
          mobile={isPhoneProfile}
          sculptStamps={sculptStamps}
          onGroundPointerDown={handleGroundPointerDown}
          onGroundPointerMove={handleGroundPointerMove}
          onGroundPointerUp={() => {
            stopEntityDrag();
            stopBrushStroke();
          }}
          onGroundPointerLeave={() => {
            stopEntityDrag();
            stopBrushStroke();
            setBrushCursor((cursor) => ({ ...cursor, visible: false }));
            setPlacementPreview((preview) => ({ ...preview, visible: false }));
          }}
        />
      </group>
      {!isPhoneProfile && placementPreview.visible && editorTool === "object-placement" && (
        <PlacementPreview
          assetKey={selectedAssetKey}
          position={placementPreview.position}
        />
      )}
      {!isPhoneProfile && brushCursor.visible && (
        <group
          position={brushCursor.position}
          renderOrder={20}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[
                Math.max(0.35, brushSize * 0.985),
                Math.max(0.45, brushSize),
                192,
              ]}
            />
            <meshBasicMaterial
              color="#8f969d"
              depthTest={false}
              depthWrite={false}
              transparent
              opacity={0.42}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
            <ringGeometry
              args={[
                Math.max(0.35, brushSize * 0.955),
                Math.max(0.45, brushSize * 0.972),
                192,
              ]}
            />
            <meshBasicMaterial
              color="#d4d8dc"
              depthTest={false}
              depthWrite={false}
              transparent
              opacity={0.58}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <ringGeometry args={[0.16, 0.32, 96]} />
            <meshBasicMaterial
              color="#d4d8dc"
              depthTest={false}
              depthWrite={false}
              transparent
              opacity={0.7}
            />
          </mesh>
        </group>
      )}
      {!isPhoneProfile && density > 0.25 && displayScene.terrainId === "grass" && (
        <InstancedGrass
          density={density}
          height={grassHeight}
          wind={grassWind}
          colorVariation={grassColorVariation}
        />
      )}
      {!isPhoneProfile && displayScene.terrainId === "water" && (
        <WaterRipples visible />
      )}
      {batchGeneratedEntities && (
        <GeneratedEntityBatchRenderer entities={visibleGeneratedEntities} />
      )}
      {visibleRenderableEntities.map((entity) => (
        <EntityRenderer
          key={entity.id}
          entity={entity}
          mobile={isPhoneProfile}
          selected={
            isEditorMode && displayScene.selectedEntityId === entity.id
          }
          onSelect={
            isEditorMode
              ? (id) => {
                  claimMainViewportAuthority();
                  runCommand({ type: "select-entity", entityId: id });
                }
              : undefined
          }
          onPointerDown={isEditorMode ? startEntityDrag : undefined}
          onTransformObjectReady={registerTransformObject}
          runtimeTransformRef={
            entity.primitive === "character"
              ? getCharacterRuntimeTransformRef(entity)
              : undefined
          }
        />
      ))}
      {!isPhoneProfile &&
        isEditorMode &&
        editorTool === "select" &&
        selectedTransformEntity &&
        selectedTransformObject && (
          <ObjectTransformGizmo
            entity={selectedTransformEntity}
            object={selectedTransformObject}
            mode={transformMode}
            onModeChange={(nextMode) =>
              runCommand({
                type: "set-editor-tool",
                tool: "select",
                transformMode: nextMode,
                transient: true,
              })
            }
            onCommit={(_startPatch, finalPatch) => {
              runCommand({
                type: "transform-entity",
                entityId: selectedTransformEntity.id,
                patch: finalPatch,
              });
            }}
            onInteractionStart={() => {
              suppressNextGroundClickRef.current = true;
              claimMainViewportAuthority();
            }}
            onInteractionEnd={() => {
              window.setTimeout(() => {
                suppressNextGroundClickRef.current = false;
              }, 80);
            }}
          />
        )}
      <CameraRig heroRuntimeTransformRef={heroRuntimeTransformRef} />
    </>
  );
};
