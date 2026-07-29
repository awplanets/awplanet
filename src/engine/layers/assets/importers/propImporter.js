import { measureObject, toArrayMetrics } from "./objectMetrics";
import { createPropValidation } from "./importValidation";
import { prepareRenderableObject } from "./renderableMaterials";

export const importPropObject = (sourceObject, asset, kind = "prop") => {
  const clone = sourceObject.clone(true);
  prepareRenderableObject(clone);

  const metrics = measureObject(clone);
  const validation = createPropValidation({ object: clone });
  const importMeta = {
    kind,
    assetKey: asset.assetKey,
    file: asset.url ?? asset.file,
    metrics: toArrayMetrics(metrics),
    validation,
  };

  clone.userData.assetImport = importMeta;

  return {
    object: clone,
    importMeta,
  };
};

export const importGltfPropAsset = (gltfScene, asset) =>
  importPropObject(gltfScene, asset, "gltf-prop");
