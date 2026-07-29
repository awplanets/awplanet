import * as THREE from "three";

export const measureObject = (object) => {
  object.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  return {
    bounds,
    size,
    center,
  };
};

export const createGroundedCenterOffset = (bounds, center) => [
  -center.x,
  -bounds.min.y,
  -center.z,
];

export const createHeightScale = (rawHeight, targetHeight) =>
  rawHeight > 0 ? targetHeight / rawHeight : 1;

export const toArrayMetrics = ({ bounds, size, center }) => ({
  boundsMin: bounds.min.toArray(),
  boundsMax: bounds.max.toArray(),
  size: size.toArray(),
  center: center.toArray(),
});
