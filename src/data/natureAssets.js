export const NATURE_ASSET_BASE = "/models/nature/polyhaven/";

export const NATURE_ASSETS = {
  boulder: {
    label: "Weathered Boulder",
    file: "boulder_01/boulder_01_1k.gltf",
    scale: 5.4,
    terrains: ["snow", "grass"],
    yOffset: 0.42,
    collider: { x: 5.2, z: 4.2, height: 5.4 },
  },
  desertBoulder: {
    label: "Desert Boulder",
    file: "namaqualand_boulder_03/namaqualand_boulder_03_1k.gltf",
    scale: 3.6,
    terrains: ["sand"],
    yOffset: 0.08,
    collider: { x: 5.6, z: 4.6, height: 5.3 },
  },
  mossRockSet: {
    label: "Moss Rock Set",
    file: "rock_moss_set_01/rock_moss_set_01_1k.gltf",
    scale: 2.45,
    terrains: ["grass", "snow"],
    yOffset: 1.68,
    collider: { x: 5.8, z: 4.2, height: 4.3 },
  },
  looseStone: {
    label: "Loose Stone",
    file: "stone_01/stone_01_1k.gltf",
    scale: 18,
    terrains: ["snow", "grass"],
    yOffset: 0.3,
    collider: { x: 1.7, z: 1.4, height: 0.9 },
  },
  desertStones: {
    label: "Desert Stones",
    file: "namaqualand_stones_01/namaqualand_stones_01_1k.gltf",
    scale: 10,
    terrains: ["sand", "water"],
    yOffset: 0.04,
    collider: { x: 4.4, z: 2.0, height: 0.75 },
    floatsOnWater: true,
  },
  treeStump: {
    label: "Tree Stump",
    file: "tree_stump_01/tree_stump_01_1k.gltf",
    scale: 5.6,
    terrains: ["grass", "snow"],
    yOffset: 1.1,
    collider: { x: 4.8, z: 4.2, height: 3.2 },
  },
  fallenTrunk: {
    label: "Fallen Trunk",
    file: "dead_tree_trunk/dead_tree_trunk_1k.gltf",
    scale: 4.7,
    terrains: ["grass", "snow", "sand", "water"],
    yOffset: 0.16,
    collider: { x: 8.4, z: 2.1, height: 1.65 },
    floatsOnWater: true,
  },
  shrub: {
    label: "Wild Shrub",
    file: "shrub_04/shrub_04_1k.gltf",
    scale: 42,
    terrains: ["grass"],
    yOffset: 0.06,
    foliage: true,
    collider: { x: 8.2, z: 5.8, height: 0.9 },
  },
  periwinkle: {
    label: "Periwinkle Plant",
    file: "periwinkle_plant/periwinkle_plant_1k.gltf",
    scale: 5.2,
    terrains: ["grass"],
    yOffset: 0.03,
    foliage: true,
    collider: { x: 1.2, z: 1.2, height: 0.9 },
  },
  dandelion: {
    label: "Dandelion",
    file: "dandelion_01/dandelion_01_1k.gltf",
    scale: 8,
    terrains: ["grass"],
    yOffset: 0.07,
    foliage: true,
    collider: { x: 1.1, z: 1.1, height: 0.8 },
  },
  shell: {
    label: "Lambis Shell",
    file: "lambis_shell/lambis_shell_1k.gltf",
    scale: 18,
    terrains: ["sand", "water"],
    yOffset: 0.02,
    collider: { x: 1.6, z: 1.1, height: 0.45 },
    floatsOnWater: true,
  },
};

export const NATURE_ASSET_KEYS = Object.keys(NATURE_ASSETS);

export const NATURE_ASSET_URLS = NATURE_ASSET_KEYS.map(
  (key) => `${NATURE_ASSET_BASE}${NATURE_ASSETS[key].file}`
);

export const getNatureAssetsForTerrain = (terrain) =>
  NATURE_ASSET_KEYS.filter((key) =>
    NATURE_ASSETS[key].terrains.includes(terrain)
  );
