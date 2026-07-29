const MATERIAL_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
];

const toMaterialList = (material) => {
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
};

export const inspectRenderableObject = (object) => {
  const summary = {
    meshCount: 0,
    skinnedMeshCount: 0,
    boneCount: 0,
    materialCount: 0,
    textureCount: 0,
    meshNames: [],
    boneNames: [],
    materialNames: [],
  };
  const materialSet = new Set();
  const textureSet = new Set();

  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      summary.meshCount += 1;
      summary.meshNames.push(child.name || child.type);
    }

    if (child.isSkinnedMesh) {
      summary.skinnedMeshCount += 1;
    }

    if (child.isBone) {
      summary.boneCount += 1;
      summary.boneNames.push(child.name || child.type);
    }

    toMaterialList(child.material).forEach((material) => {
      materialSet.add(material);
      summary.materialNames.push(material.name || material.type);

      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        if (material[key]) textureSet.add(material[key]);
      });
    });
  });

  summary.materialCount = materialSet.size;
  summary.textureCount = textureSet.size;
  summary.meshNames = [...new Set(summary.meshNames)].slice(0, 8);
  summary.boneNames = [...new Set(summary.boneNames)].slice(0, 8);
  summary.materialNames = [...new Set(summary.materialNames)].slice(0, 8);

  return summary;
};

export const createCharacterValidation = ({ object, source, rawHeight }) => {
  const summary = inspectRenderableObject(object);
  const animationCount = source.animations?.filter((clip) => clip.tracks.length > 0).length ?? 0;
  const warnings = [];
  const errors = [];

  if (summary.skinnedMeshCount === 0) {
    errors.push("No skinned mesh detected.");
  }

  if (summary.boneCount === 0) {
    errors.push("No skeleton bones detected.");
  }

  if (animationCount === 0) {
    warnings.push("No usable animation clips detected.");
  }

  if (rawHeight <= 0) {
    errors.push("Invalid model height.");
  }

  if (summary.textureCount === 0) {
    warnings.push("No texture maps detected.");
  }

  return {
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready",
    summary: {
      ...summary,
      animationCount,
      animationNames:
        source.animations
          ?.filter((clip) => clip.tracks.length > 0)
          .map((clip) => clip.name || "Untitled")
          .slice(0, 8) ?? [],
    },
    warnings,
    errors,
  };
};

export const createPropValidation = ({ object }) => {
  const summary = inspectRenderableObject(object);
  const warnings = [];
  const errors = [];

  if (summary.meshCount === 0) {
    errors.push("No mesh detected.");
  }

  if (summary.materialCount === 0) {
    warnings.push("No materials detected.");
  }

  if (summary.textureCount === 0) {
    warnings.push("No texture maps detected.");
  }

  return {
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready",
    summary,
    warnings,
    errors,
  };
};
