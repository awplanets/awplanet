/* eslint-disable react/prop-types */
import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";

import { NATURE_ASSET_URLS } from "../../../../data/natureAssets";
import {
  CHARACTER_LIBRARY,
  ENTITY_LIBRARY,
  getEntityAssetUrl,
} from "../../../layers/assets/assetRegistry";
import { useEngine } from "../../../core/useEngine";
import { TERRAIN_TEXTURE_URLS } from "../terrain/terrainTextures";

const EXTRA_CHARACTER_ANIMATION_URLS = [
  "/animations/new-model/Jumping.fbx",
  "/animations/new-model/running%20Jump.fbx",
  "/animations/new-model/Standing%20Dodge%20Backward.fbx",
  "/animations/new-model/Sitting%20Laughing.fbx",
];

const getCharacterWarmupUrls = () => {
  const hero = CHARACTER_LIBRARY.uploadedHero;
  return [
    hero.modelUrl,
    hero.animationSet?.idle,
    hero.animationSet?.walk,
    hero.animationSet?.walkForward,
    hero.animationSet?.run,
    hero.animationSet?.runForward,
  ].filter(Boolean);
};

const getOptionalCharacterWarmupUrls = () => {
  const hero = CHARACTER_LIBRARY.uploadedHero;
  return [
    ...Object.values(hero.animationSet ?? {}),
    ...EXTRA_CHARACTER_ANIMATION_URLS,
  ].filter(Boolean);
};

const unique = (items) => [...new Set(items.filter(Boolean))];

const getEntityWarmupItems = () =>
  Object.values(ENTITY_LIBRARY).flatMap((asset) => {
    const url = getEntityAssetUrl(asset);
    if (!url || asset.primitive === "character") return [];

    if (asset.primitive === "gltf") {
      return [
        {
          label: url,
          preload: () => useGLTF.preload(url),
        },
      ];
    }

    if (asset.primitive === "obj") {
      return [
        {
          label: url,
          preload: () => useLoader.preload(OBJLoader, url),
        },
        asset.mtlUrl
          ? {
              label: asset.mtlUrl,
              preload: () =>
                useLoader.preload(THREE.FileLoader, asset.mtlUrl, (loader) => {
                  loader.setResponseType("text");
                }),
            }
          : null,
      ].filter(Boolean);
    }

    return [];
  });

const scheduleIdleWork = (callback) => {
  if (typeof window === "undefined") return undefined;
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(callback, { timeout: 900 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, 48);
  return () => window.clearTimeout(handle);
};

const createWarmupQueue = ({ includeOptional = false } = {}) => [
  ...unique(TERRAIN_TEXTURE_URLS).map((url) => ({
    label: url,
    preload: () => useLoader.preload(THREE.TextureLoader, url),
  })),
  ...unique(getCharacterWarmupUrls()).map((url) => ({
    label: url,
    preload: () => useLoader.preload(FBXLoader, url),
  })),
  ...(includeOptional
    ? [
        ...unique(getOptionalCharacterWarmupUrls()).map((url) => ({
          label: url,
          preload: () => useLoader.preload(FBXLoader, url),
        })),
        ...unique(NATURE_ASSET_URLS).map((url) => ({
          label: url,
          preload: () => useGLTF.preload(url),
        })),
        ...getEntityWarmupItems(),
      ]
    : []),
];

export const RuntimeAssetPreloader = ({ includeOptional = true } = {}) => {
  const { engineState } = useEngine();
  const modeRef = useRef(engineState.mode);

  useEffect(() => {
    modeRef.current = engineState.mode;
  }, [engineState.mode]);

  useEffect(() => {
    THREE.Cache.enabled = true;
    const queue = createWarmupQueue({ includeOptional });
    let cancelled = false;
    let cleanupIdle = null;
    let index = 0;

    document.body.dataset.assetWarmupTotal = String(queue.length);
    document.body.dataset.assetWarmupLoaded = "0";
    document.body.dataset.assetWarmupStatus = "warming";

    const runNext = () => {
      cleanupIdle = null;
      if (cancelled) return;

      if (modeRef.current === "play" || modeRef.current === "pilot") {
        document.body.dataset.assetWarmupStatus = "paused-runtime";
        cleanupIdle = scheduleIdleWork(runNext);
        return;
      }

      const item = queue[index];
      if (!item) {
        document.body.dataset.assetWarmupStatus = "ready";
        document.body.dataset.assetWarmupLoaded = String(queue.length);
        return;
      }

      try {
        const result = item.preload();
        if (result && typeof result.then === "function") {
          result.catch(() => {
            document.body.dataset.assetWarmupError = item.label;
          });
        }
        document.body.dataset.assetWarmupCurrent = item.label;
      } catch {
        document.body.dataset.assetWarmupError = item.label;
      }

      index += 1;
      document.body.dataset.assetWarmupLoaded = String(index);
      cleanupIdle = scheduleIdleWork(runNext);
    };

    cleanupIdle = scheduleIdleWork(runNext);

    return () => {
      cancelled = true;
      cleanupIdle?.();
    };
  }, [includeOptional]);

  return null;
};
