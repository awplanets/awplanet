import * as THREE from "three";

const toMaterialList = (material) => {
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
};

const cloneMaterial = (material) => {
  if (!material?.clone) return material;
  const clone = material.clone();
  clone.needsUpdate = true;
  return clone;
};

const isolateMeshMaterials = (child) => {
  if (!child.material) return;
  child.material = Array.isArray(child.material)
    ? child.material.map(cloneMaterial)
    : cloneMaterial(child.material);
};

export const parseMtlColorLibrary = (mtlText = "") => {
  const text =
    typeof mtlText === "string"
      ? mtlText
      : mtlText instanceof ArrayBuffer
        ? new TextDecoder().decode(mtlText)
        : ArrayBuffer.isView(mtlText)
          ? new TextDecoder().decode(mtlText.buffer)
          : "";
  const colors = {};
  let currentName = null;

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const [keyword, ...parts] = trimmed.split(/\s+/);
    if (keyword === "newmtl") {
      currentName = parts.join(" ");
      return;
    }

    if (keyword === "Kd" && currentName) {
      const [r = 0.7, g = 0.7, b = 0.7] = parts.map(Number);
      colors[currentName] = new THREE.Color(r, g, b);
    }
  });

  return colors;
};

export const applyMtlStandardMaterials = (
  object,
  colorLibrary = {},
  fallbackColor = "#8f8a78"
) => {
  object.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;

    const sourceMaterials = toMaterialList(child.material);
    const nextMaterials = sourceMaterials.length > 0
      ? sourceMaterials.map((material) => {
          const color = colorLibrary[material.name] ?? new THREE.Color(fallbackColor);
          return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.78,
            metalness: 0.04,
          });
        })
      : [
          new THREE.MeshStandardMaterial({
            color: fallbackColor,
            roughness: 0.78,
            metalness: 0.04,
          }),
        ];

    child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];
  });

  return object;
};

export const prepareRenderableObject = (
  object,
  {
    castShadow = true,
    receiveShadow = true,
    isolateMaterials = true,
    materialDefaults = {},
  } = {}
) => {
  object.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;

    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;
    if (isolateMaterials) {
      isolateMeshMaterials(child);
    }

    toMaterialList(child.material).forEach((material) => {
      Object.entries(materialDefaults).forEach(([key, value]) => {
        material[key] = value;
      });
      material.needsUpdate = true;
    });
  });

  return object;
};
