/* eslint-disable react/prop-types */
import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useThree, useFrame, useLoader } from "@react-three/fiber";
import { useTexture, useAnimations } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Water } from "three/examples/jsm/objects/Water2.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import {
  NATURE_ASSETS,
  NATURE_ASSET_KEYS,
  NATURE_ASSET_URLS,
} from "../data/natureAssets";

// Utils
import { lerpAngle } from "../utils/helper-functions";

// Constants for world and character configuration
const CHUNK_SIZE = 50;
const CHUNKS_PER_SIDE = 3;
const GRID_RESOLUTION = 128;
const WALK_SPEED = 18;
const RUN_SPEED = 34;
const TURN_SPEED = Math.PI * 1.25;
const CHUNK_UPDATES_PER_FRAME = 2;
const CHUNK_UNLOAD_DISTANCE = CHUNK_SIZE * 5;
const CHUNK_OVERLAP = 0.5;
const CHUNK_FADE_DURATION = 0.85;
const FAR_TERRAIN_SIZE = 2600;
const FAR_TERRAIN_FOLLOW_STEP = 260;
const FAR_TERRAIN_NEAR_HIDE_HALF_SIZE = 0;

// Constants for terrain simulation
const WAVE_FREQUENCY = 4;
const MAX_RIPPLES = 18;
const MAX_GRASS_CONTACTS = 24;
const GRASS_BLADES_PER_CHUNK = 1400;
const GRASS_VISIBLE_DISTANCE = 105;
const GRASS_FADE_DISTANCE = 34;
const GRASS_CHUNK_RENDER_DISTANCE = 145;
const WATER_SURFACE_HEIGHT = 0.3;
const WATER_SURFACE_SIZE = 2400;
const WATER_RIPPLE_OVERLAY_SIZE = 96;
const CHARACTER_COLLISION_RADIUS = 2.8;
const BACKROOM_MODULE_SIZE = 36;
const BACKROOM_RENDER_MODULES = 16;
const BACKROOM_HEIGHT = 28;
const BACKROOM_WORLD_SIZE = BACKROOM_MODULE_SIZE * (BACKROOM_RENDER_MODULES * 2 + 8);
const BACKROOM_COLLISION_RADIUS = 3.0;
const BACKROOM_TRIM_HEIGHT = 1.1;
const BACKROOM_CEILING_TILE = 9;
const CHARACTER_STEP_OVER_HEIGHT = 1.25;

const CONTACT_SHADOW_PRESETS = {
  snow: {
    color: "#7c8fa2",
    opacity: 0.14,
    softness: 0.86,
    scale: [10.8, 6.4],
    height: 0.055,
    noise: 0.08,
    stretch: 0.64,
  },
  sand: {
    color: "#6b5127",
    opacity: 0.18,
    softness: 0.92,
    scale: [11.2, 6.8],
    height: 0.052,
    noise: 0.12,
    stretch: 0.68,
  },
  grass: {
    color: "#071407",
    opacity: 0.38,
    softness: 0.72,
    scale: [8.8, 5.2],
    height: 0.075,
    noise: 0.46,
    stretch: 0.68,
  },
  water: {
    color: "#071f20",
    opacity: 0.42,
    softness: 0.9,
    scale: [11.6, 6.9],
    height: WATER_SURFACE_HEIGHT + 0.18,
    noise: 0.32,
    stretch: 1.08,
  },
  stone: {
    color: "#151719",
    opacity: 0.28,
    softness: 0.46,
    scale: [8.6, 5.0],
    height: 0.054,
    noise: 0.14,
    stretch: 0.62,
  },
  backroom: {
    color: "#211904",
    opacity: 0.46,
    softness: 0.38,
    scale: [8.8, 5.0],
    height: 0.064,
    noise: 0.2,
    stretch: 0.56,
  },
};

const TERRAIN_PRESETS = {
  snow: {
    type: "imprint",
    baseColor: "#f7fbff",
    accentColor: "#b8c8d9",
    fogColor: "#f4faff",
    roughness: 0.92,
    metalness: 0,
    displacementScale: 1.35,
    deformDepth: 1.08,
    footprintLength: 4.4,
    footprintWidth: 1.72,
    rimHeight: 0.14,
    waveAmplitude: 0.004,
    imprintBlend: 0.5,
    pressurePower: 1.32,
    rimStart: 0.86,
    rimEnd: 1.78,
    smoothRadius: 4.6,
    smoothIntensity: 0.42,
    opacity: 1,
  },
  sand: {
    type: "imprint",
    baseColor: "#dbc27d",
    accentColor: "#7f642e",
    fogColor: "#d9bd79",
    roughness: 0.92,
    metalness: 0,
    displacementScale: 0.28,
    deformDepth: 0.78,
    footprintLength: 4.8,
    footprintWidth: 1.6,
    rimHeight: 0.12,
    waveAmplitude: 0.006,
    imprintBlend: 0.58,
    pressurePower: 1.14,
    rimStart: 0.95,
    rimEnd: 1.55,
    smoothRadius: 4.9,
    smoothIntensity: 0.24,
    opacity: 1,
  },
  grass: {
    type: "grass",
    baseColor: "#5f8f43",
    accentColor: "#203f27",
    fogColor: "#8aa577",
    roughness: 0.88,
    metalness: 0,
    displacementScale: 0.65,
    deformDepth: 0,
    footprintLength: 0,
    footprintWidth: 0,
    rimHeight: 0,
    waveAmplitude: 0,
    opacity: 1,
  },
  water: {
    type: "water",
    baseColor: "#476f66",
    accentColor: "#173d48",
    fogColor: "#88d2df",
    roughness: 0.86,
    metalness: 0.05,
    displacementScale: 0,
    deformDepth: 0,
    footprintLength: 0,
    footprintWidth: 0,
    rimHeight: 0,
    waveAmplitude: 0,
    opacity: 1,
  },
  stone: {
    type: "rigid",
    baseColor: "#ffffff",
    accentColor: "#303536",
    fogColor: "#9aa1a5",
    roughness: 0.94,
    metalness: 0,
    displacementScale: 0.42,
    deformDepth: 0,
    footprintLength: 0,
    footprintWidth: 0,
    rimHeight: 0,
    waveAmplitude: 0,
    opacity: 1,
  },
  backroom: {
    type: "backroom",
    baseColor: "#b9a456",
    accentColor: "#5b5024",
    fogColor: "#70652d",
    roughness: 0.96,
    metalness: 0,
    displacementScale: 0,
    deformDepth: 0,
    footprintLength: 0,
    footprintWidth: 0,
    rimHeight: 0,
    waveAmplitude: 0,
    opacity: 1,
  },
};

// Animation Names
const DEFAULT_FADE_DURATION = 0.25;
const ONE_SHOT_FADE_DURATION = 0.08;
const CHARACTER_SCALE = 0.3;
const CHARACTER_GROUND_SINK = 1.15;
const INITIAL_CHARACTER_ROTATION = Math.PI;
const DOUBLE_TAP_THRESHOLD = 320;
const DODGE_BACK_DISTANCE = 18;
const DODGE_MOVE_START = 0.14;
const DODGE_MOVE_END = 0.68;
const WALK_JUMP_DISTANCE = 8.5;
const RUN_JUMP_DISTANCE = 20;
const JUMP_CROUCH_DEPTH = 1.35;
const JUMP_CROUCH_START = 0.04;
const JUMP_CROUCH_END = 0.34;
const JUMP_MOVE_START = 0.18;
const JUMP_MOVE_END = 0.66;
const RUN_JUMP_MOVE_START = 0.08;
const RUN_JUMP_MOVE_END = 0.62;
const WALK_JUMP_LIFT_HEIGHT = 2.7;
const RUN_JUMP_LIFT_HEIGHT = 6.2;
const RUN_JUMP_CLEARANCE_HEIGHT = 6.8;
const WALK_JUMP_PLATFORM_CLEARANCE = 7.2;
const PLATFORM_COLLISION_MARGIN = 0.55;
const TERRAIN_ADHESION_SPEED = 58;
const TERRAIN_ADHESION_MAX_SPEED = 96;
const TERRAIN_FOOTPRINT_RADIUS = CHARACTER_COLLISION_RADIUS * 0.68;
const TERRAIN_FOOTPRINT_FORWARD_REACH = CHARACTER_COLLISION_RADIUS * 1.05;
const PLATFORM_LANDING_START = 0.46;
const PLATFORM_LANDING_END = 0.66;
const DROP_LANDING_START = 0.42;
const DROP_LANDING_END = 0.58;
const SCULPT_STEP_HEIGHT = 1.05;
const SCULPTABLE_TERRAINS = new Set(["snow", "sand", "grass", "stone"]);
const JUMP_LIFT_START = 0.34;
const JUMP_LIFT_END = 0.94;
const PLATFORM_JUMP_LIFT_END = 0.68;
const RUN_JUMP_LIFT_START = 0.06;
const RUN_JUMP_LIFT_END = 0.72;
const SIT_INTERACTION_DISTANCE = 8.5;
const SIT_EDGE_OFFSET = 0.45;
const SITTABLE_ASSET_KEYS = new Set(["boulder", "desertBoulder", "mossRockSet"]);

const LONG_BOW_MODEL = "Pirate By P. Konstantinov.fbx";
const LONG_BOW_ANIMATIONS = {
  idle: "standing idle 01.fbx",
  walkForward: "standing walk forward.fbx",
  walkBack: "standing walk back.fbx",
  walkLeft: "standing walk left.fbx",
  walkRight: "standing walk right.fbx",
  runForward: "standing run forward.fbx",
  runBack: "standing run back.fbx",
  runLeft: "standing run left.fbx",
  runRight: "standing run right.fbx",
  runForwardStop: "standing run forward stop.fbx",
  turnLeft: "standing turn 90 left.fbx",
  turnRight: "standing turn 90 right.fbx",
  sittingLaughing: "Sitting Laughing.fbx",
  dodgeBack: "Standing Dodge Backward.fbx",
  jump: "Jumping.fbx",
  runJump: "running Jump.fbx",
};

const LONG_BOW_BASE_PATH = "/animations/new-model/";

const ANIMATION_TIME_SCALE = {
  idle: 1,
  walkForward: 1.7,
  walkBack: 1.6,
  walkLeft: 1.6,
  walkRight: 1.6,
  runForward: 1.35,
  runBack: 1.3,
  runLeft: 1.3,
  runRight: 1.3,
  runForwardStop: 1.25,
  turnLeft: 1.35,
  turnRight: 1.35,
  jump: 1,
  runJump: 1,
};

// Temporary vector for calculations
const tempFootVector = new THREE.Vector3();
const tempToeVector = new THREE.Vector3();
const tempForwardVector = new THREE.Vector3(0, 0, -1);
const tempRightVector = new THREE.Vector3(1, 0, 0);
const tempCollisionPosition = new THREE.Vector3();
const tempGrassDirection = new THREE.Vector2(0, -1);
const zeroVector = new THREE.Vector3();

const seededRandom = (seed) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const smoothstep = (edge0, edge1, value) => {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

const applyColorGain = (color, gain = 1) => {
  const output = new THREE.Color(color);
  output.multiplyScalar(gain);
  return `#${output.getHexString()}`;
};

const tuneTerrainPreset = (preset, settings = {}) => {
  const roughnessSetting = settings.roughness ?? 1;
  const tuned = {
    ...preset,
    settings,
    baseColor: applyColorGain(preset.baseColor, settings.brightness ?? 1),
    accentColor: applyColorGain(preset.accentColor, settings.brightness ?? 1),
    fogColor: applyColorGain(preset.fogColor, settings.brightness ?? 1),
    textureScale: settings.textureScale ?? 1,
    grain: settings.grain ?? 1,
    displacementScale: preset.displacementScale * (settings.relief ?? 1),
    roughness: THREE.MathUtils.clamp(
      preset.roughness * roughnessSetting,
      0.1,
      1
    ),
  };

  if (preset.type === "imprint") {
    tuned.deformDepth = preset.deformDepth * (settings.deformation ?? 1);
    tuned.rimHeight = preset.rimHeight * (settings.rim ?? 1);
    tuned.smoothIntensity = preset.smoothIntensity * (settings.softness ?? 1);
    tuned.smoothRadius = preset.smoothRadius * Math.sqrt(settings.softness ?? 1);
  }

  if (preset.type === "grass") {
    tuned.grassDensity = settings.grassDensity ?? 1;
    tuned.grassHeight = settings.grassHeight ?? 1;
    tuned.wind = settings.wind ?? 1;
    tuned.reaction = settings.reaction ?? 1;
  }

  if (preset.type === "water") {
    tuned.waterDepth = settings.depth ?? 1;
    tuned.waterFlow = settings.flow ?? 1;
    tuned.waterWave = settings.wave ?? 1;
    tuned.waterRipple = settings.ripple ?? 1;
    tuned.waterReflectivity = settings.reflectivity ?? 1;
    tuned.waterClarity = settings.clarity ?? 1;
  }

  if (preset.type === "rigid") {
    const relief = settings.relief ?? 1;
    const grain = settings.grain ?? 1;
    const roughnessProgress = THREE.MathUtils.clamp(
      (roughnessSetting - 0.45) / 1.05,
      0,
      1
    );

    tuned.displacementScale = preset.displacementScale * (0.22 + relief * 1.85);
    tuned.normalScale = 0.32 + relief * 0.28 + grain * 0.62;
    tuned.roughness = THREE.MathUtils.clamp(0.24 + roughnessProgress * 0.76, 0.18, 1);
  }

  if (preset.type === "backroom") {
    tuned.backroomBrightness = settings.brightness ?? 1;
    tuned.backroomCarpetGrain = settings.carpetGrain ?? 1;
    tuned.backroomWallGrain = settings.wallGrain ?? 1;
    tuned.backroomCeilingGrid = settings.ceilingGrid ?? 1;
    tuned.backroomFluorescent = settings.fluorescent ?? 1;
    tuned.backroomHallScale = settings.hallScale ?? 1;
  }

  return tuned;
};

const getMaxFootprintRadius = () =>
  Math.max(
    ...Object.values(TERRAIN_PRESETS).map(
      (preset) => preset.footprintLength || 0
    )
  );

const softenTerrainPatch = (geometry, chunk, point, radius, intensity) => {
  if (!geometry || intensity <= 0) return;

  const positionAttribute = geometry.attributes.position;
  const vertices = positionAttribute.array;
  const source = new Float32Array(vertices);
  const columns = GRID_RESOLUTION + 1;
  const tempVertex = new THREE.Vector3();

  for (let i = 0; i < positionAttribute.count; i++) {
    const row = Math.floor(i / columns);
    const column = i % columns;

    if (
      row === 0 ||
      column === 0 ||
      row === columns - 1 ||
      column === columns - 1
    ) {
      continue;
    }

    tempVertex.fromArray(source, i * 3);
    chunk.localToWorld(tempVertex);

    const distance = Math.hypot(tempVertex.x - point.x, tempVertex.z - point.z);
    const soften = smoothstep(radius, radius * 0.18, distance) * intensity;

    if (soften <= 0.001) continue;

    const top = i - columns;
    const bottom = i + columns;
    const left = i - 1;
    const right = i + 1;
    const averageHeight =
      (source[top * 3 + 2] +
        source[bottom * 3 + 2] +
        source[left * 3 + 2] +
        source[right * 3 + 2] +
        source[i * 3 + 2] * 2) /
      6;

    vertices[i * 3 + 2] = THREE.MathUtils.lerp(
      source[i * 3 + 2],
      averageHeight,
      soften
    );
  }

  positionAttribute.needsUpdate = true;
};

const createTerrainTexture = (preset, terrain) => {
  const size = 256;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;
  context.fillStyle = preset.baseColor;
  context.fillRect(0, 0, size, size);

  if (terrain === "stone") {
    const imageData = context.createImageData(size, size);
    const data = imageData.data;
    const palette = [
      [178, 181, 174],
      [139, 145, 141],
      [102, 109, 108],
      [67, 73, 73],
      [196, 198, 190],
    ];
    const grainStrength = THREE.MathUtils.clamp(preset.grain ?? 1, 0.25, 2.6);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const broad =
          seededRandom(Math.floor(nx * 7) * 31.7 + Math.floor(ny * 7) * 67.1);
        const medium =
          seededRandom(Math.floor(nx * 22) * 13.3 + Math.floor(ny * 22) * 41.9);
        const fine = seededRandom(x * 5.37 + y * 11.91);
        const vein =
          Math.sin((nx * 9.2 + ny * 4.7) * Math.PI * 2) * 0.08 +
          Math.sin((nx * -3.4 + ny * 12.8) * Math.PI * 2) * 0.06;
        const shade = (broad - 0.5) * 0.28 + (medium - 0.5) * 0.16 + vein;
        const paletteIndex = THREE.MathUtils.clamp(
          Math.floor((0.48 + shade) * palette.length),
          0,
          palette.length - 1
        );
        const base = palette[paletteIndex];
        const mineral = (fine - 0.5) * 36 * grainStrength;
        const index = (y * size + x) * 4;

        data[index] = THREE.MathUtils.clamp(base[0] + mineral, 0, 255);
        data[index + 1] = THREE.MathUtils.clamp(base[1] + mineral, 0, 255);
        data[index + 2] = THREE.MathUtils.clamp(base[2] + mineral * 0.9, 0, 255);
        data[index + 3] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);

    for (let i = 0; i < 18; i++) {
      const seed = i * 91.73;
      const startX = seededRandom(seed + 1) * size;
      const startY = seededRandom(seed + 2) * size;
      const angle = -0.9 + seededRandom(seed + 3) * 1.8;
      const segments = 3 + Math.floor(seededRandom(seed + 4) * 4);
      let x = startX;
      let y = startY;

      context.save();
      context.globalAlpha = 0.22 + seededRandom(seed + 5) * 0.18;
      context.strokeStyle = seededRandom(seed + 6) > 0.35
        ? "rgba(29, 33, 33, 0.78)"
        : "rgba(218, 220, 210, 0.46)";
      context.lineWidth = 0.7 + seededRandom(seed + 7) * 1.4;
      context.beginPath();
      context.moveTo(x, y);

      for (let segment = 0; segment < segments; segment++) {
        const length = 24 + seededRandom(seed + segment * 8 + 8) * 42;
        x += Math.cos(angle + (seededRandom(seed + segment * 8 + 9) - 0.5) * 0.62) * length;
        y += Math.sin(angle + (seededRandom(seed + segment * 8 + 10) - 0.5) * 0.62) * length;
        context.lineTo(x, y);
      }

      context.stroke();
      context.restore();
    }

    for (let i = 0; i < 10; i++) {
      const y = seededRandom(i * 15.3 + 4) * size;
      context.save();
      context.globalAlpha = 0.08 + seededRandom(i * 22.4 + 2) * 0.08;
      context.strokeStyle = i % 2 === 0
        ? "rgba(255, 255, 245, 0.72)"
        : "rgba(20, 24, 24, 0.7)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      for (let x = 0; x <= size; x += 24) {
        context.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
      }
      context.stroke();
      context.restore();
    }
  }

  const grainIntensity = preset.grain ?? 1;
  const grainCount = Math.floor(
    (terrain === "grass" ? 1400 : terrain === "water" ? 190 : terrain === "stone" ? 260 : 900) *
      grainIntensity
  );

  for (let i = 0; i < grainCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const length =
      terrain === "grass"
        ? 8 + Math.random() * 16
        : terrain === "water"
          ? 7 + Math.random() * 28
          : 1 + Math.random() * 5;
    const alpha =
      terrain === "water"
        ? (0.025 + Math.random() * 0.045) * grainIntensity
        : (0.1 + Math.random() * 0.18) * grainIntensity;

    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle =
      terrain === "water"
        ? i % 5 === 0
          ? "rgba(226, 213, 168, 0.72)"
          : preset.accentColor
        : i % 3 === 0
          ? preset.accentColor
          : "#ffffff";
    context.lineWidth =
      terrain === "grass" ? 1 : terrain === "water" ? 0.7 : 1 + Math.random();
    context.translate(x, y);
    context.rotate(terrain === "water" ? -0.35 + Math.random() * 0.7 : Math.random() * Math.PI);
    context.beginPath();
    context.moveTo(-length / 2, 0);
    if (terrain === "water") {
      context.quadraticCurveTo(
        0,
        (Math.random() - 0.5) * 3,
        length / 2,
        (Math.random() - 0.5) * 2
      );
    } else {
      context.lineTo(length / 2, 0);
    }
    context.stroke();
    context.restore();
  }

  if (terrain === "water") {
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "rgba(199, 220, 190, 0.08)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(1, "rgba(15, 55, 57, 0.06)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeat =
    (terrain === "water" ? 3.5 : terrain === "stone" ? 5.2 : 12) *
    (preset.textureScale ?? 1);
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
};

const createWaterNormalTexture = (phase = 0) => {
  const size = 256;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(size, size);
  const data = imageData.data;

  canvas.width = size;
  canvas.height = size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const waveA =
        Math.sin((u * 10.0 + v * 2.8 + phase) * Math.PI * 2) * 0.55;
      const waveC =
        Math.sin((u * 22.0 - v * 15.0 + phase * 1.9) * Math.PI * 2) * 0.12;
      const ripple =
        seededRandom(
          Math.floor(u * 48) * 17.13 + Math.floor(v * 48) * 91.7 + phase * 31
        ) *
          2 -
        1;

      const dx =
        Math.cos((u * 10.0 + v * 2.8 + phase) * Math.PI * 2) * 0.48 +
        Math.cos((u * -3.5 + v * 8.5 + phase * 0.7) * Math.PI * 2) * -0.22 +
        waveC * 0.16 +
        ripple * 0.045;
      const dy =
        waveA * 0.16 +
        Math.cos((u * -3.5 + v * 8.5 + phase * 0.7) * Math.PI * 2) * 0.42 +
        Math.cos((u * 22.0 - v * 15.0 + phase * 1.9) * Math.PI * 2) * -0.12 +
        ripple * 0.045;

      const normal = new THREE.Vector3(-dx, 1.65, -dy).normalize();
      const index = (y * size + x) * 4;
      data[index] = Math.round((normal.x * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((normal.z * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round(THREE.MathUtils.clamp(normal.y, 0, 1) * 255);
      data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return texture;
};

const createBackroomTexture = (kind) => {
  const size = 512;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  const palette =
    kind === "carpet"
      ? ["#9a8848", "#86773d", "#ad9a55", "#63572c"]
    : kind === "ceiling"
        ? ["#8c823e", "#746d34", "#a19855", "#4b461f"]
        : kind === "trim"
          ? ["#56481f", "#403616", "#75652d", "#241f0d"]
        : kind === "column"
          ? ["#8d7f3e", "#75692e", "#a0914b", "#413918"]
        : ["#b9a75e", "#9f904c", "#ccbb70", "#6a5f2b"];

  context.fillStyle = palette[0];
  context.fillRect(0, 0, size, size);

  const imageData = context.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const grain =
        seededRandom(x * 4.17 + y * 9.31 + kind.length * 41.0) * 2 - 1;
      const stain =
        Math.sin(x * 0.031 + y * 0.017) * 0.5 +
        Math.sin(x * 0.011 - y * 0.029) * 0.5;
      const stripe =
        kind === "wall"
          ? Math.sin(x * 0.18) * 0.045 +
            Math.sin((x + y * 0.38) * 0.052) * 0.035
          : kind === "carpet"
            ? Math.sin((x + y) * 0.055) * 0.025
            : 0;
      const wallpaperPattern =
        kind === "wall"
          ? (Math.abs(((x + y * 0.18) % 54) - 27) < 2.4 ? -0.08 : 0) +
            (Math.abs(((x - y * 0.16) % 54) - 27) < 2.0 ? 0.04 : 0)
          : 0;
      const shade =
        1 +
        grain * (kind === "carpet" ? 0.055 : 0.12) +
        stain * (kind === "carpet" ? 0.035 : 0.08) +
        stripe +
        wallpaperPattern;

      data[index] = THREE.MathUtils.clamp(data[index] * shade, 0, 255);
      data[index + 1] = THREE.MathUtils.clamp(data[index + 1] * shade, 0, 255);
      data[index + 2] = THREE.MathUtils.clamp(data[index + 2] * shade, 0, 255);
    }
  }

  context.putImageData(imageData, 0, 0);

  if (kind === "ceiling") {
    context.strokeStyle = "rgba(45, 42, 20, 0.34)";
    context.lineWidth = 3;
    for (let i = 0; i <= size; i += size / 4) {
      context.beginPath();
      context.moveTo(i, 0);
      context.lineTo(i, size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, i);
      context.lineTo(size, i);
      context.stroke();
    }
  }

  if (kind === "wall") {
    context.strokeStyle = "rgba(82, 73, 31, 0.16)";
    context.lineWidth = 2;
    for (let x = 0; x <= size; x += size / 3) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + Math.sin(x) * 3, size);
      context.stroke();
    }

    context.globalAlpha = 0.18;
    context.fillStyle = "#d7ca79";
    for (let i = 0; i < 36; i++) {
      const seed = i * 31.17;
      const x = seededRandom(seed + 1) * size;
      const y = seededRandom(seed + 2) * size;
      const w = 10 + seededRandom(seed + 3) * 48;
      const h = 18 + seededRandom(seed + 4) * 70;
      context.fillRect(x, y, w, h);
    }
    context.globalAlpha = 1;
  }

  if (kind === "trim") {
    context.strokeStyle = "rgba(20, 17, 7, 0.42)";
    context.lineWidth = 9;
    context.beginPath();
    context.moveTo(0, size * 0.25);
    context.lineTo(size, size * 0.25);
    context.stroke();
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(0, size * 0.72);
    context.lineTo(size, size * 0.72);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    kind === "wall" ? 2.7 : kind === "ceiling" ? 10 : kind === "column" ? 1.45 : kind === "trim" ? 1.8 : 4.5,
    kind === "wall" ? 1.9 : kind === "ceiling" ? 10 : kind === "column" ? 2.1 : kind === "trim" ? 0.65 : 4.5
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return texture;
};

const createBackroomStructureItems = (centerZ = 0) => {
  const items = [];
  const module = BACKROOM_MODULE_SIZE;
  const height = BACKROOM_HEIGHT;
  const half = BACKROOM_RENDER_MODULES;
  const centerModule = Math.round(centerZ / module);
  const wallDepth = 3.2;
  const worldHalfWidth = module * 2.45;
  const passageWidth = module * 0.95;
  const lanes = [-module * 1.42, -module * 0.46, module * 0.46, module * 1.42];

  const addWall = (key, position, scale) => {
    items.push({
      key,
      type: "wall",
      position,
      scale,
    });
  };

  const addSplitWall = (key, z, openingCenter, openingWidth) => {
    const leftEnd = openingCenter - openingWidth * 0.5;
    const rightStart = openingCenter + openingWidth * 0.5;
    const minX = -worldHalfWidth + module * 0.1;
    const maxX = worldHalfWidth - module * 0.1;

    if (leftEnd - minX > module * 0.25) {
      addWall(
        `${key}-left`,
        [(minX + leftEnd) * 0.5, height * 0.5, z],
        [leftEnd - minX, height, wallDepth]
      );
    }

    if (maxX - rightStart > module * 0.25) {
      addWall(
        `${key}-right`,
        [(rightStart + maxX) * 0.5, height * 0.5, z],
        [maxX - rightStart, height, wallDepth]
      );
    }
  };

  for (let moduleZ = centerModule - half - 2; moduleZ <= centerModule + half + 2; moduleZ++) {
    const worldZ = moduleZ * module;
    const seed = moduleZ * 97.131;
    const isSpawnClearZone = Math.abs(moduleZ) <= 2;
    const openness = seededRandom(seed + 21.6);
    const openingLane = lanes[Math.floor(seededRandom(seed + 0.3) * lanes.length)];
    const secondaryLane = lanes[Math.floor(seededRandom(seed + 1.7) * lanes.length)];
    const crossZ =
      worldZ + (seededRandom(seed + 2.1) - 0.5) * module * 0.72;

    items.push({
      key: `left-wall-${moduleZ}`,
      type: "wall",
      position: [-worldHalfWidth, height * 0.5, worldZ],
      scale: [3.4, height, module + 0.9],
    });
    items.push({
      key: `right-wall-${moduleZ}`,
      type: "wall",
      position: [worldHalfWidth, height * 0.5, worldZ],
      scale: [3.4, height, module + 0.9],
    });

    const columnCount = isSpawnClearZone
      ? 0
      : seededRandom(seed + 3.4) > 0.78
        ? 2
        : 1;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const lane =
        lanes[(columnIndex * 2 + Math.floor(seededRandom(seed + columnIndex + 4.2) * 2)) % lanes.length];
      const x =
        lane + (seededRandom(seed + columnIndex * 4.3 + 5.4) - 0.5) * module * 0.36;

      items.push({
        key: `column-${moduleZ}-${columnIndex}`,
        type: "column",
        position: [
          x,
          height * 0.5,
          worldZ + (seededRandom(seed + columnIndex * 3.8 + 6.2) - 0.5) * module * 0.72,
        ],
        scale: [
          7.4 + seededRandom(moduleZ * 9.1 + columnIndex) * 2.6,
          height,
          6.4 + seededRandom(moduleZ * 13.7 + columnIndex) * 1.8,
        ],
      });
    }

    if (!isSpawnClearZone && openness < 0.42) {
      addSplitWall(
        `cross-partition-${moduleZ}`,
        crossZ,
        openingLane + (seededRandom(seed + 7.9) - 0.5) * module * 0.24,
        passageWidth + seededRandom(seed + 8.1) * module * 0.45
      );
    }

    if (!isSpawnClearZone && seededRandom(seed + 9.2) > 0.76) {
      const dividerX = secondaryLane + (seededRandom(seed + 10.4) - 0.5) * module * 0.28;
      const length = module * (0.28 + seededRandom(seed + 11.5) * 0.34);
      const zOffset = (seededRandom(seed + 12.6) - 0.5) * module * 0.3;

      addWall(
        `long-divider-${moduleZ}`,
        [dividerX, height * 0.5, worldZ + zOffset],
        [wallDepth, height, length]
      );
    }

    if (!isSpawnClearZone && seededRandom(seed + 13.7) > 0.72) {
      const side = seededRandom(seed + 14.8) > 0.5 ? -1 : 1;
      const returnLength = module * (0.26 + seededRandom(seed + 15.9) * 0.28);

      addWall(
        `blind-return-${moduleZ}`,
        [
          side * (worldHalfWidth - module * (0.68 + seededRandom(seed + 16.1) * 0.34)),
          height * 0.5,
          worldZ + (seededRandom(seed + 17.2) - 0.5) * module * 0.64,
        ],
        [wallDepth, height, returnLength]
      );
    }

    if (!isSpawnClearZone && seededRandom(seed + 18.3) > 0.86) {
      const pocketWidth = module * (0.54 + seededRandom(seed + 19.4) * 0.28);
      const pocketX = openingLane + (seededRandom(seed + 20.5) - 0.5) * module * 0.78;
      addWall(
        `pocket-back-${moduleZ}`,
        [
          THREE.MathUtils.clamp(pocketX, -worldHalfWidth + pocketWidth, worldHalfWidth - pocketWidth),
          height * 0.5,
          worldZ - module * 0.46,
        ],
        [pocketWidth, height, wallDepth]
      );
    }
  }

  return items;
};

const createBackroomTrimItems = (structures) => {
  const trimItems = [];

  structures.forEach((item) => {
    if (item.type !== "wall" && item.type !== "column") return;

    const halfX = item.scale[0] * 0.5;
    const halfZ = item.scale[2] * 0.5;
    const isLongX = item.scale[0] >= item.scale[2];
    const y = BACKROOM_TRIM_HEIGHT * 0.5;

    if (isLongX) {
      [-1, 1].forEach((side) => {
        trimItems.push({
          key: `${item.key}-trim-z-${side}`,
          position: [item.position[0], y, item.position[2] + side * (halfZ + 0.08)],
          scale: [item.scale[0] + 0.35, BACKROOM_TRIM_HEIGHT, 0.32],
        });
      });
      return;
    }

    [-1, 1].forEach((side) => {
      trimItems.push({
        key: `${item.key}-trim-x-${side}`,
        position: [item.position[0] + side * (halfX + 0.08), y, item.position[2]],
        scale: [0.32, BACKROOM_TRIM_HEIGHT, item.scale[2] + 0.35],
      });
    });
  });

  return trimItems;
};

const createBackroomCeilingGridItems = (centerZ = 0) => {
  const items = [];
  const module = BACKROOM_MODULE_SIZE;
  const half = BACKROOM_RENDER_MODULES + 3;
  const centerModule = Math.round(centerZ / module);
  const zStart = (centerModule - half) * module;
  const zEnd = (centerModule + half) * module;
  const worldHalfWidth = module * 2.55;

  for (let z = zStart; z <= zEnd; z += BACKROOM_CEILING_TILE) {
    items.push({
      key: `ceiling-cross-${z}`,
      position: [0, BACKROOM_HEIGHT - 0.13, z],
      scale: [worldHalfWidth * 2, 0.18, 0.16],
    });
  }

  for (
    let x = -worldHalfWidth;
    x <= worldHalfWidth + 0.01;
    x += BACKROOM_CEILING_TILE * 1.5
  ) {
    items.push({
      key: `ceiling-run-${x}`,
      position: [x, BACKROOM_HEIGHT - 0.12, (zStart + zEnd) * 0.5],
      scale: [0.16, 0.18, zEnd - zStart + module],
    });
  }

  return items;
};

const createBackroomLightItems = (centerZ = 0) => {
  const items = [];
  const module = BACKROOM_MODULE_SIZE;
  const half = BACKROOM_RENDER_MODULES + 2;
  const centerModule = Math.round(centerZ / module);

  for (let moduleZ = centerModule - half; moduleZ <= centerModule + half; moduleZ++) {
    const lane =
      moduleZ % 3 === 0 ? 0 : moduleZ % 3 === 1 ? -module * 0.74 : module * 0.74;
    items.push({
      key: `light-${moduleZ}`,
      position: [lane, BACKROOM_HEIGHT - 0.08, moduleZ * module - module * 0.18],
    });
  }

  return items;
};

const getBackroomCollisionRects = (position) =>
  createBackroomStructureItems(position.z).map((item) => {
    const halfWidth = item.scale[0] * 0.5 + BACKROOM_COLLISION_RADIUS;
    const halfDepth = item.scale[2] * 0.5 + BACKROOM_COLLISION_RADIUS;

    return {
      minX: item.position[0] - halfWidth,
      maxX: item.position[0] + halfWidth,
      minZ: item.position[2] - halfDepth,
      maxZ: item.position[2] + halfDepth,
    };
  });

const collidesWithBackroom = (position) =>
  getBackroomCollisionRects(position).some(
    (rect) =>
      position.x >= rect.minX &&
      position.x <= rect.maxX &&
      position.z >= rect.minZ &&
      position.z <= rect.maxZ
  );

const getPlacedObjectTopY = (placement) => {
  const asset = NATURE_ASSETS[placement.assetKey];
  const collider = placement.collider ?? asset?.collider;

  if (!collider) return placement.position[1] ?? 0;
  return (placement.position[1] ?? 0) + (collider.height ?? 0);
};

const collidesWithPlacedObject = (
  position,
  placement,
  padding = {
    x: CHARACTER_COLLISION_RADIUS,
    z: CHARACTER_COLLISION_RADIUS,
  },
  options = {}
) => {
  const asset = NATURE_ASSETS[placement.assetKey];
  const collider = placement.collider ?? asset?.collider;

  if (!collider) return false;
  if (options.ignorePlacementId && placement.id === options.ignorePlacementId) {
    return false;
  }
  if (
    options.respectStepHeight &&
    (collider.height ?? Infinity) <= CHARACTER_STEP_OVER_HEIGHT
  ) {
    return false;
  }
  if (
    options.clearanceHeight &&
    (collider.height ?? Infinity) <= options.clearanceHeight
  ) {
    return false;
  }
  if (
    options.respectVerticalPosition &&
    position.y >= getPlacedObjectTopY(placement) - PLATFORM_COLLISION_MARGIN
  ) {
    return false;
  }

  const dx = position.x - placement.position[0];
  const dz = position.z - placement.position[2];
  const yaw = -(placement.rotation?.[1] ?? 0);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const radiusX = Math.max(collider.x + (padding.x ?? 0), 0.001);
  const radiusZ = Math.max(collider.z + (padding.z ?? 0), 0.001);

  return (
    (localX * localX) / (radiusX * radiusX) +
      (localZ * localZ) / (radiusZ * radiusZ) <=
    1
  );
};

const normalizeBoneName = (name) =>
  name.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();

const createSceneNameMap = (scene) => {
  const nameMap = new Map();

  scene.traverse((child) => {
    if (child.name) {
      nameMap.set(normalizeBoneName(child.name), child.name);
    }
  });

  return nameMap;
};

const retargetClipToScene = (clip, name, sceneNameMap) => {
  const keepsVerticalHipsMotion = name === "jump" || name === "runJump";
  const tracks = clip.tracks
    .map((track) => {
      const separatorIndex = track.name.indexOf(".");
      if (separatorIndex === -1) return null;

      const sourceBoneName = track.name.slice(0, separatorIndex);
      const propertyName = track.name.slice(separatorIndex + 1);
      const targetBoneName = sceneNameMap.get(normalizeBoneName(sourceBoneName));

      if (!targetBoneName || propertyName === "scale") return null;

      // Keep locomotion in-place; preserve original jump crouch/lift timing on hips.
      if (propertyName === "position") {
        const isHipsTrack = normalizeBoneName(sourceBoneName).endsWith("hips");
        if (!keepsVerticalHipsMotion || !isHipsTrack || track.getValueSize() !== 3) {
          return null;
        }

        const values = track.values.slice();
        const baseX = values[0] ?? 0;
        const baseY = values[1] ?? 0;
        const endY = values[values.length - 2] ?? baseY;
        const baseZ = values[2] ?? 0;
        const frameCount = Math.max(values.length / 3 - 1, 1);
        for (let i = 0; i < values.length; i += 3) {
          const progress = i / 3 / frameCount;
          const groundReference = THREE.MathUtils.lerp(baseY, endY, progress);
          values[i] = baseX;
          values[i + 1] = baseY + (values[i + 1] - groundReference);
          values[i + 2] = baseZ;
        }

        return new THREE.VectorKeyframeTrack(
          `${targetBoneName}.${propertyName}`,
          track.times.slice(),
          values
        );
      }

      const retargetedTrack = track.clone();
      retargetedTrack.name = `${targetBoneName}.${propertyName}`;
      return retargetedTrack;
    })
    .filter(Boolean);

  return new THREE.AnimationClip(name, clip.duration, tracks).optimize();
};

const getCharacterBone = (root, name) => {
  if (!root) return null;

  const mixamoName = name.startsWith("mixamorig")
    ? `mixamorig:${name.replace("mixamorig", "")}`
    : name;

  return (
    root.getObjectByName(name) ||
    root.getObjectByName(mixamoName) ||
    root.getObjectByName(name.replace("mixamorig", "mixamorig:"))
  );
};

const getDirectionalAnimationName = (direction, isRunning) => {
  const x = direction.x;
  const z = direction.z;

  if (x * x + z * z < 0.025) return null;

  const prefix = isRunning ? "run" : "walk";
  if (Math.abs(z) >= Math.abs(x)) {
    return z < 0 ? `${prefix}Forward` : `${prefix}Back`;
  }

  return x < 0 ? `${prefix}Left` : `${prefix}Right`;
};

const GrassChunk = ({
  chunk,
  index,
  chunksRef,
  characterPositionRef,
  grassBrushDirectionRef,
  grassContactsRef,
  preset,
}) => {
  const meshRef = useRef();
  const bladeGeometry = useMemo(() => {
    const planes = [0, Math.PI / 3, -Math.PI / 3].map((angle, bladeIndex) => {
      const plane = new THREE.PlaneGeometry(
        bladeIndex === 0 ? 0.34 : 0.28,
        bladeIndex === 0 ? 3.15 : 2.65,
        1,
        7
      );
      plane.translate(0, (bladeIndex === 0 ? 3.15 : 2.65) * 0.5, 0);
      plane.rotateY(angle);
      return plane;
    });
    const geometry = mergeGeometries(planes, false);
    planes.forEach((plane) => plane.dispose());
    return geometry;
  }, []);
  const bladeMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      forceSinglePass: true,
      alphaTest: 0.025,
      uniforms: {
        uTime: { value: 0 },
        uCharacterPosition: { value: new THREE.Vector3(9999, 9999, 9999) },
        uBrushDirection: { value: new THREE.Vector2(0, -1) },
        uContacts: {
          value: Array.from(
            { length: MAX_GRASS_CONTACTS },
            () => new THREE.Vector4(9999, 9999, -9999, 0)
          ),
        },
        uContactDirections: {
          value: Array.from(
            { length: MAX_GRASS_CONTACTS },
            () => new THREE.Vector4(0, -1, 0, 0)
          ),
        },
        uContactCount: { value: 0 },
        uWindStrength: { value: 1 },
        uReactionStrength: { value: 1 },
        uChunkFade: { value: 1 },
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uCharacterPosition;
        uniform vec2 uBrushDirection;
        uniform vec4 uContacts[${MAX_GRASS_CONTACTS}];
        uniform vec4 uContactDirections[${MAX_GRASS_CONTACTS}];
        uniform int uContactCount;
        uniform float uWindStrength;
        uniform float uReactionStrength;
        varying float vBladeProgress;
        varying float vShade;
        varying float vSeed;
        varying float vDistanceVisibility;
        varying float vBladeSide;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec3 transformed = position;
          vec4 rootWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 rootXZ = rootWorld.xz;
          float bladeProgress = smoothstep(0.0, 1.0, uv.y);
          float flexibleTip = pow(bladeProgress, 1.35);
          float seed = hash(rootXZ);
          float taper = mix(1.0, 0.035, smoothstep(0.08, 1.0, bladeProgress));
          transformed.x *= taper;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);

          vec2 windDirection = normalize(vec2(
            sin(uTime * 0.19 + rootXZ.y * 0.05),
            cos(uTime * 0.16 + rootXZ.x * 0.04)
          ));
          float broadWind = sin(uTime * 2.05 + rootXZ.x * 0.16 + rootXZ.y * 0.11);
          float rollingWind =
            sin(uTime * 3.1 + rootXZ.x * 0.26) * 0.82 +
            cos(uTime * 2.65 + rootXZ.y * 0.22) * 0.66;
          float gust = sin(uTime * 4.2 + seed * 6.2831) * 0.5 + 0.5;
          vec2 bend =
            windDirection * (1.85 + 1.15 * gust) * broadWind +
            vec2(0.95, -0.35) * rollingWind;
          bend *= uWindStrength;

          vec2 characterDelta = rootXZ - uCharacterPosition.xz;
          float characterDistance = length(characterDelta);
          float distanceVisibility = 1.0 - smoothstep(
            ${GRASS_VISIBLE_DISTANCE.toFixed(1)},
            ${(GRASS_VISIBLE_DISTANCE + GRASS_FADE_DISTANCE).toFixed(1)},
            characterDistance
          );
          float bodyInfluence = smoothstep(7.2, 0.35, characterDistance);
          vec2 bodyAway = characterDistance > 0.001
            ? normalize(characterDelta)
            : vec2(0.0, 1.0);
          vec2 brushDirection = length(uBrushDirection) > 0.001
            ? normalize(uBrushDirection)
            : vec2(0.0, -1.0);
          vec2 bodySideAxis = vec2(-brushDirection.y, brushDirection.x);
          vec2 bodySide = bodySideAxis * dot(bodyAway, bodySideAxis) * 0.58;
          vec2 bodyFlow = normalize(brushDirection * 1.22 + bodySide);
          bend += bodyFlow * bodyInfluence * 3.25 * uReactionStrength;

          float flatten = bodyInfluence * 0.2 * uReactionStrength;

          for (int i = 0; i < ${MAX_GRASS_CONTACTS}; i++) {
            if (i >= uContactCount) break;
            vec4 contact = uContacts[i];
            vec2 contactDirection = uContactDirections[i].xy;
            float age = uTime - contact.z;

            if (age > 0.0 && age < 3.4) {
              vec2 contactDelta = rootXZ - contact.xy;
              float contactDistance = length(contactDelta);
              vec2 contactAway = contactDistance > 0.001
                ? normalize(contactDelta)
                : vec2(0.0, 1.0);
              vec2 travelDirection = length(contactDirection) > 0.001
                ? normalize(contactDirection)
                : brushDirection;
              vec2 sideAxis = vec2(-travelDirection.y, travelDirection.x);
              float forwardOffset = dot(contactDelta, travelDirection);
              float lateral = dot(contactAway, sideAxis);
              float sideOffset = dot(contactDelta, sideAxis);
              float sweptFootprint = length(vec2(sideOffset / 1.95, forwardOffset / 3.65));
              float contactShape = smoothstep(1.38, 0.08, sweptFootprint);
              float recovery = exp(-age * 1.18);
              float contactInfluence = contactShape * recovery * contact.w;
              float forwardBias = smoothstep(-0.45, 0.85, dot(contactAway, travelDirection));
              vec2 sidePart = sideAxis * lateral * 0.52;
              vec2 sweptDirection = normalize(
                travelDirection * (1.42 + forwardBias * 0.44) + sidePart
              );
              bend += sweptDirection * contactInfluence * 4.05 * uReactionStrength;
              flatten = max(flatten, contactInfluence * 0.36 * uReactionStrength);
            }
          }

          worldPosition.xz += bend * flexibleTip;
          worldPosition.y -= flatten * flexibleTip * 0.56;

          vBladeProgress = bladeProgress;
          vShade = clamp(0.45 + seed * 0.55 + broadWind * 0.08, 0.0, 1.0);
          vSeed = seed;
          vDistanceVisibility = distanceVisibility;
          vBladeSide = abs(uv.x - 0.5) * 2.0;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uChunkFade;
        varying float vBladeProgress;
        varying float vShade;
        varying float vSeed;
        varying float vDistanceVisibility;
        varying float vBladeSide;

        void main() {
          vec3 rootColor = vec3(0.06, 0.19, 0.06);
          vec3 midColor = vec3(0.24, 0.56, 0.17);
          vec3 tipColor = vec3(0.66, 0.86, 0.34);
          vec3 color = mix(rootColor, midColor, smoothstep(0.0, 0.75, vBladeProgress));
          color = mix(color, tipColor, smoothstep(0.55, 1.0, vBladeProgress) * 0.58);
          color *= 0.78 + vShade * 0.42;
          color += vec3(0.02, 0.04, 0.0) * sin(vSeed * 41.0);
          float bladeWidth = mix(0.92, 0.1, smoothstep(0.08, 1.0, vBladeProgress));
          float sharpShape = 1.0 - smoothstep(bladeWidth, bladeWidth + 0.18, vBladeSide);
          float pointedTip = 1.0 - smoothstep(0.985, 1.0, vBladeProgress);
          float alpha = smoothstep(0.0, 0.12, vDistanceVisibility) * sharpShape * pointedTip * uChunkFade;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    return material;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    for (let i = 0; i < GRASS_BLADES_PER_CHUNK; i++) {
      const seed = index * 10000 + i * 17;
      const x = (seededRandom(seed) - 0.5) * CHUNK_SIZE;
      const z = (seededRandom(seed + 1) - 0.5) * CHUNK_SIZE;
      const height = (1.65 + seededRandom(seed + 2) * 2.35) * (preset.grassHeight ?? 1);
      const width = 0.7 + seededRandom(seed + 3) * 0.95;
      const yaw = seededRandom(seed + 4) * Math.PI * 2;
      const lean = (seededRandom(seed + 5) - 0.5) * 0.62;

      position.set(x, 0.03, z);
      euler.set(lean, yaw, 0);
      quaternion.setFromEuler(euler);
      scale.set(width, height, width);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.floor(
      GRASS_BLADES_PER_CHUNK *
        THREE.MathUtils.clamp(preset.grassDensity ?? 1, 0.05, 1.35)
    );
  }, [index, preset.grassDensity, preset.grassHeight]);

  useEffect(() => {
    return () => {
      bladeGeometry.dispose();
      bladeMaterial.dispose();
    };
  }, [bladeGeometry, bladeMaterial]);

  useFrame((state) => {
    const sourceChunk = chunksRef.current[index];
    if (!meshRef.current || !sourceChunk) return;
    meshRef.current.position.copy(sourceChunk.position);

    const chunkDistance = Math.hypot(
      sourceChunk.position.x - characterPositionRef.current.x,
      sourceChunk.position.z - characterPositionRef.current.z
    );
    meshRef.current.visible = chunkDistance < GRASS_CHUNK_RENDER_DISTANCE;

    if (!meshRef.current.visible) return;

    bladeMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    bladeMaterial.uniforms.uWindStrength.value = preset.wind ?? 1;
    bladeMaterial.uniforms.uReactionStrength.value = preset.reaction ?? 1;
    bladeMaterial.uniforms.uChunkFade.value =
      typeof sourceChunk.userData.fadeProgress === "number"
        ? THREE.MathUtils.smoothstep(sourceChunk.userData.fadeProgress, 0, 1)
        : 1;
    bladeMaterial.uniforms.uCharacterPosition.value.copy(
      characterPositionRef.current
    );
    bladeMaterial.uniforms.uBrushDirection.value.copy(
      grassBrushDirectionRef.current
    );

    const contacts = grassContactsRef.current;
    bladeMaterial.uniforms.uContactCount.value = Math.min(
      contacts.length,
      MAX_GRASS_CONTACTS
    );

    for (let i = 0; i < MAX_GRASS_CONTACTS; i++) {
      const contact = contacts[i];
      bladeMaterial.uniforms.uContacts.value[i].set(
        contact?.x ?? 9999,
        contact?.z ?? 9999,
        contact?.time ?? -9999,
        contact?.strength ?? 0
      );
      bladeMaterial.uniforms.uContactDirections.value[i].set(
        contact?.dx ?? grassBrushDirectionRef.current.x,
        contact?.dz ?? grassBrushDirectionRef.current.y,
        0,
        0
      );
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[bladeGeometry, bladeMaterial, GRASS_BLADES_PER_CHUNK]}
      position={[chunk.x * CHUNK_SIZE, 0, chunk.z * CHUNK_SIZE]}
      frustumCulled={false}
      receiveShadow
      visible={false}
    />
  );
};

const GrassLayer = ({
  chunks,
  visible,
  chunksRef,
  characterPositionRef,
  grassBrushDirectionRef,
  grassContactsRef,
  preset,
}) => {
  if (!visible) return null;

  return (
    <>
      {chunks.map((chunk, index) => (
        <GrassChunk
          key={`${chunk.x}-${chunk.z}-grass`}
          chunk={chunk}
          index={index}
          chunksRef={chunksRef}
          characterPositionRef={characterPositionRef}
          grassBrushDirectionRef={grassBrushDirectionRef}
          grassContactsRef={grassContactsRef}
          preset={preset}
        />
      ))}
    </>
  );
};

const NatureObject = ({
  asset,
  placement,
  objectEditMode,
  selected,
  onSelectObject,
}) => {
  const groupRef = useRef();
  const selectionSize = useMemo(() => {
    const collider = placement.collider ?? NATURE_ASSETS[placement.assetKey]?.collider;
    const scale = Array.isArray(placement.scale)
      ? placement.scale
      : [placement.scale, placement.scale, placement.scale];

    return [
      Math.max((collider?.x ?? 1.5) * 2.1, scale[0] * 0.16),
      Math.max(collider?.height ?? scale[1] * 0.28, 0.8),
      Math.max((collider?.z ?? 1.5) * 2.1, scale[2] * 0.16),
    ];
  }, [placement.assetKey, placement.collider, placement.scale]);
  const object = useMemo(() => {
    const clone = asset.scene.clone(true);
    const config = NATURE_ASSETS[placement.assetKey];
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = true;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.filter(Boolean).forEach((material) => {
          material.roughness = Math.max(material.roughness ?? 0.85, 0.82);
          if (config?.foliage || material.transparent || material.alphaMap) {
            material.side = THREE.DoubleSide;
            material.alphaTest = Math.max(material.alphaTest ?? 0, 0.28);
            material.depthWrite = true;
          }
          material.needsUpdate = true;
        });
      }
    });
    return clone;
  }, [asset, placement.assetKey]);

  useFrame((state) => {
    if (!groupRef.current) return;

    const config = NATURE_ASSETS[placement.assetKey];
    const baseY = placement.position[1];

    if (placement.terrain === "water" && config?.floatsOnWater) {
      const phase = placement.position[0] * 0.07 + placement.position[2] * 0.11;
      const bob =
        Math.sin(state.clock.elapsedTime * 1.25 + phase) * 0.055 +
        Math.sin(state.clock.elapsedTime * 0.72 + phase * 1.7) * 0.025;

      groupRef.current.position.y = WATER_SURFACE_HEIGHT + (config.yOffset ?? 0) + bob;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.9 + phase) * 0.035;
      groupRef.current.rotation.z = Math.cos(state.clock.elapsedTime * 0.82 + phase) * 0.03;
    } else {
      groupRef.current.position.y = baseY;
      groupRef.current.rotation.x = placement.rotation[0];
      groupRef.current.rotation.z = placement.rotation[2];
    }
  });

  return (
    <group
      ref={groupRef}
      position={placement.position}
      rotation={placement.rotation}
      onPointerDown={(event) => {
        if (!objectEditMode) return;
        event.stopPropagation();
        onSelectObject?.(placement.id);
      }}
    >
      <primitive object={object} scale={placement.scale} />
      {objectEditMode && selected && (
        <mesh position={[0, selectionSize[1] * 0.5, 0]}>
          <boxGeometry args={selectionSize} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.22}
            wireframe
            depthTest={false}
          />
        </mesh>
      )}
    </group>
  );
};

const PlacedObjectLayer = ({
  placedObjects,
  objectEditMode,
  selectedObjectId,
  onSelectObject,
}) => {
  const gltfs = useLoader(GLTFLoader, NATURE_ASSET_URLS);
  const assetMap = useMemo(() => {
    const map = new Map();
    NATURE_ASSET_KEYS.forEach((key, index) => {
      map.set(key, gltfs[index]);
    });
    return map;
  }, [gltfs]);

  return (
    <group>
      {placedObjects.map((placement) => {
        const asset = assetMap.get(placement.assetKey);
        if (!asset) return null;

        return (
          <NatureObject
            key={placement.id}
            asset={asset}
            placement={placement}
            objectEditMode={objectEditMode}
            selected={placement.id === selectedObjectId}
            onSelectObject={onSelectObject}
          />
        );
      })}
    </group>
  );
};

const getPlacementHeight = (terrain, assetKey) => {
  const yOffset = NATURE_ASSETS[assetKey]?.yOffset ?? 0;

  if (terrain === "water") {
    return WATER_SURFACE_HEIGHT + yOffset;
  }

  if (terrain === "backroom") {
    return 0.08 + yOffset;
  }

  return 0.04 + yOffset;
};

const PlacementPlane = ({
  terrain,
  selectedAssetKey,
  placedObjects,
  characterPositionRef,
  onPlaceObject,
}) => {
  const meshRef = useRef();

  useFrame(() => {
    if (!meshRef.current) return;

    const snapX =
      Math.round(characterPositionRef.current.x / CHUNK_SIZE) * CHUNK_SIZE;
    const snapZ =
      Math.round(characterPositionRef.current.z / CHUNK_SIZE) * CHUNK_SIZE;
    const y =
      terrain === "water"
        ? WATER_SURFACE_HEIGHT + 0.22
        : terrain === "backroom"
          ? 0.12
          : 0.16;

    meshRef.current.position.set(snapX, y, snapZ);
  });

  if (!selectedAssetKey || !NATURE_ASSETS[selectedAssetKey]) return null;

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        event.stopPropagation();
        const asset = NATURE_ASSETS[selectedAssetKey];
        const point = event.point;
        const seed = point.x * 17.13 + point.z * 91.7;
        const terrainScale =
          terrain === "water" && asset.floatsOnWater
            ? 0.94
            : terrain === "grass"
              ? 0.9
              : 1;
        const rotationY = seededRandom(seed) * Math.PI * 2;
        const collider = asset.collider ?? { x: 2, z: 2 };

        const placement = {
          assetKey: selectedAssetKey,
          terrain,
          position: [
            point.x,
            getPlacementHeight(terrain, selectedAssetKey),
            point.z,
          ],
          rotation: [0, rotationY, 0],
          scale: asset.scale * terrainScale,
          collider: {
            x: collider.x * terrainScale,
            z: collider.z * terrainScale,
            height: (collider.height ?? 2) * terrainScale,
          },
          floatsOnWater: terrain === "water" && Boolean(asset.floatsOnWater),
        };

        const overlapsExisting = placedObjects.some((existingPlacement) => {
          const candidatePosition = {
            x: placement.position[0],
            z: placement.position[2],
          };
          return collidesWithPlacedObject(
            candidatePosition,
            existingPlacement,
            placement.collider
          );
        });

        if (!overlapsExisting) {
          onPlaceObject?.(placement);
        }
      }}
    >
      <planeGeometry args={[1600, 1600, 1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const SculptPlane = ({
  visible,
  characterPositionRef,
  onPointerPreview,
  onPointerExit,
  onSculpt,
}) => {
  const meshRef = useRef();
  const isPaintingRef = useRef(false);

  useFrame(() => {
    if (!meshRef.current || !visible) return;

    const snapX =
      Math.round(characterPositionRef.current.x / CHUNK_SIZE) * CHUNK_SIZE;
    const snapZ =
      Math.round(characterPositionRef.current.z / CHUNK_SIZE) * CHUNK_SIZE;

    meshRef.current.position.set(snapX, 0.18, snapZ);
  });

  if (!visible) return null;

  const handleSculpt = (event) => {
    event.stopPropagation();
    onPointerPreview?.(event.point);
    onSculpt?.(event.point);
  };

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        isPaintingRef.current = true;
        handleSculpt(event);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        onPointerPreview?.(event.point);
        if (isPaintingRef.current) onSculpt?.(event.point);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        isPaintingRef.current = false;
      }}
      onPointerLeave={() => {
        isPaintingRef.current = false;
        onPointerExit?.();
      }}
    >
      <planeGeometry args={[1600, 1600, 1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const cloneStoneTerrainTexture = (texture, repeat) => {
  const clone = texture.clone();

  clone.wrapS = THREE.RepeatWrapping;
  clone.wrapT = THREE.RepeatWrapping;
  clone.repeat.set(repeat, repeat);
  clone.anisotropy = 8;
  clone.needsUpdate = true;

  return clone;
};

const TerrainChunkMaterial = ({
  terrain,
  terrainPreset,
  terrainMap,
  terrainNormalMap,
  terrainRoughnessMap,
  terrainAoMap,
  brushCursorRef,
  brushEnabled,
  brushSize,
}) => {
  const materialRef = useRef();
  const shaderRef = useRef(null);
  const stoneVariant = useMemo(() => {
    if (terrain !== "stone") return null;

    const repeat = 1.75 * (terrainPreset.textureScale ?? 1);
    return {
      color: new THREE.Color(terrainPreset.baseColor),
      map: cloneStoneTerrainTexture(terrainMap, repeat),
      normalMap: cloneStoneTerrainTexture(terrainNormalMap, repeat),
      roughnessMap: cloneStoneTerrainTexture(terrainRoughnessMap, repeat),
      aoMap: cloneStoneTerrainTexture(terrainAoMap, repeat),
      normalScale: new THREE.Vector2(
        terrainPreset.normalScale ?? 1,
        terrainPreset.normalScale ?? 1
      ),
    };
  }, [
    terrain,
    terrainAoMap,
    terrainMap,
    terrainNormalMap,
    terrainPreset,
    terrainRoughnessMap,
  ]);

  useEffect(() => {
    return () => {
      if (!stoneVariant) return;

      [
        stoneVariant.map,
        stoneVariant.normalMap,
        stoneVariant.roughnessMap,
        stoneVariant.aoMap,
      ].forEach((texture) => texture.dispose());
    };
  }, [stoneVariant]);

  useFrame(() => {
    const shader = shaderRef.current;
    const cursor = brushCursorRef?.current;
    if (!shader || !cursor) return;

    shader.uniforms.uBrushVisible.value =
      brushEnabled && cursor.visible && SCULPTABLE_TERRAINS.has(terrain) ? 1 : 0;
    shader.uniforms.uBrushCenter.value.set(cursor.position.x, cursor.position.z);
    shader.uniforms.uBrushRadius.value = Math.max(brushSize, 1);
  });

  return (
    <meshStandardMaterial
      ref={materialRef}
      map={stoneVariant?.map ?? terrainMap}
      color={stoneVariant?.color ?? terrainPreset.baseColor}
      normalMap={stoneVariant?.normalMap ?? terrainNormalMap}
      normalScale={
        stoneVariant?.normalScale ??
        (terrain === "sand"
          ? new THREE.Vector2(0.32 + (terrainPreset.grain ?? 1) * 0.12, -0.36)
          : undefined)
      }
      roughnessMap={stoneVariant?.roughnessMap ?? terrainRoughnessMap}
      aoMap={stoneVariant?.aoMap ?? terrainAoMap}
      displacementMap={null}
      displacementScale={0}
      roughness={terrainPreset.roughness}
      metalness={terrainPreset.metalness}
      transparent={terrainPreset.opacity < 1}
      opacity={terrainPreset.opacity}
      onBeforeCompile={(shader) => {
        shader.uniforms.uBrushVisible = { value: 0 };
        shader.uniforms.uBrushCenter = { value: new THREE.Vector2() };
        shader.uniforms.uBrushRadius = { value: Math.max(brushSize, 1) };
        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          `
            #include <common>
            varying vec2 vBrushWorldXZ;
          `
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          `
            #include <worldpos_vertex>
            vBrushWorldXZ = worldPosition.xz;
          `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `
            #include <common>
            uniform float uBrushVisible;
            uniform vec2 uBrushCenter;
            uniform float uBrushRadius;
            varying vec2 vBrushWorldXZ;
          `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <output_fragment>",
          `
            float brushDistance = distance(vBrushWorldXZ, uBrushCenter);
            float brushWidth = clamp(uBrushRadius * 0.075, 0.24, 0.78);
            float brushRing = 1.0 - smoothstep(brushWidth * 0.38, brushWidth, abs(brushDistance - uBrushRadius));
            float brushFade = 1.0 - smoothstep(uBrushRadius + brushWidth * 1.8, uBrushRadius + brushWidth * 5.5, brushDistance);
            float brushAlpha = brushRing * brushFade * uBrushVisible;
            outgoingLight = mix(outgoingLight, vec3(1.0), brushAlpha);
            #include <output_fragment>
          `
        );
        shaderRef.current = shader;
      }}
    />
  );
};

const cloneDistantTerrainTexture = (texture, repeat) => {
  if (!texture) return null;

  const clone = texture.clone();
  clone.wrapS = THREE.RepeatWrapping;
  clone.wrapT = THREE.RepeatWrapping;
  clone.repeat.set(repeat, repeat);
  clone.anisotropy = 4;
  clone.needsUpdate = true;

  return clone;
};

const DistantTerrainPlane = ({
  terrain,
  terrainPreset,
  terrainMap,
  terrainNormalMap,
  terrainRoughnessMap,
  terrainAoMap,
  characterPositionRef,
}) => {
  const meshRef = useRef();
  const materialRef = useRef();
  const shaderRef = useRef(null);
  const farTextures = useMemo(() => {
    const repeat =
      terrain === "stone"
        ? (FAR_TERRAIN_SIZE / CHUNK_SIZE) * 1.75 * (terrainPreset.textureScale ?? 1)
        : terrain === "sand"
          ? (FAR_TERRAIN_SIZE / CHUNK_SIZE) * 2.85 * (terrainPreset.textureScale ?? 1)
        : terrain === "grass"
          ? 18 * (terrainPreset.textureScale ?? 1)
            : 16 * (terrainPreset.textureScale ?? 1);

    return {
      map: cloneDistantTerrainTexture(terrainMap, repeat),
      normalMap: cloneDistantTerrainTexture(terrainNormalMap, repeat),
      roughnessMap: cloneDistantTerrainTexture(terrainRoughnessMap, repeat),
      aoMap: cloneDistantTerrainTexture(terrainAoMap, repeat),
    };
  }, [
    terrain,
    terrainAoMap,
    terrainMap,
    terrainNormalMap,
    terrainPreset.textureScale,
    terrainRoughnessMap,
  ]);

  useEffect(() => {
    return () => {
      Object.values(farTextures).forEach((texture) => texture?.dispose());
    };
  }, [farTextures]);

  useFrame(() => {
    if (!meshRef.current) return;

    const position = characterPositionRef.current;
    const x = Math.round(position.x / FAR_TERRAIN_FOLLOW_STEP) * FAR_TERRAIN_FOLLOW_STEP;
    const z = Math.round(position.z / FAR_TERRAIN_FOLLOW_STEP) * FAR_TERRAIN_FOLLOW_STEP;

    meshRef.current.position.set(x, -80, z);
    if (shaderRef.current) {
      shaderRef.current.uniforms.uCharacterPosition.value.copy(position);
    }
  });

  if (terrainPreset.type === "water" || terrainPreset.type === "backroom") {
    return null;
  }

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-30}
      receiveShadow={false}
    >
      <planeGeometry args={[FAR_TERRAIN_SIZE, FAR_TERRAIN_SIZE, 1, 1]} />
      <meshStandardMaterial
        ref={materialRef}
        map={farTextures.map}
        color={terrainPreset.baseColor}
        normalMap={farTextures.normalMap}
        normalScale={
          terrain === "stone"
            ? new THREE.Vector2(
                (terrainPreset.normalScale ?? 1) * 0.72,
                (terrainPreset.normalScale ?? 1) * 0.72
              )
            : terrain === "sand"
              ? new THREE.Vector2(0.22 + (terrainPreset.grain ?? 1) * 0.08, -0.24)
            : undefined
        }
        roughnessMap={farTextures.roughnessMap}
        aoMap={farTextures.aoMap}
        roughness={terrain === "stone" ? terrainPreset.roughness : 1}
        metalness={0}
        transparent={false}
        depthWrite
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        onBeforeCompile={(shader) => {
          shader.uniforms.uCharacterPosition = {
            value: characterPositionRef.current.clone(),
          };
          shader.uniforms.uNearHideHalfSize = {
            value: FAR_TERRAIN_NEAR_HIDE_HALF_SIZE,
          };
          shader.vertexShader = shader.vertexShader.replace(
            "#include <common>",
            `
              #include <common>
              varying vec2 vDistantWorldXZ;
            `
          );
          shader.vertexShader = shader.vertexShader.replace(
            "#include <worldpos_vertex>",
            `
              #include <worldpos_vertex>
              vDistantWorldXZ = worldPosition.xz;
            `
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `
              #include <common>
              uniform vec3 uCharacterPosition;
              uniform float uNearHideHalfSize;
              varying vec2 vDistantWorldXZ;
            `
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <clipping_planes_fragment>",
            `
              #include <clipping_planes_fragment>
              vec2 nearDelta = abs(vDistantWorldXZ - uCharacterPosition.xz);
              if (nearDelta.x < uNearHideHalfSize && nearDelta.y < uNearHideHalfSize) {
                discard;
              }
            `
          );
          shaderRef.current = shader;
          if (materialRef.current) {
            materialRef.current.userData.shader = shader;
          }
        }}
      />
    </mesh>
  );
};

const CharacterContactShadow = ({ terrain, characterPositionRef, rotationRef }) => {
  const meshRef = useRef();
  const materialRef = useRef();
  const preset = CONTACT_SHADOW_PRESETS[terrain] || CONTACT_SHADOW_PRESETS.snow;
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(preset.color) },
      uOpacity: { value: preset.opacity },
      uSoftness: { value: preset.softness },
      uNoise: { value: preset.noise },
      uStretch: { value: preset.stretch },
      uTerrainId: {
        value:
          terrain === "water"
            ? 3
            : terrain === "grass"
              ? 2
              : terrain === "sand"
                ? 1
                : terrain === "backroom"
                  ? 5
                  : terrain === "stone"
                    ? 4
                    : 0,
      },
    }),
    [
      preset.color,
      preset.noise,
      preset.opacity,
      preset.softness,
      preset.stretch,
      terrain,
    ]
  );

  useEffect(() => {
    if (!materialRef.current) return;

    materialRef.current.uniforms.uColor.value.set(preset.color);
    materialRef.current.uniforms.uOpacity.value = preset.opacity;
    materialRef.current.uniforms.uSoftness.value = preset.softness;
    materialRef.current.uniforms.uNoise.value = preset.noise;
    materialRef.current.uniforms.uStretch.value = preset.stretch;
    materialRef.current.uniforms.uTerrainId.value =
      terrain === "water"
        ? 3
        : terrain === "grass"
          ? 2
          : terrain === "sand"
            ? 1
            : terrain === "backroom"
              ? 5
              : terrain === "stone"
                ? 4
                : 0;
  }, [preset, terrain]);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return;

    meshRef.current.position.set(
      characterPositionRef.current.x,
      preset.height,
      characterPositionRef.current.z
    );
    meshRef.current.rotation.z = -(rotationRef.current ?? 0);
    meshRef.current.scale.set(preset.scale[0], preset.scale[1], 1);
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={18}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        depthTest
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          varying vec2 vLocal;

          void main() {
            vUv = uv;
            vLocal = uv * 2.0 - 1.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uSoftness;
          uniform float uNoise;
          uniform float uStretch;
          uniform int uTerrainId;
          varying vec2 vUv;
          varying vec2 vLocal;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          void main() {
            vec2 p = vLocal;
            p.y *= uStretch;

            if (uTerrainId == 3) {
              p.x += sin((vUv.y + uTime * 0.18) * 22.0) * 0.045;
              p.y += sin((vUv.x - uTime * 0.12) * 18.0) * 0.035;
            }

            float core = 1.0 - smoothstep(0.18, uSoftness, length(p));
            float footA = 1.0 - smoothstep(0.08, 0.36, length((p - vec2(-0.22, -0.1)) * vec2(1.4, 0.78)));
            float footB = 1.0 - smoothstep(0.08, 0.36, length((p - vec2(0.22, 0.14)) * vec2(1.4, 0.78)));
            float body = max(core, max(footA, footB) * 0.58);
            float grain = hash(floor(vUv * 54.0)) - 0.5;

            if (uTerrainId == 0 || uTerrainId == 1) {
              float broadContact = 1.0 - smoothstep(0.12, uSoftness, length(p * vec2(0.82, 1.05)));
              float feather = 1.0 - smoothstep(0.58, 1.0, length(vLocal));
              body = broadContact * feather;
              grain *= 0.35;
            }

            if (uTerrainId == 2) {
              body *= 0.72 + hash(floor(vUv * vec2(36.0, 84.0))) * 0.42;
            }

            float alpha = body * uOpacity * (1.0 + grain * uNoise);
            alpha *= smoothstep(1.0, 0.78, max(abs(vLocal.x), abs(vLocal.y)));

            if (alpha < 0.006) discard;
            gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.56));
          }
        `}
      />
    </mesh>
  );
};

const ReflectiveWaterPlane = ({
  visible,
  characterPositionRef,
  ripplesRef,
  preset,
}) => {
  const water = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(WATER_SURFACE_SIZE, WATER_SURFACE_SIZE);
    const normalMap0 = createWaterNormalTexture(0.12);
    const normalMap1 = createWaterNormalTexture(0.58);
    const waterMesh = new Water(geometry, {
      color: preset.baseColor,
      textureWidth: 1024,
      textureHeight: 1024,
      clipBias: 0.015,
      flowDirection: new THREE.Vector2(0.58, 0.24),
      flowSpeed: 0.045 * (preset.waterFlow ?? 1),
      reflectivity: 0.28 * (preset.waterReflectivity ?? 1),
      scale: 5.6 * (preset.waterWave ?? 1),
      normalMap0,
      normalMap1,
    });

    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = WATER_SURFACE_HEIGHT;
    waterMesh.renderOrder = -4;
    waterMesh.receiveShadow = true;
    waterMesh.userData.normalMap0 = normalMap0;
    waterMesh.userData.normalMap1 = normalMap1;
    waterMesh.material.uniforms.uRippleTime = { value: 0 };
    waterMesh.material.uniforms.uRippleCount = { value: 0 };
    waterMesh.material.uniforms.uRippleStrength = {
      value: preset.waterRipple ?? 1,
    };
    waterMesh.material.uniforms.uWaterOrigin = { value: new THREE.Vector2() };
    waterMesh.material.uniforms.uCharacterXZ = { value: new THREE.Vector2() };
    waterMesh.material.uniforms.uRipples = {
      value: Array.from(
        { length: MAX_RIPPLES },
        () => new THREE.Vector4(9999, 9999, -9999, 0)
      ),
    };
    waterMesh.material.uniforms.uRippleDirections = {
      value: Array.from(
        { length: MAX_RIPPLES },
        () => new THREE.Vector4(0, -1, 0, 0)
      ),
    };
    waterMesh.material.fragmentShader = waterMesh.material.fragmentShader.replace(
      "uniform vec4 config;",
      `uniform vec4 config;
      uniform float uRippleTime;
      uniform int uRippleCount;
      uniform float uRippleStrength;
      uniform vec2 uWaterOrigin;
      uniform vec2 uCharacterXZ;
      uniform vec4 uRipples[${MAX_RIPPLES}];
      uniform vec4 uRippleDirections[${MAX_RIPPLES}];`
    );
    waterMesh.material.fragmentShader = waterMesh.material.fragmentShader.replace(
      "vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );",
      `vec3 normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );

      vec2 waterWorldXZ = uWaterOrigin + ( vUv - vec2( 0.5 ) ) * ${WATER_SURFACE_SIZE.toFixed(1)};
      vec2 rippleNormal = vec2( 0.0 );

      for ( int i = 0; i < ${MAX_RIPPLES}; i ++ ) {
        if ( i >= uRippleCount ) break;

        vec4 ripple = uRipples[ i ];
        float age = uRippleTime - ripple.z;

        if ( age > 0.0 && age < 3.4 ) {
          vec2 delta = waterWorldXZ - ripple.xy;
          float distanceToRipple = length( delta );
          vec2 away = distanceToRipple > 0.001 ? delta / distanceToRipple : vec2( 0.0, 1.0 );
          vec2 direction = normalize( uRippleDirections[ i ].xy );
          float forward = dot( delta, direction );
          float wake = smoothstep( 2.4, -0.4, forward ) * smoothstep( 0.08, 1.3, age );
          float radius = age * mix( 4.2, 6.4, ripple.w * 0.28 );
          float ringWidth = 0.12 + age * 0.085;
          float ring = exp( -pow( ( distanceToRipple - radius ) / ringWidth, 2.0 ) );
          float inner = exp( -pow( distanceToRipple / ( 0.38 + age * 0.32 ), 2.0 ) ) * ( 1.0 - smoothstep( 0.0, 0.48, age ) );
          float wakeLine = exp( -pow( abs( dot( delta, vec2( -direction.y, direction.x ) ) ) / ( 0.38 + age * 0.46 ), 2.0 ) ) * wake;
          float strength = exp( -age * 0.75 ) * ripple.w;
          rippleNormal += away * ring * strength * 0.24 * uRippleStrength;
          rippleNormal += away * inner * strength * 0.18 * uRippleStrength;
          rippleNormal += direction * wakeLine * strength * 0.13 * uRippleStrength;
        }
      }

      vec2 anchorDelta = waterWorldXZ - uCharacterXZ;
      float reflectionAnchor = 1.0 - smoothstep( 2.6, 9.5, length( anchorDelta ) );
      vec2 baseFlowNormal = normal.xz;
      vec2 reflectedNormal = baseFlowNormal + rippleNormal;
      vec2 anchoredNormal = mix( reflectedNormal, baseFlowNormal * 0.12, reflectionAnchor );

      normal = normalize( vec3( anchoredNormal.x, normal.y, anchoredNormal.y ) );`
    );
    waterMesh.material.needsUpdate = true;

    return waterMesh;
  }, [
    preset.baseColor,
    preset.waterFlow,
    preset.waterReflectivity,
    preset.waterRipple,
    preset.waterWave,
  ]);

  useEffect(() => {
    return () => {
      water.userData.normalMap0?.dispose();
      water.userData.normalMap1?.dispose();
      water.geometry.dispose();
      water.material.dispose();
    };
  }, [water]);

  useFrame((state) => {
    if (!visible) return;

    water.position.set(
      characterPositionRef.current.x,
      WATER_SURFACE_HEIGHT,
      characterPositionRef.current.z
    );
    water.material.uniforms.uRippleTime.value = state.clock.elapsedTime;
    water.material.uniforms.uRippleStrength.value = preset.waterRipple ?? 1;
    water.material.uniforms.uWaterOrigin.value.set(water.position.x, water.position.z);
    water.material.uniforms.uCharacterXZ.value.set(
      characterPositionRef.current.x,
      characterPositionRef.current.z
    );

    const ripples = ripplesRef.current;
    water.material.uniforms.uRippleCount.value = Math.min(
      ripples.length,
      MAX_RIPPLES
    );

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const ripple = ripples[i];
      water.material.uniforms.uRipples.value[i].set(
        ripple?.x ?? 9999,
        ripple?.z ?? 9999,
        ripple?.time ?? -9999,
        ripple?.strength ?? 0
      );
      water.material.uniforms.uRippleDirections.value[i].set(
        ripple?.dx ?? 0,
        ripple?.dz ?? -1,
        0,
        0
      );
    }
  });

  if (!visible) return null;

  return <primitive object={water} />;
};

const WaterRippleOverlay = ({
  visible,
  ripplesRef,
  characterPositionRef,
  preset,
}) => {
  const meshRef = useRef();
  const materialRef = useRef();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRipples: {
        value: Array.from(
          { length: MAX_RIPPLES },
          () => new THREE.Vector4(9999, 9999, -9999, 0)
        ),
      },
      uRippleDirections: {
        value: Array.from(
          { length: MAX_RIPPLES },
          () => new THREE.Vector4(0, -1, 0, 0)
        ),
      },
      uRippleCount: { value: 0 },
      uRippleStrength: { value: 1 },
    }),
    []
  );

  useFrame((state) => {
    if (!visible || !meshRef.current || !materialRef.current) return;

    meshRef.current.position.set(
      characterPositionRef.current.x,
      WATER_SURFACE_HEIGHT + 0.018,
      characterPositionRef.current.z
    );

    const ripples = ripplesRef.current;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uRippleCount.value = Math.min(ripples.length, MAX_RIPPLES);
    uniforms.uRippleStrength.value = preset.waterRipple ?? 1;

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const ripple = ripples[i];
      uniforms.uRipples.value[i].set(
        ripple?.x ?? 9999,
        ripple?.z ?? 9999,
        ripple?.time ?? -9999,
        ripple?.strength ?? 0
      );
      uniforms.uRippleDirections.value[i].set(
        ripple?.dx ?? 0,
        ripple?.dz ?? -1,
        0,
        0
      );
    }
  });

  if (!visible) return null;

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        characterPositionRef.current.x,
        WATER_SURFACE_HEIGHT + 0.018,
        characterPositionRef.current.z,
      ]}
      renderOrder={8}
    >
      <planeGeometry args={[WATER_RIPPLE_OVERLAY_SIZE, WATER_RIPPLE_OVERLAY_SIZE, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vWorldXZ;

          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldXZ = worldPosition.xz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec4 uRipples[${MAX_RIPPLES}];
          uniform vec4 uRippleDirections[${MAX_RIPPLES}];
          uniform int uRippleCount;
          uniform float uRippleStrength;
          varying vec2 vWorldXZ;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          void main() {
            float alpha = 0.0;
            float foam = 0.0;
            float glint = 0.0;
            vec3 color = vec3(0.74, 0.97, 1.0);

            for (int i = 0; i < ${MAX_RIPPLES}; i++) {
              if (i >= uRippleCount) break;
              vec4 ripple = uRipples[i];
              vec2 direction = normalize(uRippleDirections[i].xy);
              float age = uTime - ripple.z;

              if (age > 0.0 && age < 3.4) {
                vec2 delta = vWorldXZ - ripple.xy;
                float distanceToRipple = length(delta);
                vec2 away = distanceToRipple > 0.001 ? delta / distanceToRipple : vec2(0.0, 1.0);
                vec2 sideAxis = vec2(-direction.y, direction.x);
                float forward = dot(delta, direction);
                float side = dot(delta, sideAxis);
                float frontBias = smoothstep(-0.6, 1.8, forward);
                float wakeBias = smoothstep(2.8, -0.2, forward) * smoothstep(0.0, 2.4, age);
                float radius = age * mix(4.1, 6.2, ripple.w * 0.35);
                float fade = exp(-age * 0.72) * ripple.w * uRippleStrength;
                float ringWidth = 0.08 + age * 0.07;
                float broken =
                  0.72 +
                  0.28 * hash(floor((vWorldXZ + away * age * 2.0) * 4.5));

                float primary = exp(-pow((distanceToRipple - radius) / ringWidth, 2.0));
                float secondary = exp(-pow((distanceToRipple - radius * 0.62) / (ringWidth * 1.65), 2.0));
                float capillary = exp(-pow((distanceToRipple - radius * 1.24) / (ringWidth * 2.2), 2.0));
                float footOval = exp(-pow(side / 0.42, 2.0) - pow((forward + 0.25) / 1.05, 2.0));
                float wake = exp(-pow(side / (0.42 + age * 0.42), 2.0)) *
                  exp(-pow((forward + age * 1.55) / (1.25 + age * 1.3), 2.0));
                float centerSplash = exp(-distanceToRipple * 2.65) * (1.0 - smoothstep(0.0, 0.55, age));

                alpha += primary * fade * (0.34 + frontBias * 0.16) * broken;
                alpha += secondary * fade * 0.15;
                alpha += capillary * fade * 0.08 * broken;
                alpha += wake * wakeBias * fade * 0.18;
                alpha += footOval * fade * (1.0 - smoothstep(0.0, 0.46, age)) * 0.26;
                alpha += centerSplash * fade * 0.18;
                foam += (footOval + centerSplash) * fade * 0.24;
                glint += primary * fade * broken * (0.32 + frontBias * 0.24);
              }
            }

            if (alpha < 0.006) discard;
            vec3 finalColor = mix(color, vec3(1.0), clamp(foam + glint * 0.35, 0.0, 0.65));
            gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 0.62));
          }
        `}
      />
    </mesh>
  );
};

const WaterSurface = ({ visible, ripplesRef, characterPositionRef, preset }) => (
  <>
    <ReflectiveWaterPlane
      visible={visible}
      characterPositionRef={characterPositionRef}
      ripplesRef={ripplesRef}
      preset={preset}
    />
    <WaterRippleOverlay
      visible={visible}
      ripplesRef={ripplesRef}
      characterPositionRef={characterPositionRef}
      preset={preset}
    />
  </>
);

const WaterBackdrop = ({ visible, characterPositionRef, preset }) => {
  const meshRef = useRef();

  useFrame(() => {
    if (!visible || !meshRef.current) return;

    meshRef.current.position.set(
      characterPositionRef.current.x,
      -0.045 - 0.32 * ((preset.waterDepth ?? 1) - 1),
      characterPositionRef.current.z
    );
  });

  if (!visible) return null;

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-10}
      receiveShadow
    >
      <planeGeometry args={[2600, 2600, 1, 1]} />
      <meshBasicMaterial
        color={applyColorGain("#476f66", (preset.settings?.brightness ?? 1) * (preset.waterClarity ?? 1))}
      />
    </mesh>
  );
};

const BackroomCarpetMaterial = ({ preset }) => {
  const carpetMap = useTexture("/textures/backroom/carpet_felt034/Fabric034_1K-JPG_Color.jpg");

  useEffect(() => {
    if (!carpetMap) return;

    carpetMap.wrapS = THREE.RepeatWrapping;
    carpetMap.wrapT = THREE.RepeatWrapping;
    carpetMap.repeat.set(1, 1);
    carpetMap.anisotropy = 8;
    carpetMap.colorSpace = THREE.SRGBColorSpace;
    carpetMap.needsUpdate = true;
  }, [carpetMap]);

  return (
    <shaderMaterial
      uniforms={{
        uMap: { value: carpetMap },
        uBrightness: { value: preset.backroomBrightness ?? 1 },
      }}
      vertexShader={`
        varying vec2 vWorldXZ;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldXZ = worldPosition.xz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `}
      fragmentShader={`
        uniform sampler2D uMap;
        uniform float uBrightness;
        varying vec2 vWorldXZ;

        void main() {
          vec2 uv = vWorldXZ * 0.64;
          vec3 carpet = texture2D(uMap, uv).rgb;
          float feltNap =
            sin(vWorldXZ.x * 5.9 + vWorldXZ.y * 2.1) * 0.018 +
            sin((vWorldXZ.x - vWorldXZ.y) * 11.2) * 0.01;
          vec3 tint = vec3(0.68, 0.54, 0.20);
          vec3 low = vec3(0.28, 0.22, 0.08);
          vec3 color = carpet * tint * (1.02 * uBrightness);
          color = mix(color, low, 0.24);
          color += vec3(0.05, 0.04, 0.008) * uBrightness;
          color *= 1.0 + feltNap;
          gl_FragColor = vec4(color, 1.0);
        }
      `}
    />
  );
};

const BackroomCarpetAtmosphere = ({ preset }) => (
  <shaderMaterial
    transparent
    depthWrite={false}
    depthTest
    polygonOffset
    polygonOffsetFactor={-2}
    polygonOffsetUnits={-2}
    uniforms={{
      uBrightness: { value: preset.backroomBrightness ?? 1 },
      uCarpetGrain: { value: preset.backroomCarpetGrain ?? 1 },
      uFluorescent: { value: preset.backroomFluorescent ?? 1 },
    }}
    vertexShader={`
      varying vec2 vWorldXZ;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldXZ = worldPosition.xz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `}
    fragmentShader={`
      uniform float uBrightness;
      uniform float uCarpetGrain;
      uniform float uFluorescent;
      varying vec2 vWorldXZ;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 p = vWorldXZ;
        float grain = hash(floor(p * 2.2)) - 0.5;
        float fine = hash(floor(p * vec2(11.0, 19.0))) - 0.5;
        float dampPatch =
          smoothstep(0.58, 0.98, sin(p.x * 0.032 + p.y * 0.024) * 0.5 + 0.5) *
          smoothstep(0.54, 0.92, sin(p.x * -0.027 + p.y * 0.041) * 0.5 + 0.5);
        float stain =
          sin(p.x * 0.071 + p.y * 0.037) * 0.045 +
          sin(p.x * 0.019 - p.y * 0.063) * 0.034;

        float moduleZ = floor((p.y + 18.0) / 36.0);
        float laneSelector = mod(moduleZ + 300.0, 3.0);
        float lane = laneSelector < 0.5
          ? 0.0
          : laneSelector < 1.5
            ? -26.64
            : 26.64;
        float localZ = mod(p.y + 18.0, 36.0) - 18.0;
        float lampPool =
          exp(-pow((p.x - lane) / 17.5, 2.0) - pow((localZ + 6.5) / 13.5, 2.0));
        float cornerFalloff = smoothstep(62.0, 104.0, abs(p.x));

        vec3 sickYellow = vec3(0.82, 0.68, 0.22);
        vec3 wetBrown = vec3(0.18, 0.14, 0.06);
        vec3 color = mix(sickYellow, wetBrown, dampPatch * 0.52 + max(0.0, -stain) * 0.7);
        color *= 0.82 + (grain * 0.08 + fine * 0.04) * uCarpetGrain;
        color *= uBrightness;

        float alpha = 0.035 + lampPool * 0.11 * uFluorescent + dampPatch * 0.04 + cornerFalloff * 0.035;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.18));
      }
    `}
  />
);

const BackroomWallpaperMaterial = ({ preset, item }) => {
  const wallpaperMap = useTexture("/textures/backroom/wallpaper/Wallpaper002B_1K-JPG_Color.jpg");
  const isLongX = item.scale[0] >= item.scale[2];

  useEffect(() => {
    if (!wallpaperMap) return;

    wallpaperMap.wrapS = THREE.RepeatWrapping;
    wallpaperMap.wrapT = THREE.RepeatWrapping;
    wallpaperMap.repeat.set(1, 1);
    wallpaperMap.anisotropy = 8;
    wallpaperMap.colorSpace = THREE.SRGBColorSpace;
    wallpaperMap.needsUpdate = true;
  }, [wallpaperMap]);

  return (
    <shaderMaterial
      uniforms={{
        uMap: { value: wallpaperMap },
        uBrightness: { value: preset.backroomBrightness ?? 1 },
        uWallGrain: { value: preset.backroomWallGrain ?? 1 },
        uIsLongX: { value: isLongX ? 1 : 0 },
        uWallSize: {
          value: new THREE.Vector2(
            isLongX ? item.scale[0] : item.scale[2],
            item.scale[1]
          ),
        },
      }}
      vertexShader={`
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vLocalPosition = position.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `}
      fragmentShader={`
        uniform sampler2D uMap;
        uniform float uBrightness;
        uniform float uWallGrain;
        uniform int uIsLongX;
        uniform vec2 uWallSize;
        varying vec3 vWorldPosition;
        varying vec3 vLocalPosition;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec2 localFace = uIsLongX == 1
            ? vec2(vLocalPosition.x * uWallSize.x, vLocalPosition.y * uWallSize.y)
            : vec2(vLocalPosition.z * uWallSize.x, vLocalPosition.y * uWallSize.y);
          vec2 wallUv = localFace * 0.22;
          vec3 wallpaper = texture2D(uMap, wallUv).rgb;
          float grime =
            sin(vWorldPosition.x * 0.047 + vWorldPosition.z * 0.063 + vWorldPosition.y * 0.12) * 0.5 + 0.5;
          float speckle = hash(floor(vWorldPosition.xz * 0.7 + vWorldPosition.y * 0.21));
          vec3 yellow = vec3(0.86, 0.70, 0.25);
          vec3 shadow = vec3(0.26, 0.20, 0.07);
          vec3 color = wallpaper * yellow * (0.82 * uBrightness);
          color = mix(color, shadow, smoothstep(0.52, 0.94, grime) * 0.32 * uWallGrain);
          color += vec3(0.025, 0.021, 0.006) * uBrightness;
          color *= 0.88 + speckle * 0.08 * uWallGrain;
          gl_FragColor = vec4(color, 1.0);
        }
      `}
    />
  );
};

const BackroomEnvironment = ({ visible, characterPositionRef, preset }) => {
  const floorRef = useRef();
  const carpetOverlayRef = useRef();
  const shadowCatcherRef = useRef();
  const ceilingRef = useRef();
  const columnTexture = useMemo(() => createBackroomTexture("column"), []);
  const trimTexture = useMemo(() => createBackroomTexture("trim"), []);
  const [centerZ, setCenterZ] = useState(0);
  const centerZRef = useRef(0);
  const structures = useMemo(() => {
    return createBackroomStructureItems(centerZ);
  }, [centerZ]);
  const trims = useMemo(() => createBackroomTrimItems(structures), [structures]);
  const ceilingGrid = useMemo(() => createBackroomCeilingGridItems(centerZ), [centerZ]);
  const lights = useMemo(() => createBackroomLightItems(centerZ), [centerZ]);

  useEffect(() => {
    return () => {
      columnTexture.dispose();
      trimTexture.dispose();
    };
  }, [columnTexture, trimTexture]);

  useFrame(() => {
    if (!visible) return;

    const characterZ = characterPositionRef.current.z;
    const nextCenterZ =
      Math.round(characterZ / BACKROOM_MODULE_SIZE) * BACKROOM_MODULE_SIZE;

    if (nextCenterZ !== centerZRef.current) {
      centerZRef.current = nextCenterZ;
      setCenterZ(nextCenterZ);

      if (floorRef.current) {
        floorRef.current.position.z = nextCenterZ;
      }

      if (carpetOverlayRef.current) {
        carpetOverlayRef.current.position.z = nextCenterZ;
      }

      if (shadowCatcherRef.current) {
        shadowCatcherRef.current.position.z = nextCenterZ;
      }

      if (ceilingRef.current) {
        ceilingRef.current.position.z = nextCenterZ;
      }
    }
  });

  if (!visible) return null;

  return (
    <group>
      <mesh
        ref={floorRef}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-20}
        receiveShadow
      >
        <planeGeometry args={[BACKROOM_WORLD_SIZE, BACKROOM_WORLD_SIZE, 1, 1]} />
        <BackroomCarpetMaterial preset={preset} />
      </mesh>

      <mesh
        ref={carpetOverlayRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.09, 0]}
        renderOrder={-19}
      >
        <planeGeometry args={[BACKROOM_WORLD_SIZE, BACKROOM_WORLD_SIZE, 1, 1]} />
        <BackroomCarpetAtmosphere preset={preset} />
      </mesh>

      <mesh
        ref={shadowCatcherRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.115, 0]}
        renderOrder={-17}
        receiveShadow
      >
        <planeGeometry args={[BACKROOM_WORLD_SIZE, BACKROOM_WORLD_SIZE, 1, 1]} />
        <shadowMaterial
          color="#211904"
          opacity={0.38}
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>

      <mesh
        ref={ceilingRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, BACKROOM_HEIGHT, 0]}
        renderOrder={-18}
        receiveShadow
      >
        <planeGeometry args={[BACKROOM_WORLD_SIZE, BACKROOM_WORLD_SIZE, 1, 1]} />
        <shaderMaterial
          uniforms={{
            uBrightness: { value: preset.backroomBrightness ?? 1 },
            uCeilingGrid: { value: preset.backroomCeilingGrid ?? 1 },
          }}
          vertexShader={`
            varying vec2 vWorldXZ;
            uniform float uBrightness;
            uniform float uCeilingGrid;

            void main() {
              vec4 worldPosition = modelMatrix * vec4(position, 1.0);
              vWorldXZ = worldPosition.xz;
              gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
          `}
          fragmentShader={`
            varying vec2 vWorldXZ;

            float hash(vec2 p) {
              return fract(sin(dot(p, vec2(19.19, 73.17))) * 43758.5453123);
            }

            void main() {
              vec2 cell = abs(fract(vWorldXZ / 9.0) - 0.5);
              float grid = 1.0 - smoothstep(0.455, 0.5, max(cell.x, cell.y));
              float grain = hash(floor(vWorldXZ * 1.15)) - 0.5;
              float panelAge =
                sin(vWorldXZ.x * 0.084 + vWorldXZ.y * 0.043) * 0.06 +
                sin(vWorldXZ.x * -0.038 + vWorldXZ.y * 0.071) * 0.05;
              vec3 color = vec3(0.82, 0.76, 0.38) * (1.0 + grain * 0.08 + panelAge * 0.55);
              color = mix(color, vec3(0.38, 0.34, 0.13), grid * 0.45 * uCeilingGrid);
              color = mix(color, vec3(1.0, 0.94, 0.54), 0.16);
              color *= 1.18 * uBrightness;

              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>

      {structures.map((item) => {
        const scaledItem = {
          ...item,
          scale: [
            item.scale[0] * (preset.backroomHallScale ?? 1),
            item.scale[1],
            item.scale[2],
          ],
        };

        return (
          <group key={item.key}>
            <mesh
              position={scaledItem.position}
              scale={scaledItem.scale}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1, 1, 1]} />
              {item.type === "column" ? (
                <meshStandardMaterial
                  map={columnTexture}
                  color={applyColorGain(
                    "#9c8b3d",
                    (preset.backroomBrightness ?? 1) *
                      (0.92 + (preset.backroomWallGrain ?? 1) * 0.16)
                  )}
                  emissive={applyColorGain("#5f501c", (preset.backroomBrightness ?? 1) * 0.08)}
                  roughness={1}
                  metalness={0}
                />
              ) : (
                <BackroomWallpaperMaterial
                  preset={preset}
                  item={scaledItem}
                />
              )}
            </mesh>
          </group>
        );
      })}

      {trims.map((trim) => (
        <mesh
          key={trim.key}
          position={trim.position}
          scale={trim.scale}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            map={trimTexture}
            color={applyColorGain("#4d431d", preset.backroomBrightness ?? 1)}
            roughness={0.98}
            metalness={0}
          />
        </mesh>
      ))}

      {ceilingGrid.map((grid) => (
        <mesh key={grid.key} position={grid.position} scale={grid.scale} receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={applyColorGain("#4f471c", preset.backroomBrightness ?? 1)}
            roughness={0.96}
            metalness={0}
          />
        </mesh>
      ))}

      {lights.map((light) => (
        <group key={light.key} position={light.position}>
          <mesh position={[0, -0.08, 0]} scale={[16.4, 0.24, 6.8]} receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color="#8b8038"
              roughness={0.82}
              metalness={0.05}
            />
          </mesh>
          <mesh position={[0, -0.24, 0]} scale={[14.4, 0.08, 5.2]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#fff7bb" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.29, 0]} scale={[13.5, 0.04, 4.5]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={applyColorGain("#f6f0a8", 1.75 * (preset.backroomFluorescent ?? 1))}
              transparent
              opacity={0.96}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[30, 13, 1, 1]} />
            <meshBasicMaterial
              color={applyColorGain("#f2e36f", 1.6 * (preset.backroomFluorescent ?? 1))}
              transparent
              opacity={0.28}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <pointLight
            position={[0, -1.8, 0]}
            color="#ffe982"
            intensity={4.6 * (preset.backroomFluorescent ?? 1)}
            distance={86}
            decay={1.55}
          />
        </group>
      ))}
    </group>
  );
};

const InfiniteSnowWorld = ({
  terrain = "snow",
  terrainSettings = {},
  selectedAssetKey = null,
  placedObjects = [],
  onPlaceObject,
  objectEditMode = false,
  selectedObjectId = null,
  onSelectObject,
  brushEnabled = false,
  brushMode = "raise",
  brushSize = 12,
}) => {
  // References for character and chunks
  const characterRef = useRef();
  const characterParentRef = useRef();
  const chunksRef = useRef([]);
  const lastActiveChunkRef = useRef(null);
  const currentChunkOriginRef = useRef({ x: 0, z: 0 });
  const pendingChunkUpdatesRef = useRef([]);
  const deformedChunksMapRef = useRef(new Map());
  const sculptPaintingRef = useRef(false);
  const brushCursorRef = useRef({
    visible: false,
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
  });
  const ripplesRef = useRef([]);
  const grassContactsRef = useRef([]);
  const characterPositionRef = useRef(new THREE.Vector3(9999, 9999, 9999));
  const terrainTravelStateRef = useRef(new Map());
  const activeTerrainRef = useRef(terrain);
  const grassBrushDirectionRef = useRef(new THREE.Vector2(0, -1));
  const lastContactTimeRef = useRef({
    left: 0,
    right: 0,
    body: 0,
  });

  // References for movement and rotation smoothing
  const smoothMovement = useRef(new THREE.Vector3());
  const lastMovementTime = useRef(0);
  const currentRotation = useRef(INITIAL_CHARACTER_ROTATION);
  const oneShotActionRef = useRef(null);
  const previousMovementAnimationRef = useRef(null);
  const hipsBoneRef = useRef(null);
  const hipsBaseYRef = useRef(0);
  const isSittingRef = useRef(false);
  const lastBackwardTapTimeRef = useRef(0);
  const lastBackwardTapRotationRef = useRef(INITIAL_CHARACTER_ROTATION);
  const interactionRequestsRef = useRef({
    toggleSit: false,
    dodgeBack: false,
    dodgeRotation: INITIAL_CHARACTER_ROTATION,
    jump: false,
  });
  const characterPosition = new THREE.Vector3();

  // Camera setup
  const { camera } = useThree();
  const cameraOffset = useMemo(() => new THREE.Vector3(0, 20, 30), []);
  const cameraTargetRef = useRef(new THREE.Vector3());
  const cameraPositionRef = useRef(new THREE.Vector3());
  const hasInitializedCameraRef = useRef(false);
  const hasAlignedCharacterRef = useRef(false);
  const terrainPreset = useMemo(
    () =>
      tuneTerrainPreset(
        TERRAIN_PRESETS[terrain] || TERRAIN_PRESETS.snow,
        terrainSettings
      ),
    [terrain, terrainSettings]
  );

  // State for movement
  const isMovingRef = useRef(false);
  const [longBowClips, setLongBowClips] = useState([]);
  const [isCharacterReady, setIsCharacterReady] = useState(false);

  // Reference for movement input
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    turnLeft: false,
    turnRight: false,
    running: false,
  });

  // Load character model and animations
  const scene = useLoader(
    FBXLoader,
    `${LONG_BOW_BASE_PATH}${encodeURIComponent(LONG_BOW_MODEL)}`
  );
  const characterAnimations = useMemo(
    () => [...longBowClips],
    [longBowClips]
  );
  const { actions } = useAnimations(characterAnimations, scene);
  const currentAnimationRef = useRef(null);
  const [isCharacterAligned, setIsCharacterAligned] = useState(false);
  const activePlacedObjects = useMemo(
    () => placedObjects.filter((placement) => placement.terrain === terrain),
    [placedObjects, terrain]
  );

  // Load textures for snow and character
  const [colorMap, normalMap, roughnessMap, aoMap] = useTexture([
    "/textures/snow/snow-color.jpg",
    "/textures/snow/snow-normal-gl.jpg",
    "/textures/snow/snow-roughness.jpg",
    "/textures/snow/snow-ambientocclusion.jpg",
  ]);
  const [
    stoneColorMap,
    stoneNormalMap,
    stoneRoughnessMap,
    stoneAoMap,
  ] = useTexture([
    "/textures/stone/ground081/Ground081_1K-JPG_Color.jpg",
    "/textures/stone/ground081/Ground081_1K-JPG_NormalGL.jpg",
    "/textures/stone/ground081/Ground081_1K-JPG_Roughness.jpg",
    "/textures/stone/ground081/Ground081_1K-JPG_AmbientOcclusion.jpg",
  ]);
  const [
    sandColorMap,
    sandNormalMap,
    sandRoughnessMap,
    sandAoMap,
  ] = useTexture([
    "/textures/sand/ground101/Ground101_Color.jpg",
    "/textures/sand/ground101/Ground101_NormalDX.jpg",
    "/textures/sand/ground101/Ground101_Roughness.jpg",
    "/textures/sand/ground101/Ground101_AmbientOcclusion.jpg",
  ]);
  const generatedTerrainMap = useMemo(
    () => createTerrainTexture(terrainPreset, terrain),
    [terrain, terrainPreset]
  );
  const terrainMap =
    terrain === "stone"
      ? stoneColorMap
      : terrain === "sand"
        ? sandColorMap
      : terrain === "snow"
        ? colorMap
        : generatedTerrainMap;
  const terrainNormalMap =
    terrain === "stone"
      ? stoneNormalMap
      : terrain === "sand"
        ? sandNormalMap
      : terrain === "snow"
        ? normalMap
        : null;
  const terrainRoughnessMap =
    terrain === "stone"
      ? stoneRoughnessMap
      : terrain === "sand"
        ? sandRoughnessMap
        : terrain === "snow"
          ? roughnessMap
          : null;
  const terrainAoMap =
    terrain === "stone" ? stoneAoMap : terrain === "sand" ? sandAoMap : aoMap;
  useEffect(() => {
    const repeat = 3.35 * (terrainPreset.textureScale ?? 1);

    [
      stoneColorMap,
      stoneNormalMap,
      stoneRoughnessMap,
      stoneAoMap,
    ].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });

    stoneColorMap.colorSpace = THREE.SRGBColorSpace;
    stoneNormalMap.colorSpace = THREE.NoColorSpace;
    stoneRoughnessMap.colorSpace = THREE.NoColorSpace;
    stoneAoMap.colorSpace = THREE.NoColorSpace;
  }, [
    stoneAoMap,
    stoneColorMap,
    stoneNormalMap,
    stoneRoughnessMap,
    terrainPreset.textureScale,
  ]);

  useEffect(() => {
    const repeat = 2.85 * (terrainPreset.textureScale ?? 1);

    [
      sandColorMap,
      sandNormalMap,
      sandRoughnessMap,
      sandAoMap,
    ].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });

    sandColorMap.colorSpace = THREE.SRGBColorSpace;
    sandNormalMap.colorSpace = THREE.NoColorSpace;
    sandRoughnessMap.colorSpace = THREE.NoColorSpace;
    sandAoMap.colorSpace = THREE.NoColorSpace;
  }, [
    sandAoMap,
    sandColorMap,
    sandNormalMap,
    sandRoughnessMap,
    terrainPreset.textureScale,
  ]);

  useEffect(() => {
    return () => {
      generatedTerrainMap.dispose();
    };
  }, [generatedTerrainMap]);

  // Function to switch character animations
  const switchAnimation = useCallback((animationName, options = {}) => {
    const currentAnimation = currentAnimationRef.current;

    if (currentAnimation === animationName) return;

    const nextAction = actions[animationName];
    if (!nextAction) return;

    actions[currentAnimation]?.fadeOut(options.fadeDuration ?? DEFAULT_FADE_DURATION);

    nextAction.enabled = true;
    nextAction.timeScale = ANIMATION_TIME_SCALE[animationName] ?? 1;
    nextAction.clampWhenFinished = Boolean(options.once);
    nextAction.setLoop(
      options.once ? THREE.LoopOnce : THREE.LoopRepeat,
      options.once ? 1 : Infinity
    );
    nextAction
      .reset()
      .fadeIn(options.fadeDuration ?? DEFAULT_FADE_DURATION)
      .play();
    currentAnimationRef.current = animationName;
  }, [actions]);

  const startOneShotAnimation = (animationName, rotationDelta = 0, options = {}) => {
    const action = actions[animationName];
    if (!action || oneShotActionRef.current) return false;

    switchAnimation(animationName, {
      once: true,
      fadeDuration: ONE_SHOT_FADE_DURATION,
    });

    oneShotActionRef.current = {
      animationName,
      elapsed: 0,
      duration: Math.max(action.getClip().duration, 0.01),
      rotationStart: currentRotation.current,
      rotationDelta,
      moveX: options.moveX ?? 0,
      moveZ: options.moveZ ?? 0,
      moveStart: options.moveStart ?? DODGE_MOVE_START,
      moveEnd: options.moveEnd ?? DODGE_MOVE_END,
      liftHeight: options.liftHeight ?? 0,
      liftStart: options.liftStart ?? JUMP_LIFT_START,
      liftEnd: options.liftEnd ?? JUMP_LIFT_END,
      landingY: Number.isFinite(options.landingY) ? options.landingY : null,
      landingIsDrop: Boolean(options.landingIsDrop),
      landingLockY: Number.isFinite(options.landingLockY)
        ? options.landingLockY
        : null,
      landingLockAt: options.landingLockAt ?? null,
      clearanceHeight: options.clearanceHeight ?? null,
      ignorePlacementId: options.ignorePlacementId ?? null,
      crouchDepth: options.crouchDepth ?? 0,
      crouchStart: options.crouchStart ?? JUMP_CROUCH_START,
      crouchEnd: options.crouchEnd ?? JUMP_CROUCH_END,
      blendOutAt: options.blendOutAt ?? 1,
      blendOutTo: options.blendOutTo ?? null,
      blendOutFadeDuration: options.blendOutFadeDuration ?? 0.16,
      hasBlendedOut: false,
      baseY: Number.isFinite(options.baseY)
        ? options.baseY
        : characterParentRef.current?.position.y ?? 0,
      movedX: 0,
      movedZ: 0,
    };

    return true;
  };

  useEffect(() => {
    const idleAction = actions.idle;
    if (!idleAction || longBowClips.length === 0 || isCharacterReady) {
      return undefined;
    }

    idleAction.enabled = true;
    idleAction.timeScale = ANIMATION_TIME_SCALE.idle;
    idleAction.clampWhenFinished = false;
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.reset().play();
    currentAnimationRef.current = "idle";
    const frame = requestAnimationFrame(() => setIsCharacterReady(true));

    return () => cancelAnimationFrame(frame);
  }, [actions.idle, isCharacterReady, longBowClips.length]);

  useEffect(() => {
    let isCancelled = false;
    const loader = new FBXLoader();
    const sceneNameMap = createSceneNameMap(scene);

    Promise.all(
      Object.entries(LONG_BOW_ANIMATIONS).map(([name, fileName]) => {
        const url = `${LONG_BOW_BASE_PATH}${encodeURIComponent(fileName)}`;

        return new Promise((resolve, reject) => {
          loader.load(
            url,
            (fbx) => {
              const clip = fbx.animations[0];
              resolve(clip ? retargetClipToScene(clip, name, sceneNameMap) : null);
            },
            undefined,
            reject
          );
        });
      })
    )
      .then((clips) => {
        if (!isCancelled) {
          setLongBowClips(clips.filter((clip) => clip && clip.tracks.length > 0));
        }
      })
      .catch((error) => {
        console.warn("Could not load Longbow locomotion animations.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [scene]);

  // Update character scale on load
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.renderOrder = 10;

        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.filter(Boolean).forEach((material) => {
          material.depthWrite = true;

          if ((material.opacity ?? 1) >= 0.99) {
            material.transparent = false;
          }

          if (material.map) {
            material.alphaTest = Math.max(material.alphaTest ?? 0, 0.08);
          }

          material.needsUpdate = true;
        });
      }
    });

    if (characterRef.current) {
      characterRef.current.scale.setScalar(CHARACTER_SCALE);
    }
  }, [scene]);

  // Adjust character's vertical position based on bounding box
  useEffect(() => {
    let frame = 0;
    let isCancelled = false;

    const alignCharacter = () => {
      if (isCancelled) return;

      if (!characterRef.current || !characterParentRef.current) {
        frame = requestAnimationFrame(alignCharacter);
        return;
      }

      characterRef.current.scale.setScalar(CHARACTER_SCALE);
      characterRef.current.position.set(0, 0, 0);
      characterParentRef.current.position.set(0, 0, 0);
      characterParentRef.current.rotation.y = INITIAL_CHARACTER_ROTATION;
      currentRotation.current = INITIAL_CHARACTER_ROTATION;
      characterParentRef.current.updateMatrixWorld(true);
      characterRef.current.updateMatrixWorld(true);

      hipsBoneRef.current = null;
      characterRef.current.traverse((child) => {
        if (child.isBone && normalizeBoneName(child.name).endsWith("hips")) {
          hipsBoneRef.current = child;
          hipsBaseYRef.current = child.position.y;
        }
      });

      const boundingBox = new THREE.Box3().setFromObject(characterRef.current);
      const yMin = boundingBox.min.y;

      characterRef.current.position.y = -yMin - CHARACTER_GROUND_SINK;
      characterParentRef.current.updateMatrixWorld(true);
      characterRef.current.updateMatrixWorld(true);
      characterParentRef.current.getWorldPosition(characterPositionRef.current);
      hasAlignedCharacterRef.current = true;
      setIsCharacterAligned(true);
      hasInitializedCameraRef.current = false;
    };

    frame = requestAnimationFrame(alignCharacter);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [scene]);

  // Handle keyboard inputs for movement
  useEffect(() => {
    const getInputId = (event) => {
      const key = event.key.toLowerCase();
      const code = event.code.toLowerCase();

      if (key === "shift" || code === "shiftleft" || code === "shiftright") {
        return "shift";
      }

      if (key === " " || code === "space") return "space";

      if (key.startsWith("arrow")) return key;
      if (["w", "a", "s", "d", "q", "e", "x"].includes(key)) return key;
      if (["keyw", "keya", "keys", "keyd", "keyq", "keye", "keyx"].includes(code)) {
        return code.replace("key", "");
      }

      return key;
    };
    const movementKeys = new Set([
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      "w",
      "a",
      "s",
      "d",
      "q",
      "e",
      "x",
      "space",
      "shift",
    ]);

    const handleKeyDown = (event) => {
      const key = getInputId(event);
      if (movementKeys.has(key)) {
        event.preventDefault();
      }

      switch (key) {
        case "arrowup":
        case "w":
          movement.current.forward = true;
          break;
        case "arrowdown":
        case "s":
          if (!event.repeat) {
            const now = Date.now();
            if (now - lastBackwardTapTimeRef.current <= DOUBLE_TAP_THRESHOLD) {
              interactionRequestsRef.current.dodgeBack = true;
              interactionRequestsRef.current.dodgeRotation =
                lastBackwardTapRotationRef.current;
            } else {
              lastBackwardTapRotationRef.current = currentRotation.current;
            }
            lastBackwardTapTimeRef.current = now;
          }
          movement.current.backward = true;
          break;
        case "arrowleft":
        case "a":
          movement.current.left = true;
          break;
        case "arrowright":
        case "d":
          movement.current.right = true;
          break;
        case "shift":
          movement.current.running = true;
          break;
        case "q":
          movement.current.turnLeft = true;
          break;
        case "e":
          movement.current.turnRight = true;
          break;
        case "x":
          if (!event.repeat) {
            interactionRequestsRef.current.toggleSit = true;
          }
          break;
        case "space":
          if (!event.repeat) {
            interactionRequestsRef.current.jump = true;
          }
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event) => {
      const key = getInputId(event);
      if (movementKeys.has(key)) {
        event.preventDefault();
      }

      switch (key) {
        case "arrowup":
        case "w":
          movement.current.forward = false;
          break;
        case "arrowdown":
        case "s":
          movement.current.backward = false;
          break;
        case "arrowleft":
        case "a":
          movement.current.left = false;
          break;
        case "arrowright":
        case "d":
          movement.current.right = false;
          break;
        case "shift":
          movement.current.running = false;
          break;
        case "q":
          movement.current.turnLeft = false;
          break;
        case "e":
          movement.current.turnRight = false;
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Handle touch inputs for mobile controls
  useEffect(() => {
    const touchStartRef = { x: 0, y: 0 };
    const joystickRef = { x: 0, y: 0 };

    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      touchStartRef.x = touch.clientX;
      touchStartRef.y = touch.clientY;
    };

    const handleTouchMove = (event) => {
      event.preventDefault();
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStartRef.x;
      const deltaY = touch.clientY - touchStartRef.y;

      const maxRadius = 50; // Maximum joystick radius
      const distance = Math.min(
        Math.sqrt(deltaX * deltaX + deltaY * deltaY),
        maxRadius
      );
      const angle = Math.atan2(deltaY, deltaX);

      joystickRef.x = (distance / maxRadius) * Math.cos(angle);
      joystickRef.y = (distance / maxRadius) * Math.sin(angle);

      movement.current.left = joystickRef.x < -0.3;
      movement.current.right = joystickRef.x > 0.3;
      movement.current.forward = joystickRef.y < -0.3;
      movement.current.backward = joystickRef.y > 0.3;
      movement.current.running = distance / maxRadius > 0.7;
    };

    const handleTouchEnd = () => {
      joystickRef.x = 0;
      joystickRef.y = 0;
      movement.current.left = false;
      movement.current.right = false;
      movement.current.forward = false;
      movement.current.backward = false;
      movement.current.running = false;
    };

    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Generate snow chunks based on CHUNKS_PER_SIDE
  const snowChunks = useMemo(() => {
    const chunks = [];
    for (let x = -CHUNKS_PER_SIDE; x <= CHUNKS_PER_SIDE; x++) {
      for (let z = -CHUNKS_PER_SIDE; z <= CHUNKS_PER_SIDE; z++) {
        chunks.push({ x, z });
      }
    }
    return chunks;
  }, []);

  // Utility function to generate a unique key for each chunk
  const getChunkKey = (x, z) =>
    `${Math.round(x / CHUNK_SIZE)},${Math.round(z / CHUNK_SIZE)}`;

  // Save the deformation state of a chunk
  const saveChunkDeformation = useCallback((chunk) => {
    if (!chunk) return;
    const chunkKey = getChunkKey(chunk.position.x, chunk.position.z);
    const position = chunk.geometry.attributes.position;
    deformedChunksMapRef.current.set(
      chunkKey,
      new Float32Array(position.array)
    );
  }, []);

  // Load the deformation state of a chunk if available
  const loadChunkDeformation = useCallback((chunk) => {
    if (!chunk) return;
    const chunkKey = getChunkKey(chunk.position.x, chunk.position.z);
    const savedDeformation = deformedChunksMapRef.current.get(chunkKey);

    if (savedDeformation) {
      const position = chunk.geometry.attributes.position;
      position.array.set(savedDeformation);
      position.needsUpdate = true;
      chunk.geometry.computeVertexNormals();
      return true;
    }
    return false;
  }, []);

  const resetChunkGeometry = useCallback((chunk) => {
    const geometry = chunk?.geometry;
    const originalPosition = geometry?.userData?.originalPosition;

    if (!geometry || !originalPosition) return;

    geometry.attributes.position.array.set(originalPosition);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }, []);

  useEffect(() => {
    const previousTerrain = activeTerrainRef.current;
    const terrainChanged = previousTerrain !== terrain;

    if (terrainChanged && characterParentRef.current && hasAlignedCharacterRef.current) {
      terrainTravelStateRef.current.set(previousTerrain, {
        position: characterParentRef.current.position.clone(),
        rotation: currentRotation.current,
      });
    }

    activeTerrainRef.current = terrain;

    if (terrainChanged && characterParentRef.current && hasAlignedCharacterRef.current) {
      const savedState = terrainTravelStateRef.current.get(terrain);
      const baseY = characterParentRef.current.position.y;
      const nextPosition =
        savedState?.position ?? new THREE.Vector3(0, baseY, 0);
      const nextRotation = savedState?.rotation ?? INITIAL_CHARACTER_ROTATION;

      characterParentRef.current.position.set(
        nextPosition.x,
        Number.isFinite(nextPosition.y) ? nextPosition.y : baseY,
        nextPosition.z
      );
      currentRotation.current = nextRotation;
      characterParentRef.current.rotation.y = nextRotation;
      characterParentRef.current.updateMatrixWorld(true);
      characterParentRef.current.getWorldPosition(characterPositionRef.current);

      hasInitializedCameraRef.current = false;
    }

    const chunkOriginPosition =
      characterParentRef.current && hasAlignedCharacterRef.current
        ? characterParentRef.current.position
        : new THREE.Vector3(0, 0, 0);
    const originX =
      Math.round((chunkOriginPosition.x || 0) / CHUNK_SIZE) * CHUNK_SIZE;
    const originZ =
      Math.round((chunkOriginPosition.z || 0) / CHUNK_SIZE) * CHUNK_SIZE;

    deformedChunksMapRef.current.clear();
    pendingChunkUpdatesRef.current = [];
    currentChunkOriginRef.current = { x: originX, z: originZ };
    ripplesRef.current = [];
    grassContactsRef.current = [];
    lastContactTimeRef.current = {
      left: 0,
      right: 0,
      body: 0,
    };

    chunksRef.current.forEach((chunk, index) => {
      if (!chunk) return;

      const chunkOffset = snowChunks[index];
      if (chunkOffset) {
        chunk.position.set(
          originX + chunkOffset.x * CHUNK_SIZE,
          0,
          originZ + chunkOffset.z * CHUNK_SIZE
        );
      }

      resetChunkGeometry(chunk);

      if (chunk.material) {
        chunk.material.opacity = terrainPreset.opacity ?? 1;
        chunk.material.transparent = (terrainPreset.opacity ?? 1) < 1;
        chunk.material.depthWrite = true;
        chunk.material.needsUpdate = true;
      }
    });
  }, [resetChunkGeometry, snowChunks, terrain, terrainPreset.opacity]);

  const applyChunkUpdate = useCallback(
    (update) => {
      const chunk = chunksRef.current[update.index];
      if (!chunk) return;

      chunk.position.set(update.x, 0, update.z);

      if (!loadChunkDeformation(chunk)) {
        resetChunkGeometry(chunk);
      }

      chunk.userData.fadeProgress = 0;
      if (chunk.material) {
        chunk.material.opacity = 0;
        chunk.material.transparent = true;
        chunk.material.depthWrite = false;
        chunk.material.needsUpdate = true;
      }
    },
    [loadChunkDeformation, resetChunkGeometry]
  );

  const updateChunkFades = useCallback(
    (frameDelta) => {
      const targetOpacity = terrainPreset.opacity ?? 1;

      chunksRef.current.forEach((chunk) => {
        if (!chunk?.material) return;

        const fadeProgress = chunk.userData.fadeProgress;
        if (typeof fadeProgress !== "number") return;

        const nextProgress = Math.min(
          1,
          fadeProgress + frameDelta / CHUNK_FADE_DURATION
        );
        const easedProgress = THREE.MathUtils.smoothstep(nextProgress, 0, 1);

        chunk.userData.fadeProgress = nextProgress;
        chunk.material.opacity = targetOpacity * easedProgress;
        chunk.material.transparent = true;
        chunk.material.depthWrite = false;

        if (nextProgress >= 1) {
          delete chunk.userData.fadeProgress;
          chunk.material.opacity = targetOpacity;
          chunk.material.transparent = targetOpacity < 1;
          chunk.material.depthWrite = true;
          chunk.material.needsUpdate = true;
        }
      });
    },
    [terrainPreset.opacity]
  );

  const enqueueChunkUpdates = useCallback(
    (originX, originZ, characterPosition) => {
      const desiredChunks = snowChunks.map((chunk) => {
        const x = originX + chunk.x * CHUNK_SIZE;
        const z = originZ + chunk.z * CHUNK_SIZE;
        const distance = Math.hypot(
          x - characterPosition.x,
          z - characterPosition.z
        );

        return {
          x,
          z,
          key: getChunkKey(x, z),
          distance,
        };
      });
      const desiredKeys = new Set(desiredChunks.map((chunk) => chunk.key));
      const occupiedKeys = new Set();
      const recyclableChunks = [];

      chunksRef.current.forEach((chunk, index) => {
        if (!chunk) return;

        const key = getChunkKey(chunk.position.x, chunk.position.z);

        if (desiredKeys.has(key) && !occupiedKeys.has(key)) {
          occupiedKeys.add(key);
          return;
        }

        recyclableChunks.push({
          index,
          distance: Math.hypot(
            chunk.position.x - characterPosition.x,
            chunk.position.z - characterPosition.z
          ),
        });
      });

      const missingChunks = desiredChunks
        .filter((chunk) => !occupiedKeys.has(chunk.key))
        .sort((a, b) => b.distance - a.distance);

      recyclableChunks.sort((a, b) => b.distance - a.distance);

      const updates = missingChunks
        .map((target, updateIndex) => {
          const source = recyclableChunks[updateIndex];

          if (!source) return null;

          return {
            index: source.index,
            x: target.x,
            z: target.z,
            distance: target.distance,
          };
        })
        .filter(Boolean);

      pendingChunkUpdatesRef.current = updates;
    },
    [snowChunks]
  );

  const processPendingChunkUpdates = useCallback(() => {
    if (pendingChunkUpdatesRef.current.length === 0) return;

    const updatesThisFrame = pendingChunkUpdatesRef.current.splice(
      0,
      CHUNK_UPDATES_PER_FRAME
    );

    updatesThisFrame.forEach(applyChunkUpdate);
  }, [applyChunkUpdate]);

  const collidesWithPlacedObjects = useCallback(
    (position, options = {}) =>
      activePlacedObjects.some((placement) =>
        collidesWithPlacedObject(position, placement, undefined, {
          respectStepHeight: true,
          respectVerticalPosition: true,
          ...options,
        })
      ),
    [activePlacedObjects]
  );

  const collidesWithScene = useCallback(
    (position, options = {}) =>
      (terrainPreset.type === "backroom" && collidesWithBackroom(position)) ||
      collidesWithPlacedObjects(position, options),
    [collidesWithPlacedObjects, terrainPreset.type]
  );

  const findObjectUnderPoint = useCallback(
    (position, options = {}) => {
      let bestMatch = null;
      let bestTopY = -Infinity;

      activePlacedObjects.forEach((placement) => {
        if (options.sittableOnly && !SITTABLE_ASSET_KEYS.has(placement.assetKey)) {
          return;
        }

        const asset = NATURE_ASSETS[placement.assetKey];
        const collider = placement.collider ?? asset?.collider;
        if (!collider) return;
        if (
          options.maxHeight &&
          (collider.height ?? Infinity) > options.maxHeight
        ) {
          return;
        }

        if (
          !collidesWithPlacedObject(position, placement, options.padding ?? { x: 0, z: 0 })
        ) {
          return;
        }

        const topY = getPlacedObjectTopY(placement);
        if (topY > bestTopY) {
          bestTopY = topY;
          bestMatch = placement;
        }
      });

      return bestMatch;
    },
    [activePlacedObjects]
  );

  const sampleTerrainHeight = useCallback(
    (position) => {
      if (!SCULPTABLE_TERRAINS.has(terrain)) return 0;

      const size = CHUNK_SIZE + CHUNK_OVERLAP * 2;
      const halfSize = size * 0.5;
      let bestHeight = 0;
      let bestScore = -Infinity;

      chunksRef.current.forEach((chunk) => {
        if (!chunk?.geometry?.attributes?.position) return;

        const localPoint = tempCollisionPosition.set(position.x, 0, position.z);
        chunk.worldToLocal(localPoint);

        if (
          localPoint.x < -halfSize ||
          localPoint.x > halfSize ||
          localPoint.y < -halfSize ||
          localPoint.y > halfSize
        ) {
          return;
        }

        const geometry = chunk.geometry;
        const positionAttribute = geometry.attributes.position;
        const vertices = positionAttribute.array;
        const columns = GRID_RESOLUTION + 1;
        const u = THREE.MathUtils.clamp(localPoint.x / size + 0.5, 0, 1);
        const v = THREE.MathUtils.clamp(localPoint.y / size + 0.5, 0, 1);
        const gridX = u * GRID_RESOLUTION;
        const gridY = v * GRID_RESOLUTION;
        const x0 = Math.floor(gridX);
        const y0 = Math.floor(gridY);
        const x1 = Math.min(x0 + 1, GRID_RESOLUTION);
        const y1 = Math.min(y0 + 1, GRID_RESOLUTION);
        const tx = gridX - x0;
        const ty = gridY - y0;
        const sample = (x, y) => vertices[(y * columns + x) * 3 + 2] ?? 0;
        const h00 = sample(x0, y0);
        const h10 = sample(x1, y0);
        const h01 = sample(x0, y1);
        const h11 = sample(x1, y1);
        const h0 = THREE.MathUtils.lerp(h00, h10, tx);
        const h1 = THREE.MathUtils.lerp(h01, h11, tx);
        const centerBias =
          Math.min(halfSize - Math.abs(localPoint.x), halfSize - Math.abs(localPoint.y)) +
          0.001;

        if (centerBias > bestScore) {
          bestScore = centerBias;
          bestHeight = chunk.position.y + THREE.MathUtils.lerp(h0, h1, ty);
        }
      });

      return bestHeight;
    },
    [terrain]
  );

  const sampleTerrainFootprintHeight = useCallback(
    (position, movementDirection = null) => {
      if (!SCULPTABLE_TERRAINS.has(terrain)) return 0;

      const centerHeight = sampleTerrainHeight(position);
      let maxHeight = centerHeight;
      let forwardMaxHeight = centerHeight;
      let weightedHeight = centerHeight * 1.8;
      let totalWeight = 1.8;
      const radius = TERRAIN_FOOTPRINT_RADIUS;
      const diagonalRadius = radius * 0.72;
      const movingForward =
        movementDirection?.lengthSq && movementDirection.lengthSq() > 0.001;
      const samples = [
        [radius, 0, 0.72],
        [-radius, 0, 0.72],
        [0, radius, 0.72],
        [0, -radius, 0.72],
        [diagonalRadius, diagonalRadius, 0.42],
        [diagonalRadius, -diagonalRadius, 0.42],
        [-diagonalRadius, diagonalRadius, 0.42],
        [-diagonalRadius, -diagonalRadius, 0.42],
      ];

      if (movingForward) {
        const forwardX = movementDirection.x;
        const forwardZ = movementDirection.z;
        const rightX = forwardZ;
        const rightZ = -forwardX;
        const forwardReach = TERRAIN_FOOTPRINT_FORWARD_REACH;

        samples.push(
          [forwardX * forwardReach, forwardZ * forwardReach, 1.7, true],
          [
            forwardX * forwardReach + rightX * radius * 0.45,
            forwardZ * forwardReach + rightZ * radius * 0.45,
            1.05,
            true,
          ],
          [
            forwardX * forwardReach - rightX * radius * 0.45,
            forwardZ * forwardReach - rightZ * radius * 0.45,
            1.05,
            true,
          ]
        );
      }

      samples.forEach(([offsetX, offsetZ, weight, isForwardSample]) => {
        tempFootVector.set(
          position.x + offsetX,
          position.y,
          position.z + offsetZ
        );
        const sampleHeight = sampleTerrainHeight(tempFootVector);
        maxHeight = Math.max(maxHeight, sampleHeight);
        if (isForwardSample) {
          forwardMaxHeight = Math.max(forwardMaxHeight, sampleHeight);
        }
        weightedHeight += sampleHeight * weight;
        totalWeight += weight;
      });

      const averagedHeight = weightedHeight / totalWeight;
      const slopeGuardHeight = movingForward ? forwardMaxHeight : maxHeight;

      return Math.max(averagedHeight, slopeGuardHeight);
    },
    [sampleTerrainHeight, terrain]
  );

  const updateBrushCursor = useCallback(
    (point) => {
      if (!brushEnabled || !SCULPTABLE_TERRAINS.has(terrain)) {
        brushCursorRef.current.visible = false;
        return;
      }

      const terrainHeight = sampleTerrainHeight(point);
      const sampleOffset = Math.max(brushSize * 0.18, 1.2);
      const heightLeft = sampleTerrainHeight(
        tempToeVector.set(point.x - sampleOffset, point.y, point.z)
      );
      const heightRight = sampleTerrainHeight(
        tempToeVector.set(point.x + sampleOffset, point.y, point.z)
      );
      const heightBack = sampleTerrainHeight(
        tempToeVector.set(point.x, point.y, point.z - sampleOffset)
      );
      const heightFront = sampleTerrainHeight(
        tempToeVector.set(point.x, point.y, point.z + sampleOffset)
      );
      const slopeX = (heightRight - heightLeft) / (sampleOffset * 2);
      const slopeZ = (heightFront - heightBack) / (sampleOffset * 2);

      brushCursorRef.current.visible = true;
      brushCursorRef.current.position.set(point.x, terrainHeight + 0.012, point.z);
      brushCursorRef.current.normal.set(-slopeX, 1, -slopeZ).normalize();
    },
    [brushEnabled, brushSize, sampleTerrainHeight, terrain]
  );

  const hideBrushCursor = useCallback(() => {
    brushCursorRef.current.visible = false;
  }, []);

  useEffect(() => {
    if (!brushEnabled || !SCULPTABLE_TERRAINS.has(terrain)) {
      brushCursorRef.current.visible = false;
    }
  }, [brushEnabled, terrain]);

  const getSupportSurfaceY = useCallback(
    (position, movementDirection = null) => {
      const terrainHeight = sampleTerrainFootprintHeight(
        position,
        movementDirection
      );
      const support = findObjectUnderPoint(position, {
        sittableOnly: true,
        maxHeight: WALK_JUMP_PLATFORM_CLEARANCE,
        padding: {
          x: CHARACTER_COLLISION_RADIUS * 0.35,
          z: CHARACTER_COLLISION_RADIUS * 0.35,
        },
      });

      return support
        ? Math.max(terrainHeight, getPlacedObjectTopY(support))
        : terrainHeight;
    },
    [findObjectUnderPoint, sampleTerrainFootprintHeight]
  );

  const applyGroundAdhesion = useCallback(
    (position, targetY, frameDelta, immediate = false) => {
      if (!position || !Number.isFinite(targetY)) return;

      if (immediate) {
        position.y = targetY;
        return;
      }

      const difference = targetY - position.y;
      if (Math.abs(difference) < 0.012) {
        position.y = targetY;
        return;
      }

      const adhesionSpeed =
        difference > 0 ? TERRAIN_ADHESION_SPEED * 1.45 : TERRAIN_ADHESION_SPEED;
      const maxStep =
        TERRAIN_ADHESION_MAX_SPEED * (difference > 0 ? 1.55 : 1) * frameDelta;
      const easedStep = difference * (1 - Math.exp(-frameDelta * adhesionSpeed));

      position.y += THREE.MathUtils.clamp(easedStep, -maxStep, maxStep);
    },
    []
  );

  const findNearbySittableObject = useCallback(() => {
    const position = characterParentRef.current?.position;
    if (!position) return null;

    let nearest = null;
    let nearestDistance = Infinity;

    activePlacedObjects.forEach((placement) => {
      if (!SITTABLE_ASSET_KEYS.has(placement.assetKey)) return;

      const collider = placement.collider ?? NATURE_ASSETS[placement.assetKey]?.collider;
      const interactionRadius =
        Math.max(collider?.x ?? 2, collider?.z ?? 2) + SIT_INTERACTION_DISTANCE;
      const distance = Math.hypot(
        position.x - placement.position[0],
        position.z - placement.position[2]
      );

      if (distance <= interactionRadius && distance < nearestDistance) {
        nearest = placement;
        nearestDistance = distance;
      }
    });

    return nearest;
  }, [activePlacedObjects]);

  const standUpFromSeat = useCallback(() => {
    if (!isSittingRef.current) return;

    isSittingRef.current = false;
    smoothMovement.current.set(0, 0, 0);
    switchAnimation("idle", { fadeDuration: 0.18 });
  }, [smoothMovement, switchAnimation]);

  const tryToggleSitting = useCallback(() => {
    if (isSittingRef.current) {
      standUpFromSeat();
      return;
    }

    const sitTarget = findNearbySittableObject();
    const sitAction = actions.sittingLaughing;
    if (!sitTarget || !sitAction || oneShotActionRef.current) return;

    const position = characterParentRef.current?.position;
    if (!position) return;

    const awayFromObject = tempForwardVector.set(
      position.x - sitTarget.position[0],
      0,
      position.z - sitTarget.position[2]
    );
    if (awayFromObject.lengthSq() < 0.001) {
      awayFromObject
        .set(0, 0, -1)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), currentRotation.current);
    }
    awayFromObject.normalize();

    const collider = sitTarget.collider ?? NATURE_ASSETS[sitTarget.assetKey]?.collider;
    const seatDistance = Math.max(collider?.x ?? 2, collider?.z ?? 2) + SIT_EDGE_OFFSET;
    const seatX = sitTarget.position[0] + awayFromObject.x * seatDistance;
    const seatZ = sitTarget.position[2] + awayFromObject.z * seatDistance;

    tempCollisionPosition.set(seatX, position.y, seatZ);
    if (!collidesWithScene(tempCollisionPosition)) {
      position.x = seatX;
      position.z = seatZ;
    }

    currentRotation.current = Math.atan2(awayFromObject.x, awayFromObject.z);
    characterParentRef.current.rotation.y = currentRotation.current;
    smoothMovement.current.set(0, 0, 0);
    Object.keys(movement.current).forEach((key) => {
      movement.current[key] = false;
    });
    isSittingRef.current = true;
    switchAnimation("sittingLaughing", { fadeDuration: 0.18 });
  }, [
    actions.sittingLaughing,
    collidesWithScene,
    findNearbySittableObject,
    smoothMovement,
    standUpFromSeat,
    switchAnimation,
  ]);

  // Get chunks neighboring a specific position
  const getNeighboringChunks = useCallback((position, chunksRef) => {
    const maxRadius = Math.max(getMaxFootprintRadius(), brushSize);

    return chunksRef.current.filter((chunk) => {
      const distance = new THREE.Vector2(
        chunk.position.x - position.x,
        chunk.position.z - position.z
      ).length();
      return distance < CHUNK_SIZE + maxRadius;
    });
  }, [brushSize]);

  const sculptTerrain = useCallback(
    (point) => {
      if (!brushEnabled || !SCULPTABLE_TERRAINS.has(terrain)) return;

      const radius = Math.max(brushSize, 1);
      const direction = brushMode === "lower" ? -1 : 1;
      const strength = SCULPT_STEP_HEIGHT * direction;
      const neighboringChunks = getNeighboringChunks(point, chunksRef);
      const tempVertex = new THREE.Vector3();
      const localBrushPoint = new THREE.Vector3();
      const geometriesToUpdate = [];

      neighboringChunks.forEach((chunk) => {
        const geometry = chunk.geometry;
        if (!geometry?.attributes?.position) return;

        const positionAttribute = geometry.attributes.position;
        const vertices = positionAttribute.array;
        let hasDeformation = false;

        localBrushPoint.copy(point);
        chunk.worldToLocal(localBrushPoint);

        for (let i = 0; i < positionAttribute.count; i++) {
          tempVertex.fromArray(vertices, i * 3);

          const distance = Math.hypot(
            tempVertex.x - localBrushPoint.x,
            tempVertex.y - localBrushPoint.y
          );
          if (distance > radius) continue;

          const normalizedDistance = THREE.MathUtils.clamp(distance / radius, 0, 1);
          const falloff = 0.5 + 0.5 * Math.cos(normalizedDistance * Math.PI);
          const lowerDetail =
            0.98 +
            Math.sin(tempVertex.x * 0.21 + tempVertex.y * 0.17) * 0.018 +
            Math.sin(tempVertex.x * -0.13 + tempVertex.y * 0.29) * 0.012;
          const shapedFalloff =
            direction < 0
              ? Math.pow(falloff, 1.28) * lowerDetail
              : falloff;

          tempVertex.z += strength * shapedFalloff;
          tempVertex.toArray(vertices, i * 3);
          hasDeformation = true;
        }

        if (hasDeformation) {
          softenTerrainPatch(
            geometry,
            chunk,
            point,
            radius * 1.05,
            direction < 0 ? 0.075 : 0.12
          );
          positionAttribute.needsUpdate = true;
          geometriesToUpdate.push(geometry);
          saveChunkDeformation(chunk);
        }
      });

      geometriesToUpdate.forEach((geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      });
    },
    [
      brushEnabled,
      brushMode,
      brushSize,
      chunksRef,
      getNeighboringChunks,
      saveChunkDeformation,
      terrain,
    ]
  );

  // Keep visible meshes stable; only prune old saved deformations far away.
  const pruneDistantDeformations = (characterPosition) => {
    deformedChunksMapRef.current.forEach((_, chunkKey) => {
      const [chunkX, chunkZ] = chunkKey.split(",").map(Number);
      const worldX = chunkX * CHUNK_SIZE;
      const worldZ = chunkZ * CHUNK_SIZE;
      const distance = Math.hypot(
        worldX - characterPosition.x,
        worldZ - characterPosition.z
      );

      if (distance > CHUNK_UNLOAD_DISTANCE) {
        deformedChunksMapRef.current.delete(chunkKey);
      }
    });
  };

  const addWaterRipple = useCallback((point, time, direction, strength = 1) => {
    const rippleDirection =
      direction && direction.lengthSq && direction.lengthSq() > 0.001
        ? direction
        : tempForwardVector;
    ripplesRef.current.unshift({
      x: point.x,
      z: point.z,
      time,
      strength,
      dx: rippleDirection.x,
      dz: rippleDirection.z,
    });
    ripplesRef.current = ripplesRef.current.slice(0, MAX_RIPPLES);
  }, []);

  const addGrassContact = useCallback((point, time, direction, strength = 1) => {
    grassContactsRef.current = grassContactsRef.current.filter(
      (contact) => time - contact.time < 2.8
    );
    grassContactsRef.current.unshift({
      x: point.x,
      z: point.z,
      time,
      strength,
      dx: direction.x,
      dz: direction.y,
    });
    grassContactsRef.current = grassContactsRef.current.slice(
      0,
      MAX_GRASS_CONTACTS
    );
  }, []);

  // Function to deform terrain with an oriented foot-shaped imprint.
  const imprintFoot = useCallback(
    (mesh, point, forward) => {
      if (!mesh) return;
      if (terrainPreset.deformDepth <= 0) return;

      const neighboringChunks = getNeighboringChunks(point, chunksRef);
      const tempVertex = new THREE.Vector3();
      const geometriesToUpdate = [];
      const footprintForward = tempForwardVector
        .copy(forward)
        .setY(0)
        .normalize();
      const footprintRight = tempRightVector
        .set(footprintForward.z, 0, -footprintForward.x)
        .normalize();
      const footLength = terrainPreset.footprintLength;
      const footWidth = terrainPreset.footprintWidth;
      const rimStart = terrainPreset.rimStart ?? 1.02;
      const rimEnd = terrainPreset.rimEnd ?? 1.42;
      const rimInner = terrainPreset.rimInner ?? rimStart * 0.58;
      const imprintBlend = terrainPreset.imprintBlend ?? 0.64;
      const pressurePower = terrainPreset.pressurePower ?? 1;

      neighboringChunks.forEach((chunk) => {
        const geometry = chunk.geometry;
        if (!geometry || !geometry.attributes || !geometry.attributes.position)
          return;

        const positionAttribute = geometry.attributes.position;
        const vertices = positionAttribute.array;

        let hasDeformation = false;

        for (let i = 0; i < positionAttribute.count; i++) {
          tempVertex.fromArray(vertices, i * 3);
          chunk.localToWorld(tempVertex);

          const offsetX = tempVertex.x - point.x;
          const offsetZ = tempVertex.z - point.z;
          const lateral = offsetX * footprintRight.x + offsetZ * footprintRight.z;
          const longitudinal =
            offsetX * footprintForward.x + offsetZ * footprintForward.z;

          const heelCenter = -footLength * 0.28;
          const forefootCenter = footLength * 0.25;
          const midfootCenter = -footLength * 0.02;
          const heelDistance =
            (lateral * lateral) / Math.pow(footWidth * 0.45, 2) +
            Math.pow(longitudinal - heelCenter, 2) /
              Math.pow(footLength * 0.23, 2);
          const forefootDistance =
            (lateral * lateral) / Math.pow(footWidth * 0.58, 2) +
            Math.pow(longitudinal - forefootCenter, 2) /
              Math.pow(footLength * 0.31, 2);
          const midfootDistance =
            (lateral * lateral) / Math.pow(footWidth * 0.34, 2) +
            Math.pow(longitudinal - midfootCenter, 2) /
              Math.pow(footLength * 0.38, 2);
          const rawPressure =
            Math.max(
              smoothstep(1.28, 0.04, heelDistance) * 0.84,
              smoothstep(1.3, 0.04, forefootDistance),
              smoothstep(1.34, 0.1, midfootDistance) * 0.42
            );
          const pressure = Math.pow(rawPressure, pressurePower);
          const soleDistance = Math.min(
            heelDistance,
            forefootDistance,
            midfootDistance * 1.18
          );
          const rimPressure =
            smoothstep(rimEnd, rimStart, soleDistance) *
            (1 - smoothstep(rimStart, rimInner, soleDistance));

          if (pressure > 0.001 || rimPressure > 0.001) {
            const currentWorldY = tempVertex.y;

            if (pressure > 0.001) {
              const lateralFade =
                0.86 +
                0.14 *
                  Math.cos(
                    THREE.MathUtils.clamp(
                      lateral / Math.max(footWidth * 0.65, 0.001),
                      -1,
                      1
                    ) * Math.PI
                  );
              const terrainSlopeDelta = Math.abs(currentWorldY - point.y);
              const slopeDamping = 1 / (1 + terrainSlopeDelta * 0.34);
              const localDepth =
                terrainPreset.deformDepth *
                pressure *
                lateralFade *
                slopeDamping;
              const imprintDepth = THREE.MathUtils.clamp(
                localDepth * (0.68 + imprintBlend * 0.52),
                0,
                terrainPreset.deformDepth * 0.82
              );

              tempVertex.y = currentWorldY - imprintDepth;
            }

            if (rimPressure > 0.001) {
              const rimLift =
                terrainPreset.rimHeight *
                rimPressure *
                rimPressure *
                (0.52 + pressure * 0.16);

              tempVertex.y += rimLift;
            }

            const rippleNoise =
              terrainPreset.waveAmplitude *
              Math.sin(WAVE_FREQUENCY * (Math.abs(lateral) + Math.abs(longitudinal))) *
              (1 - pressure * 0.65);
            tempVertex.y += rippleNoise;

            chunk.worldToLocal(tempVertex);
            tempVertex.toArray(vertices, i * 3);
            hasDeformation = true;
          }
        }

        if (hasDeformation) {
          softenTerrainPatch(
            geometry,
            chunk,
            point,
            terrainPreset.smoothRadius ?? footLength,
            (terrainPreset.smoothIntensity ?? 0) * 0.38
          );
          positionAttribute.needsUpdate = true;
          geometriesToUpdate.push(geometry);
          saveChunkDeformation(chunk);
        }
      });

      if (geometriesToUpdate.length > 0) {
        geometriesToUpdate.forEach((geometry) => {
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
        });
      }
    },
    [getNeighboringChunks, chunksRef, saveChunkDeformation, terrainPreset]
  );

  const simulateFootContact = useCallback(
    (activeChunk, footBone, toeBone, side, time, isRunning) => {
      if (!activeChunk) return;

      if (footBone) {
        tempFootVector.setFromMatrixPosition(footBone.matrixWorld);

        if (toeBone) {
          tempToeVector.setFromMatrixPosition(toeBone.matrixWorld);
          tempForwardVector.subVectors(tempToeVector, tempFootVector);
          tempFootVector.lerp(tempToeVector, 0.42);
        } else {
          tempForwardVector
            .set(0, 0, -1)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), currentRotation.current);
        }
      } else {
        tempFootVector.copy(characterPositionRef.current);
        if (smoothMovement.current.lengthSq() > 0.02) {
          tempForwardVector.copy(smoothMovement.current);
        } else {
          tempForwardVector
            .set(0, 0, -1)
            .applyAxisAngle(
              new THREE.Vector3(0, 1, 0),
              currentRotation.current
            );
        }
      }

      tempForwardVector.y = 0;
      if (tempForwardVector.lengthSq() < 0.001) {
        tempForwardVector
          .set(0, 0, -1)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), currentRotation.current);
      }
      tempForwardVector.normalize();

      if (!footBone) {
        tempRightVector
          .set(tempForwardVector.z, 0, -tempForwardVector.x)
          .normalize();
        tempFootVector
          .addScaledVector(tempForwardVector, 0.55)
          .addScaledVector(tempRightVector, side === "left" ? -0.46 : 0.46);
      }

      tempFootVector.addScaledVector(
        tempForwardVector,
        terrainPreset.type === "imprint"
          ? (terrainPreset.footprintLength || 0) * 0.08
          : 0
      );
      tempFootVector.y =
        terrainPreset.type === "imprint"
          ? sampleTerrainHeight(tempFootVector)
          : activeChunk.position.y;

      const contactInterval =
        terrainPreset.type === "imprint"
          ? isRunning
            ? 0.24
            : 0.34
          : terrainPreset.type === "grass"
            ? isRunning
              ? 0.22
              : 0.32
          : isRunning
            ? 0.18
            : 0.28;
      if (time - lastContactTimeRef.current[side] < contactInterval) return;
      lastContactTimeRef.current[side] = time;

      if (terrainPreset.type === "water") {
        addWaterRipple(
          tempFootVector,
          time,
          tempForwardVector,
          isRunning ? 1.9 : 1.35
        );
        return;
      }

      if (terrainPreset.type === "grass") {
        if (smoothMovement.current.lengthSq() > 0.02) {
          tempGrassDirection
            .set(smoothMovement.current.x, smoothMovement.current.z)
            .normalize();
        } else {
          tempGrassDirection
            .set(tempForwardVector.x, tempForwardVector.z)
            .normalize();
        }

        addGrassContact(
          tempFootVector,
          time,
          tempGrassDirection,
          isRunning ? 1.25 : 0.95
        );
        return;
      }

      if (terrainPreset.type === "imprint") {
        imprintFoot(activeChunk, tempFootVector, tempForwardVector);
      }
    },
    [
      addGrassContact,
      addWaterRipple,
      imprintFoot,
      sampleTerrainHeight,
      terrainPreset,
      currentRotation,
      smoothMovement,
    ]
  );

  // Main animation loop
  useFrame((state, delta) => {
    const frameDelta = Math.min(Math.max(delta, 0), 1 / 30);
    updateChunkFades(frameDelta);

    if (!isCharacterAligned || !hasAlignedCharacterRef.current) {
      smoothMovement.current.set(0, 0, 0);
      return;
    }

    const isLongBowReady = longBowClips.length > 0;
    if (interactionRequestsRef.current.toggleSit) {
      interactionRequestsRef.current.toggleSit = false;
      tryToggleSitting();
    }

    let activeOneShot = oneShotActionRef.current;
    const speed = movement.current.running ? RUN_SPEED : WALK_SPEED;
    const direction = new THREE.Vector3();

    // Determine movement direction based on input
    if (movement.current.forward) direction.z -= 1;
    if (movement.current.backward) direction.z += 1;
    if (movement.current.left) direction.x -= 1;
    if (movement.current.right) direction.x += 1;

    direction.normalize();
    const turnInput =
      Number(movement.current.turnLeft) - Number(movement.current.turnRight);
    const hasMovementIntent = direction.lengthSq() > 0.001 || turnInput !== 0;

    if (isSittingRef.current) {
      if (hasMovementIntent) {
        standUpFromSeat();
      } else if (isLongBowReady && currentAnimationRef.current !== "sittingLaughing") {
        switchAnimation("sittingLaughing", { fadeDuration: 0.12 });
      }

      direction.set(0, 0, 0);
    }

    if (interactionRequestsRef.current.dodgeBack) {
      interactionRequestsRef.current.dodgeBack = false;

      if (
        isLongBowReady &&
        !isSittingRef.current &&
        !activeOneShot
      ) {
        const dodgeRotation =
          interactionRequestsRef.current.dodgeRotation ?? currentRotation.current;
        const backX = -Math.sin(dodgeRotation) * DODGE_BACK_DISTANCE;
        const backZ = -Math.cos(dodgeRotation) * DODGE_BACK_DISTANCE;

        currentRotation.current = dodgeRotation;
        if (characterParentRef.current) {
          characterParentRef.current.rotation.y = dodgeRotation;
        }
        movement.current.backward = false;
        smoothMovement.current.set(0, 0, 0);
        direction.set(0, 0, 0);
        if (startOneShotAnimation("dodgeBack", 0, { moveX: backX, moveZ: backZ })) {
          activeOneShot = oneShotActionRef.current;
        }
      }
    }

    if (interactionRequestsRef.current.jump) {
      interactionRequestsRef.current.jump = false;

      if (isLongBowReady && !isSittingRef.current && !activeOneShot) {
        const hasMoveDirection = direction.lengthSq() > 0.001;
        const isRunJump = movement.current.running && hasMoveDirection;
        const jumpDirection = tempForwardVector;
        let jumpDistance = 0;
        let landingTarget = null;
        let landingY = null;
        const characterPosition = characterParentRef.current?.position;
        const baseY = characterPosition ? getSupportSurfaceY(characterPosition) : 0;
        const takeoffSupport =
          characterPosition && baseY > 0.05
            ? findObjectUnderPoint(characterPosition, {
                sittableOnly: true,
                maxHeight: WALK_JUMP_PLATFORM_CLEARANCE,
                padding: {
                  x: CHARACTER_COLLISION_RADIUS * 0.25,
                  z: CHARACTER_COLLISION_RADIUS * 0.25,
                },
              })
            : null;

        if (hasMoveDirection) {
          jumpDirection.copy(direction).normalize();
          jumpDistance = isRunJump ? RUN_JUMP_DISTANCE : WALK_JUMP_DISTANCE;
          currentRotation.current = Math.atan2(jumpDirection.x, jumpDirection.z);
          if (characterParentRef.current) {
            characterParentRef.current.rotation.y = currentRotation.current;
          }
        } else {
          jumpDirection
            .set(0, 0, -1)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), currentRotation.current);
        }

        if (hasMoveDirection && characterParentRef.current) {
          const predictedLanding = tempCollisionPosition.set(
            characterParentRef.current.position.x + jumpDirection.x * jumpDistance,
            baseY,
            characterParentRef.current.position.z + jumpDirection.z * jumpDistance
          );
          if (!isRunJump) {
            landingTarget = findObjectUnderPoint(predictedLanding, {
              sittableOnly: true,
              maxHeight: WALK_JUMP_PLATFORM_CLEARANCE,
              padding: {
                x: CHARACTER_COLLISION_RADIUS * 0.15,
                z: CHARACTER_COLLISION_RADIUS * 0.15,
              },
            });
          }
          if (landingTarget) {
            landingY = getPlacedObjectTopY(landingTarget);
          } else if (takeoffSupport) {
            landingY = sampleTerrainFootprintHeight(predictedLanding);
          } else {
            const landingTerrainY = sampleTerrainFootprintHeight(predictedLanding);
            landingY =
              Math.abs(landingTerrainY - baseY) > 0.05 ? landingTerrainY : null;
          }
        }

        if (!hasMoveDirection && takeoffSupport) {
          landingY = sampleTerrainFootprintHeight(characterParentRef.current.position);
        }
        if (characterParentRef.current && Number.isFinite(landingY)) {
          characterParentRef.current.position.y = baseY;
        }
        const landingIsDrop =
          Number.isFinite(landingY) && landingY < baseY - PLATFORM_COLLISION_MARGIN;
        const ignoredJumpColliderId =
          landingTarget?.id ?? (landingIsDrop ? takeoffSupport?.id : null);
        const liftHeight = Number.isFinite(landingY)
          ? isRunJump
            ? RUN_JUMP_LIFT_HEIGHT
            : Math.max(WALK_JUMP_LIFT_HEIGHT, Math.abs(landingY - baseY) + 1.1)
          : 0;

        smoothMovement.current.set(0, 0, 0);
        direction.set(0, 0, 0);

        if (
          startOneShotAnimation(isRunJump ? "runJump" : "jump", 0, {
            moveX: jumpDirection.x * jumpDistance,
            moveZ: jumpDirection.z * jumpDistance,
            moveStart: isRunJump ? RUN_JUMP_MOVE_START : JUMP_MOVE_START,
            moveEnd: isRunJump ? RUN_JUMP_MOVE_END : JUMP_MOVE_END,
            liftHeight,
            baseY,
            liftStart: isRunJump ? RUN_JUMP_LIFT_START : JUMP_LIFT_START,
            liftEnd: isRunJump
              ? RUN_JUMP_LIFT_END
              : Number.isFinite(landingY)
                ? PLATFORM_JUMP_LIFT_END
                : JUMP_LIFT_END,
            landingY,
            landingIsDrop,
            landingLockY: Number.isFinite(landingY) ? landingY : null,
            landingLockAt: Number.isFinite(landingY)
              ? landingIsDrop
                ? DROP_LANDING_END
                : PLATFORM_LANDING_END
              : null,
            clearanceHeight: isRunJump
              ? RUN_JUMP_CLEARANCE_HEIGHT
              : Number.isFinite(landingY)
                ? WALK_JUMP_PLATFORM_CLEARANCE
                : null,
            ignorePlacementId: ignoredJumpColliderId,
            crouchDepth: isRunJump ? 0 : JUMP_CROUCH_DEPTH,
            crouchStart: JUMP_CROUCH_START,
            crouchEnd: JUMP_CROUCH_END,
            blendOutAt:
              isRunJump && Math.abs((landingY ?? baseY) - baseY) < 0.05
                ? 0.72
                : landingIsDrop
                  ? 0.88
                  : Number.isFinite(landingY)
                    ? 0.9
                    : isRunJump
                      ? 0.72
                      : 0.8,
            blendOutFadeDuration:
              !isRunJump && !Number.isFinite(landingY)
                ? 0.16
                : Number.isFinite(landingY)
                  ? 0.18
                  : 0.16,
            blendOutTo: isRunJump
              ? "runForward"
              : hasMoveDirection
                ? getDirectionalAnimationName(jumpDirection, false)
                : "idle",
          })
        ) {
          activeOneShot = oneShotActionRef.current;
        }
      }
    }

    // Apply smoothing to the movement
    smoothMovement.current.lerp(
      activeOneShot || isSittingRef.current ? zeroVector : direction,
      1 - Math.exp(-frameDelta * 5)
    );
    if (smoothMovement.current.lengthSq() > 0.02) {
      grassBrushDirectionRef.current
        .set(smoothMovement.current.x, smoothMovement.current.z)
        .normalize();
    }

    const isCurrentlyMoving =
      !isSittingRef.current && !activeOneShot && smoothMovement.current.lengthSq() > 0.01;
    const isTurningInPlace =
      !isSittingRef.current && !activeOneShot && !isCurrentlyMoving && turnInput !== 0;
    const movementAnimationName = isLongBowReady
      ? getDirectionalAnimationName(
          smoothMovement.current,
          movement.current.running
        )
      : null;

    if (
      isLongBowReady &&
      !activeOneShot &&
      !isCurrentlyMoving &&
      previousMovementAnimationRef.current === "runForward"
    ) {
      if (startOneShotAnimation("runForwardStop")) {
        previousMovementAnimationRef.current = null;
      }
    }

    if (oneShotActionRef.current) {
      const oneShot = oneShotActionRef.current;
      const previousProgress = Math.min(oneShot.elapsed / oneShot.duration, 1);
      oneShot.elapsed += frameDelta;
      const nextProgress = Math.min(oneShot.elapsed / oneShot.duration, 1);

      const oneShotCollisionOptions = {
        clearanceHeight: oneShot.clearanceHeight,
        ignorePlacementId: oneShot.ignorePlacementId,
      };

      if (characterParentRef.current && (oneShot.moveX !== 0 || oneShot.moveZ !== 0)) {
        const previousMoveProgress = THREE.MathUtils.clamp(
          (previousProgress - oneShot.moveStart) / (oneShot.moveEnd - oneShot.moveStart),
          0,
          1
        );
        const nextMoveProgress = THREE.MathUtils.clamp(
          (nextProgress - oneShot.moveStart) / (oneShot.moveEnd - oneShot.moveStart),
          0,
          1
        );
        const previousEase = THREE.MathUtils.smoothstep(previousMoveProgress, 0, 1);
        const nextEase = THREE.MathUtils.smoothstep(nextMoveProgress, 0, 1);
        const deltaX = oneShot.moveX * (nextEase - previousEase);
        const deltaZ = oneShot.moveZ * (nextEase - previousEase);
        const position = characterParentRef.current.position;

        tempCollisionPosition.set(position.x + deltaX, position.y, position.z);
        if (!collidesWithScene(tempCollisionPosition, oneShotCollisionOptions)) {
          position.x += deltaX;
          oneShot.movedX += deltaX;
        }

        tempCollisionPosition.set(position.x, position.y, position.z + deltaZ);
        if (!collidesWithScene(tempCollisionPosition, oneShotCollisionOptions)) {
          position.z += deltaZ;
          oneShot.movedZ += deltaZ;
        }

        if (!Number.isFinite(oneShot.landingY) && oneShot.liftHeight <= 0) {
          applyGroundAdhesion(position, getSupportSurfaceY(position), frameDelta);
        }
      }

      if (characterParentRef.current && oneShot.liftHeight > 0) {
        let lift = 0;
        let landingOffset = 0;

        if (oneShot.crouchDepth > 0 && nextProgress < oneShot.liftStart) {
          const crouchProgress = THREE.MathUtils.clamp(
            (nextProgress - oneShot.crouchStart) /
              (oneShot.crouchEnd - oneShot.crouchStart),
            0,
            1
          );
          lift = -Math.sin(crouchProgress * Math.PI) * oneShot.crouchDepth;
        }

        const liftProgress = THREE.MathUtils.clamp(
          (nextProgress - oneShot.liftStart) / (oneShot.liftEnd - oneShot.liftStart),
          0,
          1
        );
        if (liftProgress > 0) {
          lift = Math.sin(liftProgress * Math.PI) * oneShot.liftHeight;
        }

        if (Number.isFinite(oneShot.landingY)) {
          const landingStart = oneShot.landingIsDrop
            ? DROP_LANDING_START
            : PLATFORM_LANDING_START;
          const landingDuration = oneShot.landingIsDrop
            ? DROP_LANDING_END - DROP_LANDING_START
            : PLATFORM_LANDING_END - PLATFORM_LANDING_START;
          const landingProgress = THREE.MathUtils.smoothstep(
            THREE.MathUtils.clamp(
              (nextProgress - landingStart) / landingDuration,
              0,
              1
            ),
            0,
            1
          );
          landingOffset = (oneShot.landingY - oneShot.baseY) * landingProgress;
        }

        const nextY = oneShot.baseY + landingOffset + lift;
        const landingLocked =
          Number.isFinite(oneShot.landingLockY) &&
          Number.isFinite(oneShot.landingLockAt) &&
          nextProgress >= oneShot.landingLockAt;
        const hipsOffset =
          landingLocked && !oneShot.landingIsDrop && hipsBoneRef.current
            ? (hipsBoneRef.current.position.y - hipsBaseYRef.current) *
              CHARACTER_SCALE
            : 0;

        characterParentRef.current.position.y = landingLocked
          ? oneShot.landingLockY - hipsOffset
          : nextY;
      }

      if (oneShot.rotationDelta !== 0) {
        const rotationProgress = Math.min(oneShot.elapsed / oneShot.duration, 1);
        currentRotation.current =
          oneShot.rotationStart + oneShot.rotationDelta * rotationProgress;
      }

      if (
        oneShot.blendOutTo &&
        !oneShot.hasBlendedOut &&
        nextProgress >= oneShot.blendOutAt
      ) {
        oneShot.hasBlendedOut = true;
        if (characterParentRef.current && oneShot.liftHeight > 0) {
          characterParentRef.current.position.y = Number.isFinite(oneShot.landingY)
            ? oneShot.landingY
            : Number.isFinite(oneShot.landingLockY)
              ? oneShot.landingLockY
              : oneShot.baseY;
        }
        oneShotActionRef.current = null;
        activeOneShot = null;
        switchAnimation(oneShot.blendOutTo, {
          fadeDuration: oneShot.blendOutFadeDuration,
        });
      }

      if (oneShotActionRef.current && oneShot.elapsed >= oneShot.duration) {
        currentRotation.current =
          oneShot.rotationStart + oneShot.rotationDelta;
        if (characterParentRef.current && oneShot.liftHeight > 0) {
          characterParentRef.current.position.y = Number.isFinite(oneShot.landingY)
            ? oneShot.landingY
            : Number.isFinite(oneShot.landingLockY)
              ? oneShot.landingLockY
              : oneShot.baseY;
        }
        oneShotActionRef.current = null;
      }
    }

    // Handle movement state
    if (isCurrentlyMoving) {
      lastMovementTime.current = state.clock.elapsedTime;
      isMovingRef.current = true;
    } else {
      if (state.clock.elapsedTime - lastMovementTime.current > 1) {
        isMovingRef.current = false;
      }
    }

    // Update animation based on movement
    if (!oneShotActionRef.current && isLongBowReady && !isSittingRef.current) {
      const nextAnimation = movementAnimationName || "idle";

      switchAnimation(nextAnimation);
    }

    if (movementAnimationName) {
      previousMovementAnimationRef.current = movementAnimationName;
    } else if (!isCurrentlyMoving && !oneShotActionRef.current) {
      previousMovementAnimationRef.current = null;
    }

    // Update character position and rotation
    if (characterParentRef.current) {
      if (isCurrentlyMoving) {
        const movementStep = speed * frameDelta;

        const position = characterParentRef.current.position;
        const nextX = position.x + smoothMovement.current.x * movementStep;
        const nextZ = position.z + smoothMovement.current.z * movementStep;

        tempCollisionPosition.set(nextX, position.y, position.z);
        if (!collidesWithScene(tempCollisionPosition)) {
          position.x = nextX;
        }

        tempCollisionPosition.set(position.x, position.y, nextZ);
        if (!collidesWithScene(tempCollisionPosition)) {
          position.z = nextZ;
        }

        const targetRotation = Math.atan2(
          smoothMovement.current.x,
          smoothMovement.current.z
        );
        currentRotation.current = lerpAngle(
          currentRotation.current,
          targetRotation,
          frameDelta * 4
        );
      } else if (isTurningInPlace) {
        currentRotation.current += turnInput * TURN_SPEED * frameDelta;
      }

      if (!oneShotActionRef.current && !isSittingRef.current) {
        const supportY = getSupportSurfaceY(
          characterParentRef.current.position,
          isCurrentlyMoving ? smoothMovement.current : null
        );
        applyGroundAdhesion(
          characterParentRef.current.position,
          supportY,
          frameDelta,
          !isCurrentlyMoving
        );
      }

      characterParentRef.current.rotation.y = currentRotation.current;

      characterParentRef.current.getWorldPosition(characterPosition);
      characterPositionRef.current.copy(characterPosition);

      cameraTargetRef.current.copy(characterPosition);
      cameraPositionRef.current.copy(characterPosition).add(cameraOffset);

      if (!hasInitializedCameraRef.current) {
        camera.position.copy(cameraPositionRef.current);
        hasInitializedCameraRef.current = true;
      } else {
        const cameraFollow = 1 - Math.exp(-frameDelta * 8);
        camera.position.lerp(cameraPositionRef.current, cameraFollow);
      }

      camera.lookAt(
        cameraTargetRef.current.x,
        cameraTargetRef.current.y + 7,
        cameraTargetRef.current.z
      );

      // Handle chunk positioning and deformation when moving
      if (isCurrentlyMoving) {
        const { x: charX, z: charZ } = characterParentRef.current.position;
        const originX = Math.round(charX / CHUNK_SIZE) * CHUNK_SIZE;
        const originZ = Math.round(charZ / CHUNK_SIZE) * CHUNK_SIZE;
        const currentOrigin = currentChunkOriginRef.current;

        if (currentOrigin.x !== originX || currentOrigin.z !== originZ) {
          currentChunkOriginRef.current = { x: originX, z: originZ };
          enqueueChunkUpdates(originX, originZ, characterPosition);
        }

        processPendingChunkUpdates();

        // Determine the active chunk based on character's position
        const activeChunkIndex = chunksRef.current.findIndex((chunk) => {
          const chunkMinX = chunk.position.x - CHUNK_SIZE / 2;
          const chunkMaxX = chunk.position.x + CHUNK_SIZE / 2;
          const chunkMinZ = chunk.position.z - CHUNK_SIZE / 2;
          const chunkMaxZ = chunk.position.z + CHUNK_SIZE / 2;

          return (
            charX >= chunkMinX &&
            charX < chunkMaxX &&
            charZ >= chunkMinZ &&
            charZ < chunkMaxZ
          );
        });

        if (activeChunkIndex !== -1) {
          const activeChunk = chunksRef.current[activeChunkIndex];
          lastActiveChunkRef.current = activeChunk;

          // Get character's foot positions for deformation
          const leftFootBone = getCharacterBone(
            characterRef.current,
            "mixamorigLeftFoot"
          );
          const leftToeBone = getCharacterBone(
            characterRef.current,
            "mixamorigLeftToeBase"
          );
          const rightFootBone = getCharacterBone(
            characterRef.current,
            "mixamorigRightFoot"
          );
          const rightToeBone = getCharacterBone(
            characterRef.current,
            "mixamorigRightToeBase"
          );

          simulateFootContact(
            activeChunk,
            leftFootBone,
            leftToeBone,
            "left",
            state.clock.elapsedTime,
            movement.current.running
          );

          simulateFootContact(
            activeChunk,
            rightFootBone,
            rightToeBone,
            "right",
            state.clock.elapsedTime,
            movement.current.running
          );

          if (
            terrainPreset.type === "grass" &&
            state.clock.elapsedTime - lastContactTimeRef.current.body > 0.12
          ) {
            lastContactTimeRef.current.body = state.clock.elapsedTime;
            tempGrassDirection
              .set(smoothMovement.current.x, smoothMovement.current.z)
              .normalize();
            tempFootVector
              .copy(characterPosition)
              .addScaledVector(smoothMovement.current, 1.35);
            addGrassContact(
              tempFootVector,
              state.clock.elapsedTime,
              tempGrassDirection,
              movement.current.running ? 1.05 : 0.82
            );
          }
        }

        pruneDistantDeformations(characterPosition);
      }
    }
  });

  return (
    <>
      {snowChunks.map((chunk, index) => (
        <mesh
          key={`${chunk.x}-${chunk.z}`}
          visible={terrainPreset.type !== "water" && terrainPreset.type !== "backroom"}
          ref={(el) => {
            if (el) {
              chunksRef.current[index] = el;
              // Save the original position of the chunk for resetting deformations
              if (!el.geometry.userData.originalPosition) {
                el.geometry.userData.originalPosition =
                  el.geometry.attributes.position.array.slice();
              }
            }
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[chunk.x * CHUNK_SIZE, 0, chunk.z * CHUNK_SIZE]}
          onPointerDown={(event) => {
            if (!brushEnabled || !SCULPTABLE_TERRAINS.has(terrain)) return;
            event.stopPropagation();
            updateBrushCursor(event.point);
            sculptPaintingRef.current = true;
            sculptTerrain(event.point);
          }}
          onPointerMove={(event) => {
            if (!brushEnabled || !SCULPTABLE_TERRAINS.has(terrain)) return;
            event.stopPropagation();
            updateBrushCursor(event.point);
            if (sculptPaintingRef.current) {
              sculptTerrain(event.point);
            }
          }}
          onPointerUp={(event) => {
            if (!brushEnabled) return;
            event.stopPropagation();
            sculptPaintingRef.current = false;
          }}
          onPointerLeave={() => {
            sculptPaintingRef.current = false;
          }}
          receiveShadow
        >
          <planeGeometry
            args={[
              CHUNK_SIZE + CHUNK_OVERLAP * 2,
              CHUNK_SIZE + CHUNK_OVERLAP * 2,
              GRID_RESOLUTION,
              GRID_RESOLUTION,
            ]}
          />
          <TerrainChunkMaterial
            terrain={terrain}
            terrainPreset={terrainPreset}
            terrainMap={terrainMap}
            terrainNormalMap={terrainNormalMap}
            terrainRoughnessMap={terrainRoughnessMap}
            terrainAoMap={terrainAoMap}
            brushCursorRef={brushCursorRef}
            brushEnabled={brushEnabled}
            brushSize={brushSize}
          />
        </mesh>
      ))}

      <DistantTerrainPlane
        terrain={terrain}
        terrainPreset={terrainPreset}
        terrainMap={terrainMap}
        terrainNormalMap={terrainNormalMap}
        terrainRoughnessMap={terrainRoughnessMap}
        terrainAoMap={terrainAoMap}
        characterPositionRef={characterPositionRef}
      />

      <GrassLayer
        chunks={snowChunks}
        visible={terrainPreset.type === "grass"}
        chunksRef={chunksRef}
        characterPositionRef={characterPositionRef}
        grassBrushDirectionRef={grassBrushDirectionRef}
        grassContactsRef={grassContactsRef}
        preset={terrainPreset}
      />

      <WaterSurface
        visible={terrainPreset.type === "water"}
        ripplesRef={ripplesRef}
        characterPositionRef={characterPositionRef}
        preset={terrainPreset}
      />

      <WaterBackdrop
        visible={terrainPreset.type === "water"}
        characterPositionRef={characterPositionRef}
        preset={terrainPreset}
      />

      <BackroomEnvironment
        visible={terrainPreset.type === "backroom"}
        characterPositionRef={characterPositionRef}
        preset={terrainPreset}
      />

      <PlacedObjectLayer
        placedObjects={activePlacedObjects}
        objectEditMode={objectEditMode}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
      />

      <PlacementPlane
        terrain={terrain}
        selectedAssetKey={objectEditMode || brushEnabled ? null : selectedAssetKey}
        placedObjects={activePlacedObjects}
        characterPositionRef={characterPositionRef}
        onPlaceObject={onPlaceObject}
      />

      <SculptPlane
        visible={brushEnabled && SCULPTABLE_TERRAINS.has(terrain)}
        characterPositionRef={characterPositionRef}
        onPointerPreview={updateBrushCursor}
        onPointerExit={hideBrushCursor}
        onSculpt={sculptTerrain}
      />

      {terrain === "water" && (
        <CharacterContactShadow
          terrain={terrain}
          characterPositionRef={characterPositionRef}
          rotationRef={currentRotation}
        />
      )}

      <group ref={characterParentRef} visible={isCharacterAligned}>
        <primitive ref={characterRef} object={scene} />
      </group>
    </>
  );
};

export default InfiniteSnowWorld;
