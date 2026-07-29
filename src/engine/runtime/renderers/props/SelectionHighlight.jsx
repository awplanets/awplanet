/* eslint-disable react/prop-types */
import { useEffect, useMemo } from "react";
import * as THREE from "three";

const HIGHLIGHT_COLOR = "#b9fff1";

const expandGeometryAlongNormals = (sourceGeometry, amount) => {
  const geometry = sourceGeometry.clone();
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setXYZ(
      index,
      positions.getX(index) + normals.getX(index) * amount,
      positions.getY(index) + normals.getY(index) * amount,
      positions.getZ(index) + normals.getZ(index) * amount
    );
  }

  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const createObjectOutlineParts = (object, padding) => {
  if (!object) return [];

  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const rootBounds = new THREE.Box3();
  const sourceParts = [];

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    child.updateWorldMatrix(true, false);
    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox();
    }

    const meshMatrix = rootInverse.clone().multiply(child.matrixWorld);
    const meshBounds = child.geometry.boundingBox
      .clone()
      .applyMatrix4(meshMatrix);
    rootBounds.union(meshBounds);
    sourceParts.push({ child, meshMatrix });
  });

  if (rootBounds.isEmpty() || sourceParts.length === 0) return [];

  const size = rootBounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const outlineWidth = THREE.MathUtils.clamp(
    maxDimension * Math.max(0.0035, padding - 1) * 0.28,
    maxDimension * 0.0035,
    maxDimension * 0.01
  );

  return sourceParts.map(({ child, meshMatrix }) => ({
    geometry: expandGeometryAlongNormals(child.geometry, outlineWidth),
    matrix: meshMatrix,
    skeleton: child.isSkinnedMesh ? child.skeleton : null,
    bindMatrix: child.isSkinnedMesh ? child.bindMatrix : null,
    bindMatrixInverse: child.isSkinnedMesh ? child.bindMatrixInverse : null,
  }));
};

export const SelectionBox = ({
  center = [0, 0, 0],
  size = [1, 1, 1],
  opacity = 0.96,
}) => {
  const geometry = useMemo(
    () =>
      new THREE.BoxGeometry(
        Math.max(0.05, size[0]),
        Math.max(0.05, size[1]),
        Math.max(0.05, size[2])
      ),
    [size]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments position={center} renderOrder={90}>
      <edgesGeometry args={[geometry]} />
      <lineBasicMaterial
        color={HIGHLIGHT_COLOR}
        depthTest={false}
        transparent
        opacity={opacity}
      />
    </lineSegments>
  );
};

export const SelectionHighlight = ({ object, padding = 1.018 }) => {
  const parts = useMemo(
    () => createObjectOutlineParts(object, padding),
    [object, padding]
  );

  useEffect(
    () => () => {
      parts.forEach((part) => part.geometry.dispose());
    },
    [parts]
  );

  if (parts.length === 0) return null;

  return (
    <group renderOrder={90}>
      {parts.map((part, index) => {
        const commonProps = {
          geometry: part.geometry,
          matrix: part.matrix,
          matrixAutoUpdate: false,
          renderOrder: 90,
        };

        const material = (
          <meshBasicMaterial
            color={HIGHLIGHT_COLOR}
            side={THREE.BackSide}
            depthTest
            depthWrite={false}
            transparent
            opacity={0.72}
            toneMapped={false}
          />
        );

        if (part.skeleton) {
          return (
            <skinnedMesh
              key={`${part.geometry.uuid}-${index}`}
              {...commonProps}
              skeleton={part.skeleton}
              bindMatrix={part.bindMatrix}
              bindMatrixInverse={part.bindMatrixInverse}
            >
              {material}
            </skinnedMesh>
          );
        }

        return (
          <mesh key={`${part.geometry.uuid}-${index}`} {...commonProps}>
            {material}
          </mesh>
        );
      })}
    </group>
  );
};
