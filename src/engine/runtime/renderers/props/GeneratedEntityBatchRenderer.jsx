/* eslint-disable react/prop-types */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { GeneratedFootprintMesh } from "./GeneratedFootprintMesh";
import { hasFootprintGeometry } from "./generatedFootprintGeometry";

const colorScratch = new THREE.Color();

const createGroups = (entities) =>
  entities.reduce(
    (groups, entity) => {
      if (hasFootprintGeometry(entity)) {
        groups.footprints.push(entity);
      } else if (entity.primitive === "water-channel" || entity.primitive === "water-surface") {
        groups.water.push(entity);
      } else if (entity.primitive === "road-surface") {
        groups.roads.push(entity);
      } else if (entity.primitive === "sidewalk-surface") {
        groups.sidewalks.push(entity);
      } else if (entity.primitive === "road-marking") {
        groups.roadMarkings.push(entity);
      } else if (entity.primitive === "green-zone") {
        groups.green.push(entity);
      } else if (entity.primitive === "osm-roof") {
        groups.roofs.push(entity);
      } else if (entity.primitive?.endsWith("-marker")) {
        groups.markers.push(entity);
      } else if (entity.primitive === "wall-block" || entity.primitive === "osm-building") {
        groups.walls.push(entity);
      } else {
        groups.ground.push(entity);
      }
      return groups;
    },
    {
      walls: [],
      roofs: [],
      ground: [],
      green: [],
      roads: [],
      sidewalks: [],
      roadMarkings: [],
      water: [],
      markers: [],
      footprints: [],
    }
  );

const InstancedGeneratedGroup = ({
  entities,
  geometry,
  material,
  castShadow = true,
  cameraOccluder = false,
}) => {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.userData.cameraOccluder = cameraOccluder;

    entities.forEach((entity, index) => {
      const position = entity.position ?? [0, 0, 0];
      const rotation = entity.rotation ?? [0, 0, 0];
      const scale = entity.scale ?? [1, 1, 1];

      dummy.position.fromArray(position);
      dummy.rotation.set(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0);
      dummy.scale.fromArray(scale);
      dummy.updateMatrix();

      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, colorScratch.set(entity.color ?? "#9bd4c8"));
    });

    mesh.count = entities.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [cameraOccluder, dummy, entities]);

  if (entities.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, entities.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
      userData={{ cameraOccluder }}
    >
      {geometry}
      {material}
    </instancedMesh>
  );
};

export const GeneratedEntityBatchRenderer = ({ entities }) => {
  const groups = useMemo(() => createGroups(entities), [entities]);

  return (
    <>
      {groups.footprints.map((entity) => (
        <GeneratedFootprintMesh
          entity={entity}
          key={entity.id}
        />
      ))}
      <InstancedGeneratedGroup
        entities={groups.walls}
        cameraOccluder
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0.06}
            roughness={0.68}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.roofs}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0.04}
            roughness={0.76}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.roads}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0.02}
            roughness={0.92}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.sidewalks}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0.02}
            roughness={0.86}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.roadMarkings}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0}
            roughness={0.58}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.ground}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0.08}
            roughness={0.86}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.green}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            vertexColors
            metalness={0.02}
            roughness={0.94}
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.water}
        castShadow={false}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshPhysicalMaterial
            vertexColors
            metalness={0}
            opacity={0.66}
            roughness={0.12}
            transmission={0.18}
            transparent
          />
        }
      />
      <InstancedGeneratedGroup
        entities={groups.markers}
        castShadow={false}
        geometry={<cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
        material={
          <meshStandardMaterial
            vertexColors
            emissive="#111111"
            emissiveIntensity={0.18}
            opacity={0.82}
            transparent
          />
        }
      />
    </>
  );
};
