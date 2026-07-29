/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import InfiniteSnowGround from "./components/InfiniteSnowGround";
import { DEFAULT_TERRAIN_SETTINGS } from "./data/terrainSettings";

const SCENE_PALETTES = {
  snow: {
    background: "#f6fbff",
    fog: "#f4faff",
  },
  sand: {
    background: "#dec489",
    fog: "#d9bd79",
  },
  grass: {
    background: "#8fa97d",
    fog: "#8aa577",
  },
  water: {
    background: "#476f66",
    fog: "#476f66",
  },
  stone: {
    background: "#a4aaad",
    fog: "#9aa1a5",
  },
  backroom: {
    background: "#a49447",
    fog: "#b19d47",
  },
};

const applyColorGain = (color, gain) => {
  const output = new THREE.Color(color);
  output.multiplyScalar(gain);
  return `#${output.getHexString()}`;
};

const FollowSunLight = ({ terrain }) => {
  const lightRef = useRef();
  const targetRef = useRef();
  const forward = useMemo(() => new THREE.Vector3(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const sunOffset = useMemo(() => new THREE.Vector3(32, 58, 28), []);

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) return;

    lightRef.current.target = targetRef.current;
    lightRef.current.target.updateMatrixWorld();
  }, []);

  useFrame(({ camera }) => {
    if (!lightRef.current || !targetRef.current) return;

    camera.getWorldDirection(forward);
    targetPosition.copy(camera.position).addScaledVector(forward, 72);
    targetPosition.y = 0;

    targetRef.current.position.copy(targetPosition);
    lightRef.current.position.copy(targetPosition).add(sunOffset);
    targetRef.current.updateMatrixWorld();
    lightRef.current.target.updateMatrixWorld();
  });

  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        position={[32, 58, 28]}
        intensity={terrain === "backroom" ? 0.32 : terrain === "water" ? 2.1 : 2.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={8}
        shadow-camera-far={220}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
        shadow-bias={-0.00018}
        shadow-normalBias={0.04}
      />
    </>
  );
};

const Scene = ({
  terrain,
  terrainSettings,
  selectedAssetKey,
  placedObjects,
  onPlaceObject,
  objectEditMode,
  selectedObjectId,
  onSelectObject,
  brushEnabled,
  brushMode,
  brushSize,
}) => {
  const palette = SCENE_PALETTES[terrain] || SCENE_PALETTES.snow;
  const settings =
    terrainSettings?.[terrain] ?? DEFAULT_TERRAIN_SETTINGS[terrain] ?? {};
  const brightness = settings.brightness ?? 1;
  const fogScale = settings.fog ?? 1;
  const fogNear = terrain === "water" ? 120 : terrain === "backroom" ? 58 : 120;
  const fogFar = terrain === "water" ? 560 : terrain === "backroom" ? 360 : 680;

  return (
    <Canvas
      camera={{ fov: 65, position: [0, 30, 100] }}
      dpr={1}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={[applyColorGain(palette.background, brightness)]} />
      <fog
        attach="fog"
        args={[
          applyColorGain(palette.fog, brightness),
          fogNear * fogScale,
          fogFar * fogScale,
        ]}
      />

      <FollowSunLight terrain={terrain} />

      <ambientLight
        color={terrain === "backroom" ? "#ffe985" : "#ffffff"}
        intensity={terrain === "backroom" ? 0.46 : 0.78}
      />

      <InfiniteSnowGround
        terrain={terrain}
        terrainSettings={settings}
        selectedAssetKey={selectedAssetKey}
        placedObjects={placedObjects}
        onPlaceObject={onPlaceObject}
        objectEditMode={objectEditMode}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
        brushEnabled={brushEnabled}
        brushMode={brushMode}
        brushSize={brushSize}
      />
    </Canvas>
  );
};

export default Scene;
