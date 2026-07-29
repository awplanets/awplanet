/* eslint-disable react/prop-types */
import { useMemo } from "react";
import * as THREE from "three";

const SURFACE_PRIMITIVES = new Set(["water-surface", "green-zone", "osm-roof"]);

const createShape = (footprint) => {
  const shape = new THREE.Shape();
  footprint.forEach(([x, z], index) => {
    if (index === 0) {
      shape.moveTo(x, -z);
    } else {
      shape.lineTo(x, -z);
    }
  });
  shape.closePath();
  return shape;
};

const createGeometry = (entity) => {
  const shape = createShape(entity.footprint);
  const primitive = entity.primitive;
  const isSurface = SURFACE_PRIMITIVES.has(primitive);

  const geometry =
    primitive === "osm-building"
      ? new THREE.ExtrudeGeometry(shape, {
          depth: Math.max(0.24, entity.height ?? entity.scale?.[1] ?? 1),
          bevelEnabled: true,
          bevelSize: 0.035,
          bevelThickness: 0.025,
          bevelSegments: 1,
        })
      : new THREE.ShapeGeometry(shape);

  geometry.rotateX(-Math.PI / 2);
  if (isSurface) {
    geometry.translate(0, entity.position?.[1] ?? 0.05, 0);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
};

const getMaterialProps = (entity, selected) => {
  const color = selected ? "#ffffff" : entity.color ?? "#9bd4c8";
  if (entity.primitive === "water-surface") {
    return {
      color,
      metalness: 0,
      opacity: 0.64,
      roughness: 0.08,
      transparent: true,
      transmission: 0.14,
    };
  }

  if (entity.primitive === "green-zone") {
    return {
      color,
      metalness: 0.02,
      roughness: 0.96,
    };
  }

  if (entity.primitive === "osm-roof") {
    return {
      color,
      metalness: 0.02,
      roughness: 0.78,
    };
  }

  return {
    color,
    metalness: 0.05,
    roughness: 0.66,
  };
};

export const GeneratedFootprintMesh = ({ entity, selected, onSelect }) => {
  const geometry = useMemo(() => createGeometry(entity), [entity]);
  const materialProps = getMaterialProps(entity, selected);
  const isWater = entity.primitive === "water-surface";
  const isBuilding = entity.primitive === "osm-building";

  return (
    <mesh
      castShadow={isBuilding}
      geometry={geometry}
      receiveShadow
      userData={{ cameraOccluder: isBuilding }}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(entity.id);
            }
          : undefined
      }
    >
      {isWater ? (
        <meshPhysicalMaterial {...materialProps} />
      ) : (
        <meshStandardMaterial
          {...materialProps}
          emissive={selected ? "#9bd4c8" : "#000000"}
          emissiveIntensity={selected ? 0.08 : 0}
        />
      )}
      {selected && entity.id !== "hero" && (
        <lineSegments renderOrder={90}>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial
            color="#b9fff1"
            depthTest={false}
            transparent
            opacity={0.96}
          />
        </lineSegments>
      )}
    </mesh>
  );
};
