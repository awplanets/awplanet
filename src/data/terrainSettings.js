export const DEFAULT_TERRAIN_SETTINGS = {
  snow: {
    brightness: 1,
    textureScale: 1,
    relief: 1,
    deformation: 1,
    rim: 1,
    softness: 1,
    grain: 1,
    fog: 1,
  },
  sand: {
    brightness: 1,
    textureScale: 0.75,
    relief: 0.75,
    deformation: 1,
    rim: 1,
    softness: 1,
    grain: 0.65,
    fog: 1,
  },
  grass: {
    brightness: 1,
    textureScale: 1,
    grassDensity: 1.18,
    grassHeight: 1.18,
    wind: 1.08,
    reaction: 1,
    grain: 1.12,
    fog: 1,
  },
  water: {
    brightness: 1,
    depth: 1,
    flow: 1,
    wave: 1,
    ripple: 1,
    reflectivity: 1,
    clarity: 1,
    fog: 1,
  },
};

export const TERRAIN_SETTING_CONTROLS = {
  snow: [
    { key: "brightness", label: "Brightness", min: 0.65, max: 1.45, step: 0.01 },
    { key: "textureScale", label: "Texture Scale", min: 0.45, max: 2.2, step: 0.01 },
    { key: "relief", label: "Surface Relief", min: 0.35, max: 2.1, step: 0.01 },
    { key: "deformation", label: "Foot Depth", min: 0.15, max: 2.4, step: 0.01 },
    { key: "rim", label: "Raised Edge", min: 0, max: 2.4, step: 0.01 },
    { key: "softness", label: "Foot Softness", min: 0.2, max: 2.3, step: 0.01 },
    { key: "grain", label: "Powder Grain", min: 0.2, max: 2.4, step: 0.01 },
    { key: "fog", label: "Far Haze", min: 0.45, max: 1.8, step: 0.01 },
  ],
  sand: [
    { key: "brightness", label: "Brightness", min: 0.65, max: 1.45, step: 0.01 },
    { key: "textureScale", label: "Texture Scale", min: 0.45, max: 2.2, step: 0.01 },
    { key: "relief", label: "Dune Relief", min: 0.25, max: 2.1, step: 0.01 },
    { key: "deformation", label: "Foot Depth", min: 0.15, max: 2.5, step: 0.01 },
    { key: "rim", label: "Crumble Edge", min: 0, max: 2.2, step: 0.01 },
    { key: "softness", label: "Smoothing", min: 0.15, max: 2.2, step: 0.01 },
    { key: "grain", label: "Sand Grain", min: 0.25, max: 2.6, step: 0.01 },
    { key: "fog", label: "Dust Haze", min: 0.45, max: 1.8, step: 0.01 },
  ],
  grass: [
    { key: "brightness", label: "Brightness", min: 0.65, max: 1.45, step: 0.01 },
    { key: "textureScale", label: "Ground Scale", min: 0.45, max: 2.2, step: 0.01 },
    { key: "grassDensity", label: "Blade Density", min: 0.35, max: 1.8, step: 0.01 },
    { key: "grassHeight", label: "Blade Height", min: 0.65, max: 2.2, step: 0.01 },
    { key: "wind", label: "Wind Motion", min: 0, max: 2.6, step: 0.01 },
    { key: "reaction", label: "Body Reaction", min: 0.15, max: 2.2, step: 0.01 },
    { key: "grain", label: "Color Variety", min: 0.2, max: 2.3, step: 0.01 },
    { key: "fog", label: "Distance Haze", min: 0.45, max: 1.8, step: 0.01 },
  ],
  water: [
    { key: "brightness", label: "Brightness", min: 0.55, max: 1.5, step: 0.01 },
    { key: "depth", label: "Water Depth", min: 0.35, max: 1.8, step: 0.01 },
    { key: "flow", label: "Flow Speed", min: 0.05, max: 2.2, step: 0.01 },
    { key: "wave", label: "Surface Waves", min: 0.2, max: 2.4, step: 0.01 },
    { key: "ripple", label: "Foot Ripples", min: 0.15, max: 2.6, step: 0.01 },
    { key: "reflectivity", label: "Reflection", min: 0.1, max: 2, step: 0.01 },
    { key: "clarity", label: "Clarity", min: 0.25, max: 1.8, step: 0.01 },
    { key: "fog", label: "Water Haze", min: 0.45, max: 1.8, step: 0.01 },
  ],
};

export const createInitialTerrainSettings = () =>
  Object.fromEntries(
    Object.entries(DEFAULT_TERRAIN_SETTINGS).map(([terrain, settings]) => [
      terrain,
      { ...settings },
    ])
  );
