import {
  CHARACTER_LIBRARY,
  ENTITY_LIBRARY,
  TERRAIN_LIBRARY,
} from "../layers/assets/assetRegistry";
import {
  DEFAULT_SCENE_LIGHTING,
  createInitialSceneState,
  getActiveScene,
  getActiveTerrain as getRuntimeActiveTerrain,
} from "../layers/runtime/sceneGraph";

export {
  DEFAULT_SCENE_LIGHTING,
  ENTITY_LIBRARY,
  TERRAIN_LIBRARY,
  getActiveScene,
};

export const createInitialScene = () =>
  createInitialSceneState({
    terrainLibrary: TERRAIN_LIBRARY,
    characterAsset: CHARACTER_LIBRARY.uploadedHero,
  });

export const getActiveTerrain = (state) =>
  getRuntimeActiveTerrain(state, TERRAIN_LIBRARY);
