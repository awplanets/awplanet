/* eslint-disable react/prop-types */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";

import { importCharacterFbxAsset } from "../engine/layers/assets/importers/characterImporter";
import {
  translateUiText,
  useUiLanguage,
} from "../editor/uiLanguage";

const DEFAULT_HERO_URL = "/animations/uploaded/Standing%20Idle.fbx";
const HERO_PREVIEW_FIT_SCALE = 0.62;
const VERTIGO_FACE_FOCUS_HEIGHT = 5.65;

const clampFov = (fov) => THREE.MathUtils.clamp(fov, 24, 72);

const easeInOut = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const easedPulse = (time) => (Math.sin(time - Math.PI * 0.5) + 1) * 0.5;

const getPreviewCamera = (preset) => {
  const camera = preset?.camera ?? {};
  const mode = camera.mode ?? "third-person";
  const distance = camera.followDistance ?? 18;
  const height = camera.followHeight ?? 8;
  const lateral = camera.shotLateralOffset ?? 0;
  const pitch = camera.shotPitchOffset ?? 0;
  const targetLead = camera.targetLead ?? 0;
  const motionType = camera.motionType ?? "none";
  const amplitude = camera.motionAmplitude ?? 0;
  const targetY =
    motionType === "vertigo"
      ? Math.max(camera.lookHeight ?? 0, VERTIGO_FACE_FOCUS_HEIGHT) *
        HERO_PREVIEW_FIT_SCALE
      : 2.45;

  const target = new THREE.Vector3(targetLead * 0.08, targetY + (camera.compositionY ?? 0), 0);
  let position = new THREE.Vector3(lateral * 0.45, 3.4 + height * 0.18, distance * 0.42);

  if (mode === "first-person") {
    position = new THREE.Vector3(0, 3.6, 3.4);
    target.set(0, 2.8, -0.2);
  } else if (mode === "isometric") {
    position = new THREE.Vector3(-6.5, 8.5, 7.2);
    target.set(0, 2.7, 0);
  }

  if (motionType === "vertigo") {
    position.z += amplitude < 0 ? -2.4 : 2.4;
    position.y = target.y;
  } else if (motionType === "push" || motionType === "dolly") {
    position.z -= 2.1;
  } else if (motionType === "pull") {
    position.z += 2.8;
  } else if (motionType === "truck") {
    position.x += 3.2;
  } else if (motionType === "arc" || motionType === "orbit") {
    position.x -= 3.4;
    position.z += 1.4;
  } else if (motionType === "crane" || motionType === "boom") {
    position.y += 3.4;
  } else if (preset?.id === "surveillance") {
    position.set(-7, 6.2, 12.5);
  } else if (preset?.id === "shoulder") {
    position.set(1.75, 3.9, 5.9);
  } else if (preset?.id === "low-chase") {
    position.set(0, 2.8, 7.6);
  } else if (preset?.id === "snorri-lock") {
    position.set(0, 3.3, -5.2);
    target.set(0, 2.7, 0);
  }

  target.x += camera.compositionX ?? 0;
  target.y += pitch * 1.8;

  return {
    fov: clampFov((camera.fov ?? 45) + (camera.fovSwing ?? 0) * 0.35),
    position,
    roll: camera.cameraRoll ?? (motionType === "dutch" ? -0.16 : 0),
    target,
  };
};

const HeroModel = ({ hero }) => {
  const mixerRef = useRef(null);
  const fbx = useLoader(FBXLoader, hero?.modelUrl ?? DEFAULT_HERO_URL);
  const imported = useMemo(
    () =>
      importCharacterFbxAsset(fbx, {
        modelUrl: hero?.modelUrl ?? DEFAULT_HERO_URL,
        targetHeight: hero?.targetHeight ?? 6.8,
      }),
    [fbx, hero?.modelUrl, hero?.targetHeight]
  );
  const scale = hero?.scale ?? [1, 1, 1];

  useEffect(() => {
    const [clip] = fbx.animations ?? [];
    if (!clip || clip.tracks.length === 0) return undefined;

    const mixer = new THREE.AnimationMixer(imported.object);
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.clampWhenFinished = false;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.reset().fadeIn(0.08).play();
    mixerRef.current = mixer;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(imported.object);
      mixerRef.current = null;
    };
  }, [fbx.animations, imported.object]);

  useFrame((_, delta) => {
    mixerRef.current?.update(Math.min(delta, 0.033));
  });

  return (
    <group
      rotation={[0, Math.PI, 0]}
      scale={[
        imported.normalizedScale * scale[0] * HERO_PREVIEW_FIT_SCALE,
        imported.normalizedScale * scale[1] * HERO_PREVIEW_FIT_SCALE,
        imported.normalizedScale * scale[2] * HERO_PREVIEW_FIT_SCALE,
      ]}
    >
      <primitive object={imported.object} />
    </group>
  );
};

const PreviewCamera = ({ preset, motionLoop = true }) => {
  const { camera } = useThree();
  const clockRef = useRef(0);
  const prevPresetIdRef = useRef(null);
  const desiredPositionRef = useRef(new THREE.Vector3());
  const desiredTargetRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const horizontalDirectionRef = useRef(new THREE.Vector3());
  const rightRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3(0, 1, 0));
  const previewCamera = useMemo(() => getPreviewCamera(preset), [preset]);

  useFrame((state, delta) => {
    const cameraSettings = preset?.camera ?? {};
    const presetId = preset?.id ?? "preview";
    if (prevPresetIdRef.current !== presetId) {
      prevPresetIdRef.current = presetId;
      clockRef.current = 0;
      camera.position.copy(previewCamera.position);
      camera.fov = previewCamera.fov;
      camera.lookAt(previewCamera.target);
      camera.rotation.z += previewCamera.roll;
      camera.updateProjectionMatrix();
      return;
    }

    const motionType = cameraSettings.motionType ?? "none";
    const amplitude = cameraSettings.motionAmplitude ?? 0;
    const speed = Math.max(0.04, cameraSettings.motionSpeed ?? 0.4);
    const cycle = Math.PI * 2;
    clockRef.current =
      motionType === "none"
        ? 0
        : motionLoop
          ? clockRef.current + delta * speed * cycle
          : Math.min(cycle, clockRef.current + delta * speed * cycle);

    const oneShotProgress = easeInOut(clockRef.current / cycle);
    const time =
      (motionLoop ? clockRef.current : oneShotProgress * cycle) +
      (cameraSettings.motionPhase ?? 0) * cycle;
    const loopPhase =
      ((clockRef.current / cycle + (cameraSettings.motionPhase ?? 0)) % 1 + 1) %
      1;
    const loopProgress = easeInOut(
      loopPhase < 0.5 ? loopPhase * 2 : (1 - loopPhase) * 2
    );
    const pulse = motionLoop ? easedPulse(time) : oneShotProgress;
    const signedPulse = motionLoop ? Math.sin(time) : oneShotProgress;
    const directedProgress =
      motionType === "vertigo" && motionLoop ? loopProgress : signedPulse;
    const orbitAngle = motionLoop ? time : oneShotProgress * Math.PI;

    const desiredPosition = desiredPositionRef.current.copy(previewCamera.position);
    const desiredTarget = desiredTargetRef.current.copy(previewCamera.target);
    const forward = directionRef.current
      .subVectors(desiredTarget, desiredPosition)
      .normalize();
    const right = rightRef.current.crossVectors(forward, upRef.current).normalize();
    let dynamicFov = previewCamera.fov;
    let dynamicRoll = previewCamera.roll;

    if (motionType !== "none" && Math.abs(amplitude) > 0.001) {
      if (motionType === "orbit") {
        desiredPosition
          .addScaledVector(right, Math.sin(orbitAngle) * amplitude * 1.55)
          .addScaledVector(forward, (Math.cos(orbitAngle) - 1) * amplitude * 0.78);
      } else if (motionType === "dolly") {
        desiredPosition.addScaledVector(forward, signedPulse * amplitude * 1.1);
      } else if (motionType === "vertigo") {
        const horizontalForward = horizontalDirectionRef.current
          .set(forward.x, 0, forward.z)
          .normalize();
        const baseDistance = Math.max(1.6, desiredPosition.distanceTo(desiredTarget));
        const baseFovRadians = THREE.MathUtils.degToRad(previewCamera.fov);
        const lockedFrameHeight = baseDistance * Math.tan(baseFovRadians * 0.5);
        const dollyOffset = directedProgress * amplitude * 0.42;
        desiredPosition.addScaledVector(horizontalForward, dollyOffset);
        desiredPosition.y = previewCamera.position.y;
        const effectiveDistance = Math.max(1.6, desiredPosition.distanceTo(desiredTarget));
        dynamicFov = clampFov(
          THREE.MathUtils.radToDeg(
            2 * Math.atan(lockedFrameHeight / effectiveDistance)
          )
        );
      } else if (motionType === "push") {
        desiredPosition.addScaledVector(forward, pulse * amplitude * 1.2);
        dynamicFov = clampFov(previewCamera.fov + pulse * (cameraSettings.fovSwing ?? 0));
      } else if (motionType === "pull") {
        desiredPosition.addScaledVector(forward, -pulse * amplitude * 1.2);
        dynamicFov = clampFov(previewCamera.fov + pulse * (cameraSettings.fovSwing ?? 0));
      } else if (motionType === "truck") {
        desiredPosition.addScaledVector(right, signedPulse * amplitude * 1.4);
        desiredTarget.addScaledVector(right, signedPulse * amplitude * 0.36);
      } else if (motionType === "arc") {
        desiredPosition
          .addScaledVector(right, Math.sin(orbitAngle) * amplitude * 1.45)
          .addScaledVector(forward, (Math.cos(orbitAngle) - 1) * amplitude * 0.62);
        desiredTarget.addScaledVector(right, signedPulse * amplitude * 0.2);
      } else if (motionType === "crane" || motionType === "boom") {
        desiredPosition.y += (motionType === "boom" ? pulse : signedPulse) * amplitude * 0.88;
        desiredTarget.y += Math.sin(time + Math.PI * 0.25) * amplitude * 0.18;
      } else if (motionType === "pan") {
        desiredTarget.addScaledVector(right, signedPulse * amplitude * 2.1);
        dynamicFov = clampFov(previewCamera.fov + signedPulse * (cameraSettings.fovSwing ?? 0));
      } else if (motionType === "dutch") {
        dynamicRoll += signedPulse * amplitude;
        dynamicFov = clampFov(previewCamera.fov + signedPulse * (cameraSettings.fovSwing ?? 0) * 0.35);
      } else if (motionType === "pulse") {
        desiredPosition.addScaledVector(forward, signedPulse * amplitude);
        dynamicFov = clampFov(previewCamera.fov + signedPulse * (cameraSettings.fovSwing ?? 0));
      } else if (motionType === "handheld") {
        const jitterX = Math.sin(time * 2.17) * amplitude * 1.45;
        const jitterY = Math.sin(time * 3.61 + 0.8) * amplitude * 0.55;
        const jitterZ = Math.sin(time * 1.47 + 1.6) * amplitude * 0.36;
        desiredPosition.addScaledVector(right, jitterX);
        desiredPosition.y += jitterY;
        desiredPosition.addScaledVector(forward, jitterZ);
        desiredTarget.addScaledVector(right, jitterX * 0.24);
        desiredTarget.y += jitterY * 0.3;
      }
    }

    const smoothing = 1 - Math.exp(-9 * delta);
    camera.position.lerp(desiredPosition, smoothing);
    camera.fov = THREE.MathUtils.lerp(camera.fov, dynamicFov, smoothing);
    camera.lookAt(desiredTarget);
    camera.rotation.z += dynamicRoll;
    camera.updateProjectionMatrix();

    state.invalidate();
  });

  return null;
};

const CameraHeroPreview = ({ hero, preset, motionLoop = true }) => {
  const language = useUiLanguage();
  return (
    <div
      className="engine-camera-hero-preview"
      aria-label={translateUiText("Camera hero preview", language)}
    >
      <Canvas
        dpr={[0.75, 1]}
        frameloop="always"
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
          preserveDrawingBuffer: false,
        }}
        shadows={false}
      >
        <PreviewCamera preset={preset} motionLoop={motionLoop} />
        <color attach="background" args={["#0b1015"]} />
        <ambientLight intensity={1.45} />
        <directionalLight position={[3.5, 6, 5]} intensity={2.1} />
        <directionalLight position={[-4, 3, -2]} intensity={0.7} />
        <Suspense fallback={null}>
          <HeroModel hero={hero} />
        </Suspense>
      </Canvas>
      <div className="engine-camera-hero-preview__caption">
        <span>{translateUiText(preset?.detail ?? "Preview", language)}</span>
        <strong>{translateUiText(preset?.label ?? "Camera", language)}</strong>
      </div>
    </div>
  );
};

export default CameraHeroPreview;
