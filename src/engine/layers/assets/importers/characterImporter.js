import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  createGroundedCenterOffset,
  createHeightScale,
  measureObject,
  toArrayMetrics,
} from "./objectMetrics";
import { createCharacterValidation } from "./importValidation";
import { prepareRenderableObject } from "./renderableMaterials";

export const importCharacterFbxAsset = (
  fbx,
  {
    modelUrl,
    targetHeight,
  }
) => {
  const clone = cloneSkeleton(fbx);

  prepareRenderableObject(clone, {
    materialDefaults: {
      roughness: 0.58,
      metalness: 0.08,
    },
  });

  const rawMetrics = measureObject(clone);
  const normalizedScale = createHeightScale(rawMetrics.size.y, targetHeight);
  const [offsetX, offsetY, offsetZ] = createGroundedCenterOffset(
    rawMetrics.bounds,
    rawMetrics.center
  );

  clone.scale.setScalar(1);
  clone.position.set(offsetX, offsetY, offsetZ);
  clone.updateMatrixWorld(true);
  const validation = createCharacterValidation({
    object: clone,
    source: fbx,
    rawHeight: rawMetrics.size.y,
  });

  const importMeta = {
    kind: "character-fbx",
    modelUrl,
    rawHeight: rawMetrics.size.y,
    normalizedScale,
    targetHeight,
    rawMetrics: toArrayMetrics(rawMetrics),
    offset: [offsetX, offsetY, offsetZ],
    validation,
  };

  clone.userData.assetImport = importMeta;

  return {
    object: clone,
    importMeta,
    normalizedScale,
  };
};
