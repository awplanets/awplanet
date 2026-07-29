export const SCULPTABLE_TERRAINS = new Set([
  "blank",
  "snow",
  "sand",
  "grass",
]);

export const createSculptStamp = ({
  terrainId,
  point,
  mode = "raise",
  size = 12,
  strength = 1,
}) => ({
  id: `sculpt-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`,
  terrainId,
  x: point[0],
  y: point[1] ?? 0,
  z: point[2],
  radius: Math.max(size, 1),
  mode,
  strength: mode === "lower" ? -Math.abs(strength) : strength,
});

const ridgeNoise = (x, z, stamp) => {
  const low =
    Math.sin((x + stamp.x * 0.31) * 0.72 + (z - stamp.z) * 0.48) *
    Math.cos((z + stamp.z * 0.29) * 0.88 - x * 0.35);
  const high =
    Math.sin((x - stamp.x * 0.17) * 2.45 + z * 1.76) *
    Math.cos((z + stamp.z * 0.13) * 2.1 - x * 1.22);
  return low * 0.62 + high * 0.38;
};

export const applySculptStampHeight = (height, x, z, stamp) => {
  const dx = x - stamp.x;
  const dz = z - stamp.z;
  const radius = Math.max(stamp.radius ?? 1, 0.001);
  if (Math.abs(dx) >= radius || Math.abs(dz) >= radius) return height;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return height;

  const t = 1 - distance / radius;
  const smoothFalloff = t * t * (3 - 2 * t);
  const strength = stamp.strength ?? 0;
  const amount = Math.abs(strength);
  const mode = stamp.mode ?? (strength < 0 ? "lower" : "raise");

  if (mode === "smooth") {
    const targetHeight = stamp.y ?? 0;
    const blend = Math.min(0.72, amount * smoothFalloff * 0.16);
    return height + (targetHeight - height) * blend;
  }

  if (mode === "flatten") {
    const targetHeight = stamp.targetHeight ?? stamp.y ?? 0;
    const hardPlateau = t > 0.42 ? 1 : smoothFalloff;
    const blend = Math.min(0.96, amount * hardPlateau * 0.42);
    return height + (targetHeight - height) * blend;
  }

  if (mode === "noise") {
    return height + ridgeNoise(x, z, stamp) * amount * smoothFalloff * 0.78;
  }

  if (mode === "erode") {
    const channel =
      0.5 + 0.5 * Math.sin((x - stamp.x) * 0.72 + (z - stamp.z) * 1.38);
    const scrape = amount * smoothFalloff * (0.18 + channel * 0.42);
    const slump = (stamp.y ?? 0) - height;
    return height + slump * Math.min(0.32, amount * smoothFalloff * 0.1) - scrape;
  }

  return height + strength * smoothFalloff;
};

export const sampleSculptedHeight = (x, z, stamps = []) =>
  stamps.reduce(
    (height, stamp) => applySculptStampHeight(height, x, z, stamp),
    0
  );

export const sampleSculptedNormal = (x, z, stamps = [], sampleDistance = 0.75) => {
  const left = sampleSculptedHeight(x - sampleDistance, z, stamps);
  const right = sampleSculptedHeight(x + sampleDistance, z, stamps);
  const back = sampleSculptedHeight(x, z - sampleDistance, stamps);
  const front = sampleSculptedHeight(x, z + sampleDistance, stamps);

  return {
    x: left - right,
    y: sampleDistance * 2,
    z: back - front,
  };
};
