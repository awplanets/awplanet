/* eslint-disable react/prop-types */
import { Suspense, useCallback, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import {
  getEntityAssetUrl,
} from "../../../layers/assets/assetRegistry";
import {
  importGltfPropAsset,
  importPropObject,
} from "../../../layers/assets/importers/propImporter";
import {
  applyMtlStandardMaterials,
  parseMtlColorLibrary,
} from "../../../layers/assets/importers/renderableMaterials";
import { ENTITY_LIBRARY } from "../../../scene/createInitialScene";
import { CharacterRenderer } from "../characters/CharacterRenderer";
import { GeneratedFootprintMesh } from "./GeneratedFootprintMesh";
import { SelectionBox, SelectionHighlight } from "./SelectionHighlight";
import {
  BasicPrimitiveGeometry,
  isBasicPrimitive,
} from "./BasicPrimitiveGeometry";
import { hasFootprintGeometry } from "./generatedFootprintGeometry";

const PropLoadingPlaceholder = ({ entity, selected, onSelect }) => {
  const position = entity.position ?? [0, 0, 0];
  const scale = Array.isArray(entity.scale)
    ? entity.scale.map((value) => (Number.isFinite(value) ? Math.abs(value) : 1))
    : [1, 1, 1];
  const radius = Math.max(0.22, Math.min(Math.max(...scale) * 0.08, 0.75));

  return (
    <mesh
      castShadow
      receiveShadow
      position={[position[0], position[1] + radius, position[2]]}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      <sphereGeometry args={[radius, 18, 12]} />
      <meshStandardMaterial
        color={selected ? "#ffffff" : entity.color ?? "#9bd4c8"}
        emissive={selected ? "#9bd4c8" : "#000000"}
        emissiveIntensity={selected ? 0.18 : 0}
        roughness={0.72}
        transparent
        opacity={0.74}
      />
    </mesh>
  );
};

const GltfEntity = ({
  entity,
  selected,
  onSelect,
  onTransformObjectReady,
}) => {
  const asset = ENTITY_LIBRARY[entity.assetKey];
  const gltf = useGLTF(getEntityAssetUrl(asset));
  const importedAsset = useMemo(
    () => importGltfPropAsset(gltf.scene, asset),
    [asset, gltf.scene]
  );
  const model = importedAsset.object;
  const position = entity.position ?? [0, 0, 0];
  const scale = entity.scale ?? [asset.scale, asset.scale, asset.scale];
  const yOffset = asset.yOffset ?? 0;
  const setTransformObjectRef = useCallback(
    (object) => onTransformObjectReady?.(entity.id, object),
    [entity.id, onTransformObjectReady]
  );

  return (
    <group
      ref={setTransformObjectRef}
      position={[position[0], position[1] + yOffset, position[2]]}
      scale={scale}
      rotation={entity.rotation ?? [0, 0, 0]}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      <primitive object={model} />
      {selected && entity.id !== "hero" && <SelectionHighlight object={model} />}
    </group>
  );
};

const ObjEntity = ({
  entity,
  selected,
  onSelect,
  onTransformObjectReady,
}) => {
  const asset = ENTITY_LIBRARY[entity.assetKey];
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
        "obj-prop"
      ),
    [asset, colorLibrary, obj]
  );
  const model = importedAsset.object;
  const position = entity.position ?? [0, 0, 0];
  const scale = entity.scale ?? asset.scale ?? [1, 1, 1];
  const yOffset = asset.yOffset ?? 0;
  const setTransformObjectRef = useCallback(
    (object) => onTransformObjectReady?.(entity.id, object),
    [entity.id, onTransformObjectReady]
  );

  return (
    <group
      ref={setTransformObjectRef}
      position={[position[0], position[1] + yOffset, position[2]]}
      scale={scale}
      rotation={entity.rotation ?? [0, 0, 0]}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      <primitive object={model} />
      {selected && entity.id !== "hero" && <SelectionHighlight object={model} />}
    </group>
  );
};

const MarkerEntity = ({ entity, selected, onSelect }) => {
  const position = entity.position ?? [0, 0, 0];
  const scale = entity.scale ?? [1, 1, 1];
  const color = entity.color ?? "#9bd4c8";

  return (
    <mesh
      castShadow
      position={[position[0], position[1] + 0.45, position[2]]}
      scale={scale}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      <octahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial
        color={selected ? "#ffffff" : color}
        emissive={color}
        emissiveIntensity={0.25}
      />
      {selected && entity.id !== "hero" && (
        <SelectionBox center={[0, 0, 0]} size={[1.08, 1.08, 1.08]} />
      )}
    </mesh>
  );
};

const BasicPrimitiveEntity = ({
  entity,
  selected,
  onSelect,
  onTransformObjectReady,
}) => {
  const asset = ENTITY_LIBRARY[entity.assetKey] ?? {};
  const position = entity.position ?? [0, 0, 0];
  const rotation = entity.rotation ?? [0, 0, 0];
  const scale = entity.scale ?? asset.scale ?? [1, 1, 1];
  const color = entity.color ?? asset.color ?? "#8d949b";
  const [outlineObject, setOutlineObject] = useState(null);
  const setObjectRef = useCallback(
    (object) => {
      setOutlineObject(object);
      onTransformObjectReady?.(entity.id, object);
    },
    [entity.id, onTransformObjectReady]
  );

  return (
    <group
      ref={setObjectRef}
      position={[
        position[0],
        position[1] + (asset.yOffset ?? 0),
        position[2],
      ]}
      rotation={rotation}
      scale={scale}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      <mesh
        castShadow={entity.primitive !== "plane"}
        receiveShadow
        rotation={
          entity.primitive === "plane" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
        }
      >
        <BasicPrimitiveGeometry primitive={entity.primitive} />
        <meshStandardMaterial
          color={color}
          metalness={0.06}
          roughness={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
      {selected && outlineObject && (
        <SelectionHighlight object={outlineObject} padding={1.012} />
      )}
    </group>
  );
};

const GeneratedPrimitiveEntity = ({ entity, selected, onSelect }) => {
  const position = entity.position ?? [0, 0, 0];
  const scale = entity.scale ?? [1, 1, 1];
  const color = entity.color ?? "#9bd4c8";
  const isWater = entity.primitive === "water-channel" || entity.primitive === "water-surface";
  const isMarker = entity.primitive?.endsWith("-marker");
  const isRoad =
    entity.primitive === "road-surface" ||
    entity.primitive === "road-marking" ||
    entity.primitive === "sidewalk-surface";
  const isGreen = entity.primitive === "green-zone";
  const isRoof = entity.primitive === "osm-roof";
  const isBuilding = entity.primitive === "osm-building" || entity.primitive === "wall-block";

  return (
    <mesh
      castShadow={isBuilding && !isRoof}
      receiveShadow
      position={position}
      scale={scale}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      {isMarker ? (
        <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
      ) : (
        <boxGeometry args={[1, 1, 1]} />
      )}
      <meshStandardMaterial
        color={selected ? "#ffffff" : color}
        emissive={isMarker ? color : "#000000"}
        emissiveIntensity={isMarker ? 0.18 : 0}
        metalness={isWater ? 0 : 0.08}
        opacity={isWater ? 0.72 : isMarker ? 0.82 : 1}
        roughness={isWater ? 0.12 : isRoad ? 0.92 : isGreen ? 0.94 : 0.78}
        transparent={isWater || isMarker}
      />
      {selected && entity.id !== "hero" && (
        <SelectionBox
          center={[0, 0, 0]}
          size={isMarker ? [1.08, 1.08, 1.08] : [1.04, 1.04, 1.04]}
        />
      )}
    </mesh>
  );
};

export const EntityRenderer = ({
  entity,
  mobile = false,
  selected,
  onSelect,
  onPointerDown,
  onTransformObjectReady,
  runtimeTransformRef,
}) => {
  if (entity.primitive === "character") {
    return (
      <CharacterRenderer
        entity={entity}
        mobile={mobile}
        selected={selected}
        onSelect={onSelect}
        onPointerDown={onPointerDown}
        runtimeTransformRef={runtimeTransformRef}
      />
    );
  }

  if (entity.primitive === "gltf") {
    return (
      <Suspense
        fallback={
          <PropLoadingPlaceholder
            entity={entity}
            selected={selected}
            onSelect={onSelect}
          />
        }
      >
        <GltfEntity
          entity={entity}
          selected={selected}
          onSelect={onSelect}
          onTransformObjectReady={onTransformObjectReady}
        />
      </Suspense>
    );
  }

  if (entity.primitive === "obj") {
    return (
      <Suspense
        fallback={
          <PropLoadingPlaceholder
            entity={entity}
            selected={selected}
            onSelect={onSelect}
          />
        }
      >
        <ObjEntity
          entity={entity}
          selected={selected}
          onSelect={onSelect}
          onTransformObjectReady={onTransformObjectReady}
        />
      </Suspense>
    );
  }

  if (isBasicPrimitive(entity.primitive)) {
    return (
      <BasicPrimitiveEntity
        entity={entity}
        selected={selected}
        onSelect={onSelect}
        onTransformObjectReady={onTransformObjectReady}
      />
    );
  }

  if (entity.generated) {
    if (hasFootprintGeometry(entity)) {
      return (
        <GeneratedFootprintMesh
          entity={entity}
          selected={selected}
          onSelect={onSelect}
        />
      );
    }
    return (
      <GeneratedPrimitiveEntity
        entity={entity}
        selected={selected}
        onSelect={onSelect}
      />
    );
  }

  return (
    <MarkerEntity
      entity={entity}
      selected={selected}
      onSelect={onSelect}
    />
  );
};
