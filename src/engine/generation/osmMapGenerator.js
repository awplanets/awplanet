const GENERATED_PREFIX = "gen-";
const EARTH_METERS_PER_DEGREE = 111320;
const DEFAULT_ROAD_WIDTH = 2.8;
const TILE_SIZE = 3.2;
const MAX_ROAD_SEGMENTS = 360;
const MAX_BUILDINGS = 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const createGeneratedEntity = ({
  id,
  label,
  primitive,
  color,
  position,
  rotation = [0, 0, 0],
  scale,
  footprint,
  height,
  collider,
  collisionEnabled,
}) => ({
  id: `${GENERATED_PREFIX}${id}`,
  label,
  assetKey: primitive,
  type: "generated",
  primitive,
  color,
  position,
  rotation,
  scale,
  footprint,
  height,
  collider,
  collisionEnabled: collisionEnabled ?? Boolean(collider),
  generated: true,
});

const getFeatureKind = (properties = {}) => {
  if (properties.building) return "building";
  if (properties.highway || properties.road || properties.route === "road") return "road";
  if (properties.natural === "coastline") return "coastline";
  if (
    properties.natural === "water" ||
    properties.water ||
    properties.waterway ||
    properties.landuse === "reservoir"
  ) {
    return "water";
  }
  if (
    ["grass", "meadow", "forest", "recreation_ground", "park", "village_green"].includes(
      properties.landuse
    ) ||
    ["park", "garden"].includes(properties.leisure) ||
    properties.natural === "wood"
  ) {
    return "green";
  }
  return "ground";
};

const getRoadWidth = (properties = {}) => {
  const lanes = Number(properties.lanes);
  const laneWidth = Number.isFinite(lanes) ? lanes * 1.15 : 0;
  if (["motorway", "trunk", "primary"].includes(properties.highway)) return 5.4 + laneWidth;
  if (["secondary", "tertiary"].includes(properties.highway)) return 4.4 + laneWidth;
  if (["footway", "path", "cycleway", "pedestrian"].includes(properties.highway)) return 1.8;
  return DEFAULT_ROAD_WIDTH + laneWidth;
};

const getRoadColor = (properties = {}) => {
  if (["motorway", "trunk", "primary"].includes(properties.highway)) return "#30373c";
  if (["secondary", "tertiary"].includes(properties.highway)) return "#3a4145";
  if (["footway", "path", "cycleway", "pedestrian", "steps"].includes(properties.highway)) {
    return "#8f958b";
  }
  if (properties.service || properties.highway === "service") return "#555b5d";
  return "#464d51";
};

const getBuildingColor = (properties = {}) => {
  if (properties.building === "roof") return "#73706a";
  if (properties.building === "glass" || properties.building === "commercial") return "#6f7f87";
  if (["apartments", "hotel", "office"].includes(properties.building)) return "#7b8386";
  if (["terminal", "transportation", "warehouse"].includes(properties.building)) return "#8a8176";
  return "#7e8584";
};

const extractGeoJsonFeatures = (data) => {
  if (data?.type === "FeatureCollection") return data.features ?? [];
  if (data?.type === "Feature") return [data];
  if (data?.type && data.coordinates) {
    return [{ type: "Feature", properties: {}, geometry: data }];
  }
  return null;
};

const extractOverpassFeatures = (data) => {
  if (!Array.isArray(data?.elements)) return null;
  const nodes = new Map();
  data.elements.forEach((element) => {
    if (element.type === "node" && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
      nodes.set(element.id, [element.lon, element.lat]);
    }
  });

  return data.elements
    .filter(
      (element) =>
        element.type === "way" &&
        (Array.isArray(element.geometry) || Array.isArray(element.nodes))
    )
    .map((way) => {
      const coordinates = Array.isArray(way.geometry)
        ? way.geometry
            .map((point) => [point.lon, point.lat])
            .filter((coord) => Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
        : way.nodes.map((nodeId) => nodes.get(nodeId)).filter(Boolean);
      if (coordinates.length < 2) return null;
      const isClosed =
        coordinates.length > 3 &&
        coordinates[0][0] === coordinates.at(-1)[0] &&
        coordinates[0][1] === coordinates.at(-1)[1];
      return {
        type: "Feature",
        properties: way.tags ?? {},
        geometry: {
          type: isClosed ? "Polygon" : "LineString",
          coordinates: isClosed ? [coordinates] : coordinates,
        },
      };
    })
    .filter(Boolean);
};

const flattenCoordinates = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates;
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") {
    return geometry.coordinates.flat();
  }
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
};

const createProjector = (features, options = {}) => {
  const coords = features.flatMap((feature) => flattenCoordinates(feature.geometry));
  const valid = coords.filter(
    (coord) => Number.isFinite(coord?.[0]) && Number.isFinite(coord?.[1])
  );
  if (valid.length === 0) {
    return {
      project: () => [0, 0],
      center: [0, 0],
      bounds: { width: 1, depth: 1 },
    };
  }

  const centerLon = valid.reduce((sum, coord) => sum + coord[0], 0) / valid.length;
  const centerLat = valid.reduce((sum, coord) => sum + coord[1], 0) / valid.length;
  const latScale = Math.cos((centerLat * Math.PI) / 180) * EARTH_METERS_PER_DEGREE;
  const points = valid.map(([lon, lat]) => [
    (lon - centerLon) * latScale,
    -(lat - centerLat) * EARTH_METERS_PER_DEGREE,
  ]);
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minZ = Math.min(...points.map((point) => point[1]));
  const maxZ = Math.max(...points.map((point) => point[1]));
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const scale = (130 / span) * clamp(Number(options.worldScale) || 1, 0.35, 2.5);

  return {
    center: [centerLon, centerLat],
    bounds: {
      width: (maxX - minX) * scale,
      depth: (maxZ - minZ) * scale,
    },
    project: ([lon, lat]) => [
      (lon - centerLon) * latScale * scale,
      -(lat - centerLat) * EARTH_METERS_PER_DEGREE * scale,
    ],
  };
};

const polygonCentroid = (points) => {
  if (points.length === 0) return [0, 0];
  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  );
  return [sum[0] / points.length, sum[1] / points.length];
};

const addLineSegments = (entities, idPrefix, label, coordinates, projector, properties, options) => {
  const width = getRoadWidth(properties) * clamp(Number(options.roadWidthScale) || 1, 0.35, 2.5);
  const roadColor = getRoadColor(properties);
  const shouldMarkLane = ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(
    properties.highway
  );
  const hasSidewalk =
    !["footway", "path", "cycleway", "steps"].includes(properties.highway) && width > 2.6;
  for (
    let index = 1;
    index < coordinates.length &&
    entities.filter((entity) => entity.primitive === "road-surface").length < MAX_ROAD_SEGMENTS;
    index += 1
  ) {
    const [x1, z1] = projector.project(coordinates[index - 1]);
    const [x2, z2] = projector.project(coordinates[index]);
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.8) continue;
    entities.push(
      createGeneratedEntity({
        id: `${idPrefix}-road-${index}`,
        label,
        primitive: "road-surface",
        color: roadColor,
        position: [(x1 + x2) * 0.5, 0.052, (z1 + z2) * 0.5],
        rotation: [0, -Math.atan2(dz, dx), 0],
        scale: [length, 0.045, width],
      })
    );
    if (hasSidewalk) {
      const normalX = -dz / length;
      const normalZ = dx / length;
      const sidewalkOffset = width * 0.5 + 0.38;
      [-1, 1].forEach((side) => {
        entities.push(
          createGeneratedEntity({
            id: `${idPrefix}-sidewalk-${index}-${side}`,
            label: `${label} Sidewalk`,
            primitive: "sidewalk-surface",
            color: "#9ea5a0",
            position: [
              (x1 + x2) * 0.5 + normalX * sidewalkOffset * side,
              0.048,
              (z1 + z2) * 0.5 + normalZ * sidewalkOffset * side,
            ],
            rotation: [0, -Math.atan2(dz, dx), 0],
            scale: [length, 0.035, 0.38],
          })
        );
      });
    }
    if (shouldMarkLane && length > 3.4) {
      entities.push(
        createGeneratedEntity({
          id: `${idPrefix}-road-mark-${index}`,
          label: `${label} Lane Marking`,
          primitive: "road-marking",
          color: "#cfd5cf",
          position: [(x1 + x2) * 0.5, 0.082, (z1 + z2) * 0.5],
          rotation: [0, -Math.atan2(dz, dx), 0],
          scale: [length * 0.72, 0.018, 0.055],
        })
      );
    }
  }
};

const addPolygonSurface = (entities, idPrefix, label, polygon, primitive, color, y = 0.04) => {
  if (polygon.length < 3) return;
  const [x, z] = polygonCentroid(polygon);
  entities.push(
    createGeneratedEntity({
      id: `${idPrefix}-${primitive}`,
      label,
      primitive,
      color,
      position: [x, y, z],
      scale: [1, 1, 1],
      footprint: polygon,
      collisionEnabled: false,
    })
  );
};

const addCoastlineWater = (entities, idPrefix, label, line, projector, options) => {
  const coast = line.map(projector.project);
  if (coast.length < 2) return;
  const mapMaxX = projector.bounds.width * 0.5 + TILE_SIZE * 3;
  const mapMinX = -projector.bounds.width * 0.5 - TILE_SIZE * 3;
  const coastCenterX = coast.reduce((sum, point) => sum + point[0], 0) / coast.length;
  const waterEdgeX = coastCenterX >= 0 ? mapMaxX : mapMinX;
  const polygon =
    waterEdgeX >= coastCenterX
      ? [...coast, [waterEdgeX, coast.at(-1)[1]], [waterEdgeX, coast[0][1]]]
      : [...coast, [waterEdgeX, coast.at(-1)[1]], [waterEdgeX, coast[0][1]]].reverse();

  addPolygonSurface(
    entities,
    idPrefix,
    label,
    polygon,
    "water-surface",
    "#4aaec0",
    Number.isFinite(Number(options.waterLevel)) ? Number(options.waterLevel) : 0.06
  );
};

const addBuilding = (entities, idPrefix, polygon, properties, index, options) => {
  if (entities.filter((entity) => entity.primitive === "osm-building").length >= MAX_BUILDINGS) {
    return;
  }
  const xs = polygon.map((point) => point[0]);
  const zs = polygon.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const width = Math.max(1.4, maxX - minX);
  const depth = Math.max(1.4, maxZ - minZ);
  const levels = Number(properties["building:levels"]);
  const meters = Number(properties.height);
  const heightScale = clamp(Number(options.buildingHeightScale) || 1, 0.25, 3);
  const isRoofOnly = properties.building === "roof";
  const height = clamp(
    (isRoofOnly ? 0.45 : Number.isFinite(meters) ? meters * 0.22 : (levels || 2.5) * 0.9) *
      heightScale,
    isRoofOnly ? 0.28 : 1.2,
    20
  );
  const [x, z] = polygonCentroid(polygon);
  const color = getBuildingColor(properties);

  entities.push(
    createGeneratedEntity({
      id: `${idPrefix}-building-${index}`,
      label: properties.name ?? "OSM Building",
      primitive: "osm-building",
      color,
      position: [x, height * 0.5, z],
      scale: [width, height, depth],
      footprint: polygon,
      height,
      collider: { x: width, z: depth, height },
      collisionEnabled: true,
    })
  );
  if (!isRoofOnly && height > 1.4) {
    entities.push(
      createGeneratedEntity({
        id: `${idPrefix}-roof-${index}`,
        label: `${properties.name ?? "OSM Building"} Roof`,
        primitive: "osm-roof",
        color: "#a9a29a",
        position: [x, height + 0.035, z],
        scale: [width * 1.015, 0.06, depth * 1.015],
        footprint: polygon,
        height: 0.06,
        collisionEnabled: false,
      })
    );
  }
};

const getPolygonRings = (geometry) => {
  if (geometry?.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
};

const getLineStrings = (geometry) => {
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  return [];
};

export const createOsmMapFromGeoData = (data, options = {}) => {
  const features = extractGeoJsonFeatures(data) ?? extractOverpassFeatures(data);
  if (!features || features.length === 0) {
    throw new Error("Unsupported OSM import format. Use GeoJSON or Overpass JSON.");
  }

  const projector = createProjector(features, options);
  const entities = [];
  const roadAnchors = [];
  const idPrefix = `osm-${Date.now().toString(36)}`;

  features.forEach((feature, featureIndex) => {
    const properties = feature.properties ?? {};
    const kind = getFeatureKind(properties);
    const label = properties.name ?? `OSM ${kind}`;

    if (kind === "road") {
      getLineStrings(feature.geometry).forEach((line, lineIndex) => {
        const before = entities.length;
        addLineSegments(
          entities,
          `${idPrefix}-${featureIndex}-${lineIndex}`,
          label,
          line,
          projector,
          properties,
          options
        );
        if (entities.length > before && line.length > 0) {
          roadAnchors.push(projector.project(line[0]), projector.project(line.at(-1)));
        }
      });
      return;
    }

    if (kind === "coastline") {
      getLineStrings(feature.geometry).forEach((line, lineIndex) => {
        addCoastlineWater(
          entities,
          `${idPrefix}-${featureIndex}-${lineIndex}-coast`,
          label,
          line,
          projector,
          options
        );
      });
      return;
    }

    getPolygonRings(feature.geometry).forEach((ring, ringIndex) => {
      const polygon = ring.map(projector.project);
      if (polygon.length < 3) return;
      if (kind === "building") {
        addBuilding(
          entities,
          `${idPrefix}-${featureIndex}-${ringIndex}`,
          polygon,
          properties,
          featureIndex,
          options
        );
      } else if (kind === "water") {
        addPolygonSurface(
          entities,
          `${idPrefix}-${featureIndex}-${ringIndex}`,
          label,
          polygon,
          "water-surface",
          "#4fb6c9",
          Number.isFinite(Number(options.waterLevel)) ? Number(options.waterLevel) : 0.06
        );
      } else if (kind === "green") {
        addPolygonSurface(
          entities,
          `${idPrefix}-${featureIndex}-${ringIndex}`,
          label,
          polygon,
          "green-zone",
          "#4f7d43",
          0.042
        );
      }
    });
  });

  const start = roadAnchors[0] ?? [-18, 0];
  const exit =
    roadAnchors.reduce(
      (best, point) =>
        Math.hypot(point[0] - start[0], point[1] - start[1]) >
        Math.hypot(best[0] - start[0], best[1] - start[1])
          ? point
          : best,
      roadAnchors.at(-1) ?? [18, 0]
    );

  entities.push(
    createGeneratedEntity({
      id: `${idPrefix}-entrance`,
      label: "OSM Entry",
      primitive: "entrance-marker",
      color: "#8dd7b7",
      position: [start[0], 0.14, start[1]],
      scale: [1.2, 0.14, 1.2],
    }),
    createGeneratedEntity({
      id: `${idPrefix}-exit`,
      label: "OSM Exit",
      primitive: "exit-marker",
      color: "#f0be70",
      position: [exit[0], 0.14, exit[1]],
      scale: [1.2, 0.14, 1.2],
    }),
    createGeneratedEntity({
      id: `${idPrefix}-safe`,
      label: "OSM Safe Point",
      primitive: "safe-marker",
      color: "#9bd4c8",
      position: [start[0] + 2.5, 0.14, start[1]],
      scale: [1.2, 0.14, 1.2],
    })
  );

  return {
    preset: "osm-import",
    label: options.label ?? "OSM Imported Region",
    seed: options.seed ?? idPrefix,
    config: {
      source: "GeoJSON/Overpass JSON",
      center: projector.center,
      bounds: projector.bounds,
      featureCount: features.length,
      worldScale: options.worldScale ?? 1,
      roadWidthScale: options.roadWidthScale ?? 1,
      buildingHeightScale: options.buildingHeightScale ?? 1,
      waterLevel: options.waterLevel ?? 0.06,
    },
    terrainId: "blank",
    terrainParameters: { relief: 0.18, roughness: 0.82, density: 0.08 },
    entities,
  };
};
