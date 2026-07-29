export const hasFootprintGeometry = (entity) =>
  Array.isArray(entity?.footprint) && entity.footprint.length >= 3;
