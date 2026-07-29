/* eslint-disable react/prop-types */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";

import { importCharacterFbxAsset } from "../engine/layers/assets/importers/characterImporter";
import {
  DEFAULT_ANIMATION_SET,
  applyDirectorPose,
  getDirectorPoseId,
  retargetClipToScene,
  normalizeBoneName,
} from "../engine/runtime/renderers/characters/characterPoseUtils";

const DEFAULT_HERO_URL = "/animations/uploaded/Standing%20Idle.fbx";

const PreviewCamera = () => {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 2.05, 8.9);
    camera.lookAt(0, 1.45, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
};

const createSceneNameMap = (scene) => {
  const nameMap = new Map();
  scene.traverse((child) => {
    if (child.name) {
      nameMap.set(normalizeBoneName(child.name), child.name);
    }
  });
  return nameMap;
};

const PreviewCharacter = ({ character, action }) => {
  const mixerRef = useRef(null);
  const modelFbx = useLoader(
    FBXLoader,
    character?.modelUrl ?? DEFAULT_HERO_URL
  );
  const animationSet = character?.animationSet ?? DEFAULT_ANIMATION_SET;
  const actionUrl =
    getDirectorPoseId(action?.id) || !action?.id
      ? animationSet.idle ?? DEFAULT_ANIMATION_SET.idle
      : animationSet[action.id] ?? DEFAULT_ANIMATION_SET[action.id] ?? animationSet.idle;
  const actionFbx = useLoader(FBXLoader, actionUrl);
  const imported = useMemo(
    () =>
      importCharacterFbxAsset(modelFbx, {
        modelUrl: character?.modelUrl ?? DEFAULT_HERO_URL,
        targetHeight: character?.targetHeight ?? 6.8,
      }),
    [character?.modelUrl, character?.targetHeight, modelFbx]
  );
  const sceneNameMap = useMemo(
    () => createSceneNameMap(imported.object),
    [imported.object]
  );
  const clip = useMemo(() => {
    const sourceClip = actionFbx.animations?.[0];
    if (!sourceClip) return null;
    return retargetClipToScene(sourceClip, action?.id ?? "idle", sceneNameMap);
  }, [action?.id, actionFbx.animations, sceneNameMap]);

  useEffect(() => {
    if (!clip || !imported.object) return undefined;

    const mixer = new THREE.AnimationMixer(imported.object);
    const clipAction = mixer.clipAction(clip);
    clipAction.enabled = true;
    clipAction.setLoop(THREE.LoopRepeat, Infinity);
    clipAction.reset().fadeIn(0.08).play();
    mixerRef.current = mixer;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(imported.object);
      mixerRef.current = null;
    };
  }, [clip, imported.object]);

  useFrame((_, delta) => {
    mixerRef.current?.update(Math.min(delta, 0.033));
    applyDirectorPose(imported.object, action?.id);
  });

  return (
    <group
      rotation={[0, Math.PI, 0]}
      scale={[
        imported.normalizedScale * 0.46,
        imported.normalizedScale * 0.46,
        imported.normalizedScale * 0.46,
      ]}
    >
      <primitive object={imported.object} />
    </group>
  );
};

const CharacterActionPreview = ({ character, action }) => (
  <div className="character-action-preview" aria-label="Character action preview">
    <Canvas
      dpr={[0.75, 1]}
      camera={{ position: [0, 2.05, 8.9], fov: 28 }}
      gl={{
        alpha: false,
        antialias: false,
        powerPreference: "low-power",
        stencil: false,
      }}
    >
      <color attach="background" args={["#10151b"]} />
      <ambientLight intensity={1.55} />
      <directionalLight position={[3.4, 4.8, 5.8]} intensity={2.2} />
      <directionalLight position={[-3.8, 2.6, -3.2]} intensity={0.72} />
      <PreviewCamera />
      <Suspense fallback={null}>
        <PreviewCharacter character={character} action={action} />
      </Suspense>
    </Canvas>
    <div className="character-action-preview__caption">
      <span>{action?.label ?? "Idle"}</span>
      <strong>{action?.detail ?? "Neutral standing loop"}</strong>
    </div>
  </div>
);

export default CharacterActionPreview;
