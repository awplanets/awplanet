/* eslint-disable react/prop-types */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

import { applySculptStampHeight } from "../../../terrain/terrainSculpt";
import { TERRAIN_TEXTURES } from "./terrainTextures";

const configureTexture = (texture, repeat = 12) => {
  if (!texture) return;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
};

const TexturedTerrainMaterial = ({ terrainId, terrain, params }) => {
  const config = TERRAIN_TEXTURES[terrainId] ?? TERRAIN_TEXTURES.snow;
  const textures = useTexture({
    map: config.map,
    normalMap: config.normalMap ?? config.map,
    roughnessMap: config.roughnessMap ?? config.map,
    aoMap: config.aoMap ?? config.map,
  });

  useMemo(() => {
    Object.values(textures).forEach((texture) =>
      configureTexture(texture, config.repeat)
    );
  }, [config.repeat, textures]);

  return (
    <meshStandardMaterial
      map={textures.map}
      normalMap={config.normalMap ? textures.normalMap : null}
      roughnessMap={config.roughnessMap ? textures.roughnessMap : null}
      aoMap={config.aoMap ? textures.aoMap : null}
      color={terrain.color}
      roughness={params.roughness ?? terrain.roughness}
      metalness={0}
      normalScale={
        new THREE.Vector2(0.55 + (params.relief ?? terrain.relief) * 0.7, 0.55)
      }
    />
  );
};

const MobileTerrainMaterial = ({ terrainId, terrain, params }) => {
  if (terrainId === "water") {
    return (
      <meshBasicMaterial
        color="#66b9cc"
        transparent
        opacity={0.72}
        depthWrite={false}
      />
    );
  }

  return (
    <meshStandardMaterial
      color={terrain.color}
      roughness={params.roughness ?? terrain.roughness}
      metalness={0}
    />
  );
};

const WaterMaterial = ({ params }) => {
  const materialRef = useRef();

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.normalScale.setScalar(
      0.26 + Math.sin(state.clock.elapsedTime * 0.9) * 0.035
    );
  });

  return (
    <meshPhysicalMaterial
      ref={materialRef}
      color="#66b9cc"
      roughness={0.08 + (params.roughness ?? 0.18) * 0.1}
      metalness={0}
      transmission={0.16}
      thickness={0.6}
      transparent
      opacity={0.72}
      envMapIntensity={1.4}
      clearcoat={1}
      clearcoatRoughness={0.04}
    />
  );
};

const createTerrainGeometry = (terrainId, sculptStamps = [], mobile = false) => {
  const segmentCount = mobile ? 28 : sculptStamps.length > 0 ? 52 : 64;
  const terrainSize = 160;
  const halfSize = terrainSize * 0.5;
  const step = terrainSize / segmentCount;
  const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segmentCount, segmentCount);
  if (terrainId === "water" || sculptStamps.length === 0) {
    return geometry;
  }

  const position = geometry.attributes.position;
  const heights = new Float32Array(position.count);

  sculptStamps.forEach((stamp) => {
    const radius = Math.max(stamp.radius ?? 1, 0.001);
    const minColumn = Math.max(
      0,
      Math.floor((stamp.x - radius + halfSize) / step)
    );
    const maxColumn = Math.min(
      segmentCount,
      Math.ceil((stamp.x + radius + halfSize) / step)
    );
    const minRow = Math.max(
      0,
      Math.floor((stamp.z - radius + halfSize) / step)
    );
    const maxRow = Math.min(
      segmentCount,
      Math.ceil((stamp.z + radius + halfSize) / step)
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const index = row * (segmentCount + 1) + column;
        const x = position.getX(index);
        const z = -position.getY(index);
        heights[index] = applySculptStampHeight(heights[index], x, z, stamp);
      }
    }
  });

  for (let index = 0; index < position.count; index += 1) {
    position.setZ(index, heights[index]);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

export const TerrainGround = ({
  terrainId,
  terrain,
  params,
  floorColor,
  mobile = false,
  sculptStamps,
  onGroundPointerDown,
  onGroundPointerMove,
  onGroundPointerUp,
  onGroundPointerLeave,
}) => {
  const meshRef = useRef();
  const geometry = useMemo(
    () => createTerrainGeometry(terrainId, sculptStamps, mobile),
    [mobile, sculptStamps, terrainId]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!meshRef.current || terrainId !== "water") return;
    meshRef.current.position.y =
      0.04 + Math.sin(state.clock.elapsedTime * 0.7) * 0.018;
  });

  return (
    <mesh
      ref={meshRef}
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, terrainId === "water" ? 0.04 : 0, 0]}
      onPointerDown={onGroundPointerDown}
      onPointerMove={onGroundPointerMove}
      onPointerUp={onGroundPointerUp}
      onPointerLeave={onGroundPointerLeave}
    >
      <primitive attach="geometry" object={geometry} />
      <Suspense
        fallback={
          <meshStandardMaterial
            color={floorColor ?? terrain.color}
            roughness={params.roughness ?? terrain.roughness}
          />
        }
      >
        {mobile ? (
          <MobileTerrainMaterial
            terrainId={terrainId}
            terrain={floorColor ? { ...terrain, color: floorColor } : terrain}
            params={params}
          />
        ) : terrainId === "water" ? (
          <WaterMaterial params={params} />
        ) : terrainId === "blank" ? (
          <meshStandardMaterial
            color={floorColor ?? terrain.color}
            roughness={params.roughness ?? terrain.roughness}
            metalness={0}
          />
        ) : floorColor ? (
          <meshStandardMaterial
            color={floorColor}
            roughness={0.82}
            metalness={0}
          />
        ) : (
          <TexturedTerrainMaterial
            terrainId={terrainId}
            terrain={floorColor ? { ...terrain, color: floorColor } : terrain}
            params={params}
          />
        )}
      </Suspense>
    </mesh>
  );
};

const createGrassBladeGeometry = () => {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const levels = [0, 0.34, 0.7, 1];
  const widths = [0.042, 0.037, 0.021, 0.002];
  const bladeAngles = [0, Math.PI / 3, (Math.PI * 2) / 3];

  bladeAngles.forEach((angle, bladeIndex) => {
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const perpendicularX = -directionZ;
    const perpendicularZ = directionX;
    const centerX = directionX * 0.045;
    const centerZ = directionZ * 0.045;
    const vertexOffset = positions.length / 3;

    levels.forEach((height, levelIndex) => {
      const halfWidth = widths[levelIndex];
      const forwardCurve = height * height * 0.09;
      [-1, 1].forEach((side) => {
        const shade = 0.56 + height * 0.44;
        positions.push(
          centerX + perpendicularX * halfWidth * side + directionX * forwardCurve,
          height,
          centerZ + perpendicularZ * halfWidth * side + directionZ * forwardCurve
        );
        uvs.push(side < 0 ? 0 : 1, height);
        colors.push(shade, shade, shade);
      });
    });

    for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
      const lowerLeft = vertexOffset + levelIndex * 2;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + 2;
      const upperRight = lowerLeft + 3;
      indices.push(
        lowerLeft,
        lowerRight,
        upperLeft,
        lowerRight,
        upperRight,
        upperLeft
      );
    }

    // Slightly vary the blade silhouettes without creating extra draw calls.
    positions[vertexOffset * 3 + 1] += bladeIndex * 0.004;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

const seededRandom = (index, salt) => {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const createGrassMaterial = (wind) => {
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    vertexColors: true,
    toneMapped: true,
    fog: true,
  });
  material.userData.shader = null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: wind };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uGrassTime;
uniform float uWindStrength;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float grassHeightFactor = clamp(position.y, 0.0, 1.0);
  vec3 grassOrigin = vec3(instanceMatrix[3]);
  float grassPhase = grassOrigin.x * 0.173 + grassOrigin.z * 0.117;
  float grassBaseWave = sin(uGrassTime * 1.22 + grassPhase);
  float grassFineWave = sin(uGrassTime * 2.47 + grassPhase * 1.73) * 0.34;
  float grassGust = sin(uGrassTime * 0.31 + grassOrigin.z * 0.025) * 0.25;
  float grassBend = (grassBaseWave + grassFineWave + grassGust)
    * uWindStrength
    * grassHeightFactor
    * grassHeightFactor;
  transformed.x += grassBend * 0.24;
  transformed.z += grassBend * 0.13;
#endif`
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => "awplanet-dense-grass-v2";
  return material;
};

export const InstancedGrass = ({
  density,
  height = 1.18,
  wind = 1.08,
  colorVariation = 0.92,
}) => {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => createGrassBladeGeometry(), []);
  const material = useMemo(() => createGrassMaterial(wind), [wind]);
  const count = Math.round(5200 + Math.max(0, density) * 7200);
  const instanceColors = useMemo(() => {
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color("#4f8b3d");
    const warmColor = new THREE.Color("#739c49");
    const deepColor = new THREE.Color("#2d6034");
    const color = new THREE.Color();

    for (let index = 0; index < count; index += 1) {
      const colorMix = seededRandom(index, 8);
      color.copy(baseColor);
      color.lerp(
        colorMix > 0.56 ? warmColor : deepColor,
        colorMix * colorVariation * 0.58
      );
      color.offsetHSL(
        (seededRandom(index, 9) - 0.5) * 0.025 * colorVariation,
        0,
        (seededRandom(index, 10) - 0.5) * 0.09 * colorVariation
      );
      color.toArray(colors, index * 3);
    }

    return new THREE.InstancedBufferAttribute(colors, 3);
  }, [colorVariation, count]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh?.instanceMatrix) return;

    for (let index = 0; index < count; index += 1) {
      const angle = seededRandom(index, 1) * Math.PI * 2;
      const radius = Math.sqrt(seededRandom(index, 2)) * 69;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 1.5;
      const yaw = seededRandom(index, 3) * Math.PI;
      const leanX = (seededRandom(index, 4) - 0.5) * 0.16;
      const leanZ = (seededRandom(index, 5) - 0.5) * 0.16;
      const heightScale =
        Math.max(0.55, height) * (0.66 + seededRandom(index, 6) * 0.58);
      const widthScale = 0.72 + seededRandom(index, 7) * 0.48;

      dummy.position.set(x, 0.015, z);
      dummy.rotation.set(leanX, yaw, leanZ);
      dummy.scale.set(widthScale, heightScale * 1.42, widthScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, dummy, height]);

  useFrame((state) => {
    const shader = material.userData.shader;
    if (!shader) return;
    shader.uniforms.uGrassTime.value = state.clock.elapsedTime;
    shader.uniforms.uWindStrength.value = wind;
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      castShadow={false}
      frustumCulled={false}
    >
      <primitive attach="instanceColor" object={instanceColors} />
    </instancedMesh>
  );
};

export const WaterRipples = ({ visible }) => {
  const groupRef = useRef();

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, index) => {
      const pulse = (Math.sin(state.clock.elapsedTime * 1.8 + index) + 1) * 0.5;
      child.scale.setScalar(1 + pulse * 1.8 + index * 0.25);
      child.material.opacity = visible ? (1 - pulse) * 0.26 : 0;
    });
  });

  return (
    <group ref={groupRef} position={[0, 0.085, -2]}>
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[index * 0.4 - 0.4, 0, index * -0.35]}
        >
          <ringGeometry args={[0.7, 0.73, 48]} />
          <meshBasicMaterial
            color="#e9fbff"
            transparent
            opacity={0.2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};
