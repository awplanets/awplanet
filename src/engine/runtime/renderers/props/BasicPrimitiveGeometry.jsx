/* eslint-disable react/prop-types, react-refresh/only-export-components */

export const BASIC_PRIMITIVE_TYPES = new Set([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "plane",
  "torus",
]);

export const isBasicPrimitive = (primitive) =>
  BASIC_PRIMITIVE_TYPES.has(primitive);

export const BasicPrimitiveGeometry = ({ primitive }) => {
  if (primitive === "sphere") {
    return <sphereGeometry args={[1, 32, 20]} />;
  }

  if (primitive === "cylinder") {
    return <cylinderGeometry args={[1, 1, 2, 32, 1]} />;
  }

  if (primitive === "cone") {
    return <coneGeometry args={[1, 2, 32, 1]} />;
  }

  if (primitive === "plane") {
    return <planeGeometry args={[2, 2, 1, 1]} />;
  }

  if (primitive === "torus") {
    return <torusGeometry args={[1, 0.32, 18, 48]} />;
  }

  return <boxGeometry args={[2, 2, 2, 1, 1, 1]} />;
};
