export const TERRAIN_TEXTURES = {
  snow: {
    map: "/textures/snow/snow-color.jpg",
    normalMap: "/textures/snow/snow-normal-gl.jpg",
    roughnessMap: "/textures/snow/snow-roughness.jpg",
    aoMap: "/textures/snow/snow-ambientocclusion.jpg",
    repeat: 18,
  },
  sand: {
    map: "/textures/sand/ground101/Ground101_Color.jpg",
    normalMap: "/textures/sand/ground101/Ground101_NormalDX.jpg",
    roughnessMap: "/textures/sand/ground101/Ground101_Roughness.jpg",
    aoMap: "/textures/sand/ground101/Ground101_AmbientOcclusion.jpg",
    repeat: 16,
  },
};

export const TERRAIN_TEXTURE_URLS = [
  ...new Set(
    Object.values(TERRAIN_TEXTURES).flatMap((config) =>
      [
        config.map,
        config.normalMap,
        config.roughnessMap,
        config.aoMap,
      ].filter(Boolean)
    )
  ),
];
