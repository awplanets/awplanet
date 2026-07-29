import { NATURE_ASSETS } from "../../../data/natureAssets";
import {
  QUATERNIUS_ASSETS,
  getQuaterniusAssetUrl,
  getQuaterniusMaterialUrl,
} from "../../../data/quaterniusAssets";

export const TERRAIN_LIBRARY = {
  blank: {
    label: "Blank",
    color: "#707070",
    floorColor: "#707070",
    fog: "#696969",
    roughness: 0.86,
    relief: 0,
    density: 0,
  },
  snow: {
    label: "Snow",
    color: "#edf4f8",
    fog: "#eaf1f4",
    roughness: 0.92,
    relief: 0.65,
    density: 0.2,
  },
  sand: {
    label: "Sand",
    color: "#cdb36e",
    fog: "#c7ad73",
    roughness: 0.86,
    relief: 0.28,
    density: 0.15,
  },
  grass: {
    label: "Grass",
    color: "#436f35",
    fog: "#748a68",
    roughness: 0.91,
    relief: 0.34,
    density: 0.96,
    grassHeight: 1.18,
    wind: 1.08,
    colorVariation: 0.92,
  },
  water: {
    label: "Water",
    color: "#4f8fa3",
    fog: "#87bdca",
    roughness: 0.18,
    relief: 0.12,
    density: 0.05,
  },
};

const ALL_WORLD_MATERIALS = [
  "blank",
  "snow",
  "sand",
  "grass",
  "water",
];

export const BASIC_PRIMITIVE_ASSET_KEYS = [
  "primitiveCube",
  "primitiveSphere",
  "primitiveCylinder",
  "primitiveCone",
  "primitivePlane",
  "primitiveTorus",
];

const BASIC_PRIMITIVE_ASSETS = {
  primitiveCube: {
    label: "Cube",
    primitive: "box",
    scale: [1, 1, 1],
    yOffset: 1,
    collider: { x: 2, z: 2, height: 2 },
  },
  primitiveSphere: {
    label: "Sphere",
    primitive: "sphere",
    scale: [1, 1, 1],
    yOffset: 1,
    collider: { radius: 1, height: 2 },
  },
  primitiveCylinder: {
    label: "Cylinder",
    primitive: "cylinder",
    scale: [1, 1, 1],
    yOffset: 1,
    collider: { radius: 1, height: 2 },
  },
  primitiveCone: {
    label: "Cone",
    primitive: "cone",
    scale: [1, 1, 1],
    yOffset: 1,
    collider: { radius: 1, height: 2 },
  },
  primitivePlane: {
    label: "Plane",
    primitive: "plane",
    scale: [1, 1, 1],
    yOffset: 0.025,
    collider: null,
    collisionEnabled: false,
  },
  primitiveTorus: {
    label: "Torus",
    primitive: "torus",
    scale: [1, 1, 1],
    yOffset: 1.35,
    collider: { radius: 1.32, height: 2.64 },
  },
};

const createBasicPrimitiveAssetDefinition = ([assetKey, asset]) => [
  assetKey,
  {
    ...asset,
    assetKey,
    type: "primitive",
    category: "basic",
    color: "#8d949b",
    terrains: ALL_WORLD_MATERIALS,
    collisionEnabled:
      asset.collisionEnabled ?? Boolean(asset.collider),
  },
];

const UPLOADED_HERO_CHARACTER = {
  label: "Hero",
  type: "character",
  primitive: "character",
  modelUrl: "/animations/uploaded/Standing%20Idle.fbx",
  animationSet: {
    idle: "/animations/uploaded/Standing%20Idle.fbx",
    walk: "/animations/uploaded/Standard%20Walk.fbx",
    walkForward: "/animations/uploaded/Standard%20Walk.fbx",
    walkBack: "/animations/uploaded/Standard%20Walk.fbx",
    walkLeft: "/animations/uploaded/Standard%20Walk.fbx",
    walkRight: "/animations/uploaded/Standard%20Walk.fbx",
    run: "/animations/uploaded/Running.fbx",
    runForward: "/animations/uploaded/Running.fbx",
    runBack: "/animations/new-model/standing%20run%20back.fbx",
    runLeft: "/animations/new-model/standing%20run%20left.fbx",
    runRight: "/animations/new-model/standing%20run%20right.fbx",
    jump: "/animations/new-model/Jumping.fbx",
    runningJump: "/animations/new-model/running%20Jump.fbx",
    sitLaugh: "/animations/new-model/Sitting%20Laughing.fbx",
    dodgeBack: "/animations/new-model/Standing%20Dodge%20Backward.fbx",
    turnLeft: "/animations/new-model/standing%20turn%2090%20left.fbx",
    turnRight: "/animations/new-model/standing%20turn%2090%20right.fbx",
    runStop: "/animations/new-model/standing%20run%20forward%20stop.fbx",
  },
  targetHeight: 6.8,
  collider: { radius: 0.55, height: 2.1 },
  collisionEnabled: true,
  color: "#173345",
};

const hasBlockingScale = (asset) => {
  const collider = asset.collider;
  if (!collider) return false;
  return Math.max(collider.x ?? 0, collider.z ?? 0, collider.radius ?? 0, collider.height ?? 0) >= 2;
};

const createNatureAssetDefinition = ([key, asset]) => [
  key,
  {
    ...asset,
    label: asset.label,
    type: asset.foliage ? "foliage" : "prop",
    primitive: "gltf",
    assetKey: key,
    color: asset.foliage ? "#315f35" : "#7b7467",
    scale: [asset.scale, asset.scale, asset.scale],
    collider: asset.collider,
    collisionEnabled: asset.collisionEnabled ?? (!asset.foliage && hasBlockingScale(asset)),
  },
];

const createQuaterniusAssetDefinition = ([key, asset]) => {
  const scale = Array.isArray(asset.scale)
    ? asset.scale
    : [asset.scale ?? 1, asset.scale ?? 1, asset.scale ?? 1];
  const format = asset.format ?? "obj";

  return [
    key,
    {
      ...asset,
      type: asset.type ?? (asset.category === "terrain" ? "terrain-prop" : "prop"),
      primitive: format === "gltf" ? "gltf" : "obj",
      format,
      assetKey: key,
      url: getQuaterniusAssetUrl(asset),
      mtlUrl: getQuaterniusMaterialUrl(asset),
      color: asset.color ?? "#8f8a78",
      scale,
      collisionEnabled:
        asset.collisionEnabled ?? hasBlockingScale({ ...asset, collider: asset.collider }),
    },
  ];
};

export const ENTITY_LIBRARY = {
  ...Object.fromEntries(
    Object.entries(BASIC_PRIMITIVE_ASSETS).map(
      createBasicPrimitiveAssetDefinition
    )
  ),
  ...Object.fromEntries(Object.entries(NATURE_ASSETS).map(createNatureAssetDefinition)),
  ...Object.fromEntries(
    Object.entries(QUATERNIUS_ASSETS).map(createQuaterniusAssetDefinition)
  ),
  boulder: {
    ...NATURE_ASSETS.boulder,
    label: NATURE_ASSETS.boulder.label,
    type: "prop",
    primitive: "gltf",
    assetKey: "boulder",
    color: "#7b7467",
    scale: [
      NATURE_ASSETS.boulder.scale,
      NATURE_ASSETS.boulder.scale,
      NATURE_ASSETS.boulder.scale,
    ],
    collider: NATURE_ASSETS.boulder.collider,
    collisionEnabled: true,
  },
  shrub: {
    ...NATURE_ASSETS.shrub,
    label: NATURE_ASSETS.shrub.label,
    type: "foliage",
    primitive: "gltf",
    assetKey: "shrub",
    color: "#315f35",
    scale: [
      NATURE_ASSETS.shrub.scale,
      NATURE_ASSETS.shrub.scale,
      NATURE_ASSETS.shrub.scale,
    ],
    collider: NATURE_ASSETS.shrub.collider,
    collisionEnabled: false,
  },
  marker: {
    label: "Marker",
    type: "logic",
    primitive: "marker",
    color: "#9bd4c8",
    scale: [0.7, 0.7, 0.7],
    collider: { radius: 0.35, height: 0.7 },
    collisionEnabled: false,
  },
  characterHero: {
    ...UPLOADED_HERO_CHARACTER,
    label: "Hero Character",
    assetKey: "characterHero",
    terrains: ALL_WORLD_MATERIALS,
    category: "character",
    color: "#173345",
    scale: [1, 1, 1],
  },
};

export const CHARACTER_LIBRARY = {
  uploadedHero: {
    ...UPLOADED_HERO_CHARACTER,
    id: "hero",
  },
};

export const getEntityAsset = (assetKey) =>
  ENTITY_LIBRARY[assetKey] ?? ENTITY_LIBRARY.marker;

export const getEntityAssetUrl = (asset) => {
  if (!asset) return null;
  if (asset.url) return asset.url;
  if (asset.file) return `/models/nature/polyhaven/${asset.file}`;
  return null;
};
