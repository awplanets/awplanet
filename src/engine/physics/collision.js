const HERO_RADIUS = 0.62;
const STEP_OVER_HEIGHT = 0.86;
const DEFAULT_SPATIAL_CELL_SIZE = 8;

const toScaleArray = (scale = [1, 1, 1]) => {
  if (Array.isArray(scale)) return scale;
  return [scale, scale, scale];
};

const getBaseScale = (asset) => {
  if (!asset?.scale) return [1, 1, 1];
  return toScaleArray(asset.scale);
};

const shouldUseCollider = (entity) => {
  if (!entity?.collider) return false;
  if (entity.id === "hero") return false;
  if (entity.collisionEnabled === false) return false;
  if (entity.collisionEnabled !== true && entity.collider.height && entity.collider.height <= STEP_OVER_HEIGHT) {
    return false;
  }
  return entity.collisionEnabled === true || Boolean(entity.collider);
};

const createColliderSize = (entity, assetLibrary) => {
  const collider = entity.collider;
  const asset = assetLibrary?.[entity.assetKey];
  const scale = toScaleArray(entity.scale);

  if (entity.generated || !asset) {
    return {
      radius: collider.radius,
      x: collider.x,
      z: collider.z,
      height: collider.height,
    };
  }

  const baseScale = getBaseScale(asset);
  const scaleX = scale[0] / Math.max(baseScale[0], 0.001);
  const scaleY = scale[1] / Math.max(baseScale[1], 0.001);
  const scaleZ = scale[2] / Math.max(baseScale[2], 0.001);

  return {
    radius: collider.radius ? collider.radius * Math.max(scaleX, scaleZ) : undefined,
    x: collider.x ? collider.x * scaleX : undefined,
    z: collider.z ? collider.z * scaleZ : undefined,
    height: collider.height ? collider.height * scaleY : undefined,
  };
};

export const createPhysicsObstacles = (scene, assetLibrary, options = {}) => {
  const shouldIncludeEntity = options.shouldIncludeEntity ?? (() => true);
  return scene.entityOrder
    .map((entityId) => scene.entities[entityId])
    .filter(shouldIncludeEntity)
    .filter(shouldUseCollider)
    .map((entity) => {
      const size = createColliderSize(entity, assetLibrary);
      const position = entity.position ?? [0, 0, 0];
      return {
        id: entity.id,
        label: entity.label,
        position,
        rotationY: entity.rotation?.[1] ?? 0,
        radius: size.radius,
        halfX: (size.x ?? (size.radius ? size.radius * 2 : 1)) * 0.5,
        halfZ: (size.z ?? (size.radius ? size.radius * 2 : 1)) * 0.5,
        height: size.height ?? 1,
      };
    });
};

const getObstacleExtent = (obstacle) =>
  obstacle.radius ?? Math.max(obstacle.halfX ?? 0.5, obstacle.halfZ ?? 0.5);

const getCellKey = (x, z) => `${x}:${z}`;

export const createObstacleSpatialIndex = (
  obstacles,
  cellSize = DEFAULT_SPATIAL_CELL_SIZE
) => {
  const buckets = new Map();

  obstacles.forEach((obstacle) => {
    const extent = getObstacleExtent(obstacle);
    const minCellX = Math.floor((obstacle.position[0] - extent) / cellSize);
    const maxCellX = Math.floor((obstacle.position[0] + extent) / cellSize);
    const minCellZ = Math.floor((obstacle.position[2] - extent) / cellSize);
    const maxCellZ = Math.floor((obstacle.position[2] + extent) / cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = getCellKey(cellX, cellZ);
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.push(obstacle);
        } else {
          buckets.set(key, [obstacle]);
        }
      }
    }
  });

  return {
    buckets,
    cellSize,
    obstacles,
  };
};

export const queryObstacleSpatialIndex = (
  spatialIndex,
  position,
  radius = HERO_RADIUS
) => {
  if (!spatialIndex?.buckets) return spatialIndex ?? [];

  const { buckets, cellSize } = spatialIndex;
  const minCellX = Math.floor((position[0] - radius) / cellSize);
  const maxCellX = Math.floor((position[0] + radius) / cellSize);
  const minCellZ = Math.floor((position[2] - radius) / cellSize);
  const maxCellZ = Math.floor((position[2] + radius) / cellSize);
  const candidates = new Map();

  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const bucket = buckets.get(getCellKey(cellX, cellZ));
      if (!bucket) continue;
      bucket.forEach((obstacle) => candidates.set(obstacle.id, obstacle));
    }
  }

  return [...candidates.values()];
};

const collidesWithObstacle = (position, obstacle, radius = HERO_RADIUS) => {
  if (obstacle.radius) {
    const distance = Math.hypot(
      position[0] - obstacle.position[0],
      position[2] - obstacle.position[2]
    );
    return distance < obstacle.radius + radius;
  }

  const dx = position[0] - obstacle.position[0];
  const dz = position[2] - obstacle.position[2];
  const cos = Math.cos(-obstacle.rotationY);
  const sin = Math.sin(-obstacle.rotationY);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  return (
    Math.abs(localX) <= obstacle.halfX + radius &&
    Math.abs(localZ) <= obstacle.halfZ + radius
  );
};

export const canOccupyPosition = (position, obstacles, radius = HERO_RADIUS) =>
  !queryObstacleSpatialIndex(obstacles, position, radius).some((obstacle) =>
    collidesWithObstacle(position, obstacle, radius)
  );

export const resolveCharacterMovement = ({
  currentPosition,
  desiredPosition,
  obstacles,
  radius = HERO_RADIUS,
}) => {
  if (canOccupyPosition(desiredPosition, obstacles, radius)) {
    return desiredPosition;
  }

  const slideX = [desiredPosition[0], desiredPosition[1], currentPosition[2]];
  if (canOccupyPosition(slideX, obstacles, radius)) {
    return slideX;
  }

  const slideZ = [currentPosition[0], desiredPosition[1], desiredPosition[2]];
  if (canOccupyPosition(slideZ, obstacles, radius)) {
    return slideZ;
  }

  return [currentPosition[0], desiredPosition[1], currentPosition[2]];
};
