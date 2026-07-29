/* eslint-disable react/prop-types */
import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import { getEntityAssetUrl } from "../../../layers/assets/assetRegistry";
import {
  importGltfPropAsset,
  importPropObject,
} from "../../../layers/assets/importers/propImporter";
import {
  applyMtlStandardMaterials,
  parseMtlColorLibrary,
} from "../../../layers/assets/importers/renderableMaterials";
import { ENTITY_LIBRARY } from "../../../scene/createInitialScene";
import {
  BasicPrimitiveGeometry,
  isBasicPrimitive,
} from "./BasicPrimitiveGeometry";

const createGhostMaterial = () =>
  new THREE.MeshBasicMaterial({
    color: "#2f3438",
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });

const preparePreviewMaterial = (object) => {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;
    child.renderOrder = 30;
    child.material = Array.isArray(child.material)
      ? child.material.map(() => createGhostMaterial())
      : createGhostMaterial();
  });
  return object;
};

const GltfPlacementPreview = ({ asset, position }) => {
  const gltf = useGLTF(getEntityAssetUrl(asset));
  const importedAsset = useMemo(
    () => importGltfPropAsset(gltf.scene, asset),
    [asset, gltf.scene]
  );
  const model = useMemo(
    () => preparePreviewMaterial(importedAsset.object.clone(true)),
    [importedAsset.object]
  );
  const scale = asset.scale ?? [1, 1, 1];
  const yOffset = asset.yOffset ?? 0;

  return (
    <group
      position={[position[0], position[1] + yOffset + 0.025, position[2]]}
      scale={scale}
      renderOrder={30}
    >
      <primitive object={model} />
    </group>
  );
};

const ObjPlacementPreview = ({ asset, position }) => {
  const mtlText = useLoader(THREE.FileLoader, asset.mtlUrl, (loader) => {
    loader.setResponseType("text");
  });
  const obj = useLoader(OBJLoader, getEntityAssetUrl(asset));
  const colorLibrary = useMemo(() => parseMtlColorLibrary(mtlText), [mtlText]);
  const importedAsset = useMemo(
    () =>
      importPropObject(
        applyMtlStandardMaterials(obj.clone(true), colorLibrary, asset.color),
        asset,
        "obj-preview"
      ),
    [asset, colorLibrary, obj]
  );
  const model = useMemo(
    () => preparePreviewMaterial(importedAsset.object.clone(true)),
    [importedAsset.object]
  );
  const scale = asset.scale ?? [1, 1, 1];
  const yOffset = asset.yOffset ?? 0;

  return (
    <group
      position={[position[0], position[1] + yOffset + 0.025, position[2]]}
      scale={scale}
      renderOrder={30}
    >
      <primitive object={model} />
    </group>
  );
};

const PrimitivePlacementPreview = ({ asset, position }) => (
  <mesh
    position={[position[0], position[1] + (asset.yOffset ?? 0) + 0.025, position[2]]}
    rotation={asset.primitive === "plane" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
    scale={asset.scale ?? [1, 1, 1]}
    renderOrder={30}
  >
    {isBasicPrimitive(asset.primitive) ? (
      <BasicPrimitiveGeometry primitive={asset.primitive} />
    ) : (
      <boxGeometry args={[1, 1, 1]} />
    )}
    <meshBasicMaterial
      color="#2f3438"
      depthTest={false}
      depthWrite={false}
      opacity={0.46}
      side={THREE.DoubleSide}
      transparent
    />
  </mesh>
);

export const PlacementPreview = ({ assetKey, position }) => {
  const asset = ENTITY_LIBRARY[assetKey];
  if (!asset || !position) return null;

  return (
    <group>
      {asset.primitive === "gltf" ? (
        <Suspense fallback={<PrimitivePlacementPreview asset={asset} position={position} />}>
          <GltfPlacementPreview asset={asset} position={position} />
        </Suspense>
      ) : asset.primitive === "obj" ? (
        <Suspense fallback={<PrimitivePlacementPreview asset={asset} position={position} />}>
          <ObjPlacementPreview asset={asset} position={position} />
        </Suspense>
      ) : (
        <PrimitivePlacementPreview asset={asset} position={position} />
      )}
      <mesh position={[position[0], position[1] + 0.055, position[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={31}>
        <ringGeometry args={[0.9, 0.98, 48]} />
        <meshBasicMaterial
          color="#202326"
          depthTest={false}
          depthWrite={false}
          opacity={0.82}
          transparent
        />
      </mesh>
    </group>
  );
};
