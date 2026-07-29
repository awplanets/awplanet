const GENERATED_PREFIX = "gen-";
const CELL_SIZE = 2.12;

const createSeed = (seed) => {
  const input = String(seed ?? Date.now());
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRandom = (seed) => {
  let state = createSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const choice = (random, items) => items[Math.floor(random() * items.length)];

const cellKey = (x, z) => `${x},${z}`;

const worldPosition = (x, z) => [x * CELL_SIZE, z * CELL_SIZE];

const toNumberOption = (value, fallback, min, max) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
};

const toIntOption = (value, fallback, min, max) =>
  Math.round(toNumberOption(value, fallback, min, max));

const createGeneratedEntity = ({
  id,
  label,
  primitive,
  type = "generated",
  color,
  position,
  scale,
  collider,
  collisionEnabled,
}) => ({
  id: `${GENERATED_PREFIX}${id}`,
  label,
  assetKey: primitive,
  type,
  primitive,
  color,
  position,
  rotation: [0, 0, 0],
  scale,
  collider,
  collisionEnabled: collisionEnabled ?? Boolean(collider),
  generated: true,
});

const createFloorTile = (id, x, z, color = "#5e6570") =>
  createGeneratedEntity({
    id,
    label: "Floor Tile",
    primitive: "floor-tile",
    color,
    position: [x, 0.02, z],
    scale: [2.08, 0.08, 2.08],
  });

const createWallBlock = (id, x, z, color = "#77808a", height = 2.1) =>
  createGeneratedEntity({
    id,
    label: "Wall Block",
    primitive: "wall-block",
    color,
    position: [x, height * 0.5, z],
    scale: [2.08, height, 2.08],
    collider: { x: 2.08, z: 2.08, height },
  });

const createWaterTile = (id, x, z, depth = 1, waterLevel = 0.07) =>
  createGeneratedEntity({
    id,
    label: "Water Channel",
    primitive: "water-channel",
    color: depth > 1.3 ? "#3695ba" : "#63cad8",
    position: [x, waterLevel, z],
    scale: [2.1, 0.11, 2.1],
  });

const createMoundTile = (id, x, z, height, color = "#6f8156") =>
  createGeneratedEntity({
    id,
    label: "Terrain Rise",
    primitive: "height-mound",
    color,
    position: [x, height * 0.26, z],
    scale: [2.12, Math.max(0.18, height * 0.52), 2.12],
  });

const createPlanMarker = (id, label, primitive, x, z, color) =>
  createGeneratedEntity({
    id,
    label,
    primitive,
    color,
    position: [x, 0.13, z],
    scale: [1.24, 0.14, 1.24],
  });

const createGameplayMarker = (id, label, x, z, color, primitive = "gameplay-marker") =>
  createPlanMarker(id, label, primitive, x, z, color);

const addRoomFloor = (cells, room) => {
  for (let z = room.z; z < room.z + room.depth; z += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      cells.set(cellKey(x, z), room);
    }
  }
};

const roomCenter = (room) => ({
  x: room.x + Math.floor(room.width / 2),
  z: room.z + Math.floor(room.depth / 2),
});

export const createRpgRoomMap = (seed, options = {}) => {
  const random = createRandom(seed);
  const footprintWidth = toIntOption(options.footprintWidth, 19, 13, 31);
  const footprintDepth = toIntOption(options.footprintDepth, 15, 11, 27);
  const layoutMode = toIntOption(options.layoutMode, 0, 0, 2);
  const officeCount = toIntOption(options.officeCount, 14, 6, 32);
  const meetingRooms = toIntOption(options.meetingRooms, 3, 0, 8);
  const serviceRooms = toIntOption(options.serviceRooms, 2, 0, 8);
  const corridorWidth = toIntOption(options.corridorWidth, 1, 1, 3);
  const roomVariance = toNumberOption(options.roomVariance, 0.58, 0, 1);
  const wallHeight = toNumberOption(options.wallHeight, 2.1, 0.8, 4.6);
  const halfWidth = Math.floor(footprintWidth / 2);
  const halfDepth = Math.floor(footprintDepth / 2);
  const left = -halfWidth;
  const top = -halfDepth;
  const roomPalette = {
    corridor: "#4d545c",
    openDesk: "#5f6870",
    privateOffice: "#586172",
    focus: "#515b69",
    meeting: "#6e6658",
    operations: "#59696a",
    service: "#56515a",
    archive: "#5e5961",
  };
  const officeTypes = [
    { name: "Open Desk Zone", zone: "workspace", color: roomPalette.openDesk, minWidth: 4, minDepth: 3 },
    { name: "Private Office", zone: "workspace", color: roomPalette.privateOffice, minWidth: 3, minDepth: 3 },
    { name: "Focus Pod", zone: "focus", color: roomPalette.focus, minWidth: 2, minDepth: 2 },
    { name: "Operations Bay", zone: "operations", color: roomPalette.operations, minWidth: 4, minDepth: 3 },
  ];
  const meetingTypes = [
    { name: "Meeting Room", zone: "meeting", color: roomPalette.meeting, minWidth: 4, minDepth: 3 },
    { name: "War Room", zone: "meeting", color: "#71634f", minWidth: 5, minDepth: 3 },
    { name: "Review Room", zone: "meeting", color: "#665f55", minWidth: 4, minDepth: 3 },
  ];
  const serviceTypes = [
    { name: "Server Room", zone: "service", color: roomPalette.service, minWidth: 3, minDepth: 3 },
    { name: "Archive", zone: "service", color: roomPalette.archive, minWidth: 3, minDepth: 2 },
    { name: "Storage", zone: "service", color: "#5a555c", minWidth: 2, minDepth: 2 },
  ];

  const splitRun = (start, length, count, minSize = 2) => {
    const maxRooms = Math.max(1, Math.floor((length + 1) / (minSize + 1)));
    const roomCount = Math.max(1, Math.min(count, maxRooms));
    const usableLength = Math.max(minSize, length - (roomCount - 1));
    const base = usableLength / roomCount;
    const sizes = [];
    let remaining = usableLength;
    for (let index = 0; index < roomCount; index += 1) {
      const remainingRooms = roomCount - index;
      const jitter = (random() - 0.5) * roomVariance * 2.8;
      const size =
        remainingRooms === 1
          ? remaining
          : Math.max(
              minSize,
              Math.min(remaining - minSize * (remainingRooms - 1), Math.round(base + jitter))
            );
      sizes.push(size);
      remaining -= size;
    }
    const spans = [];
    let cursor = start;
    sizes.forEach((size) => {
      spans.push({ start: cursor, size });
      cursor += size + 1;
    });
    return spans;
  };

  const createCandidate = (candidateIndex) => {
    const chosenLayout =
      layoutMode === 0
        ? (candidateIndex + Math.floor(random() * 5)) % 2 === 0
          ? 1
          : 2
        : layoutMode;
    const rooms = [];
    const corridors = [];
    let serial = 0;
    let meetingLeft = meetingRooms;
    let serviceLeft = serviceRooms;

    const addCorridor = (name, x, z, width, depth) => {
      if (width <= 0 || depth <= 0) return;
      corridors.push({
        name,
        zone: "circulation",
        x,
        z,
        width,
        depth,
        color: roomPalette.corridor,
      });
    };

    const nextRoomType = (width, depth) => {
      const canMeeting = meetingLeft > 0 && width >= 4 && depth >= 3;
      const canService = serviceLeft > 0 && width >= 2 && depth >= 2;
      if (canMeeting && (rooms.length % 5 === 1 || random() < 0.18 + meetingRooms * 0.025)) {
        meetingLeft -= 1;
        return choice(random, meetingTypes);
      }
      if (canService && (rooms.length % 7 === 3 || random() < 0.14 + serviceRooms * 0.025)) {
        serviceLeft -= 1;
        return choice(random, serviceTypes);
      }
      return choice(random, officeTypes);
    };

    const addRoom = ({ x, z, width, depth, doorSide }) => {
      if (width < 2 || depth < 2) return;
      const type = nextRoomType(width, depth);
      serial += 1;
      rooms.push({
        name: `${type.name} ${serial}`,
        zone: type.zone,
        x,
        z,
        width,
        depth,
        doorSide,
        color: type.color,
        targetWidth: type.minWidth,
        targetDepth: type.minDepth,
      });
    };

    const addHorizontalBand = (x, z, width, depth, count, doorSide) => {
      splitRun(x, width, count, 2).forEach((span) =>
        addRoom({ x: span.start, z, width: span.size, depth, doorSide })
      );
    };

    const addVerticalBand = (x, z, width, depth, count, doorSide) => {
      splitRun(z, depth, count, 2).forEach((span) =>
        addRoom({ x, z: span.start, width, depth: span.size, doorSide })
      );
    };

    if (chosenLayout === 2) {
      const corridorZ = top + Math.floor((footprintDepth - corridorWidth) / 2);
      const northDepth = Math.max(2, corridorZ - top - 1);
      const southZ = corridorZ + corridorWidth + 1;
      const southDepth = Math.max(2, top + footprintDepth - southZ);
      addCorridor("Main Corridor", left, corridorZ, footprintWidth, corridorWidth);
      const northCount = Math.max(2, Math.round(officeCount * (0.46 + random() * 0.12)));
      const southCount = Math.max(2, officeCount - Math.floor(northCount * (0.58 + random() * 0.28)));
      addHorizontalBand(left, top, footprintWidth, northDepth, northCount, "bottom");
      addHorizontalBand(left, southZ, footprintWidth, southDepth, southCount, "top");
    } else {
      const corridorX = left + Math.floor((footprintWidth - corridorWidth) / 2);
      const corridorZ = top + Math.floor((footprintDepth - corridorWidth) / 2);
      const westWidth = Math.max(2, corridorX - left - 1);
      const eastX = corridorX + corridorWidth + 1;
      const eastWidth = Math.max(2, left + footprintWidth - eastX);
      const northDepth = Math.max(2, corridorZ - top - 1);
      const southZ = corridorZ + corridorWidth + 1;
      const southDepth = Math.max(2, top + footprintDepth - southZ);
      addCorridor("East-West Corridor", left, corridorZ, footprintWidth, corridorWidth);
      addCorridor("North-South Corridor", corridorX, top, corridorWidth, footprintDepth);
      const quadrantCount = Math.max(1, Math.round(officeCount / 4));
      addHorizontalBand(left, top, westWidth, northDepth, quadrantCount + Math.round(random() * 2), "bottom");
      addHorizontalBand(eastX, top, eastWidth, northDepth, quadrantCount + Math.round(random() * 2), "bottom");
      addHorizontalBand(left, southZ, westWidth, southDepth, quadrantCount + Math.round(random() * 2), "top");
      addHorizontalBand(eastX, southZ, eastWidth, southDepth, quadrantCount + Math.round(random() * 2), "top");
      if (footprintDepth > 17 && random() > 0.35) {
        const midDepth = Math.max(2, Math.floor((footprintDepth - northDepth - southDepth - corridorWidth) * 0.45));
        addVerticalBand(left, corridorZ + corridorWidth + 1, westWidth, midDepth, 2, "right");
        addVerticalBand(eastX, corridorZ + corridorWidth + 1, eastWidth, midDepth, 2, "left");
      }
    }

    const roomArea = rooms.reduce((sum, room) => sum + room.width * room.depth, 0);
    const corridorArea = corridors.reduce((sum, corridor) => sum + corridor.width * corridor.depth, 0);
    const totalArea = footprintWidth * footprintDepth;
    const areaUse = (roomArea + corridorArea) / totalArea;
    const meetingPlaced = rooms.filter((room) => room.zone === "meeting").length;
    const servicePlaced = rooms.filter((room) => room.zone === "service").length;
    const averageShapePenalty =
      rooms.reduce((sum, room) => {
        const ratio = Math.max(room.width, room.depth) / Math.max(1, Math.min(room.width, room.depth));
        return sum + Math.max(0, ratio - 2.8);
      }, 0) / Math.max(1, rooms.length);
    const score =
      100 -
      Math.abs(officeCount - rooms.length) * 2.4 -
      Math.abs(meetingRooms - meetingPlaced) * 3.2 -
      Math.abs(serviceRooms - servicePlaced) * 2.8 -
      Math.abs(0.72 - areaUse) * 28 -
      averageShapePenalty * 8 +
      corridors.length * 2.5;

    return {
      label: chosenLayout === 2 ? "Office Long Hall" : "Office Four-Side",
      layoutMode: chosenLayout,
      rooms,
      corridors,
      score,
    };
  };

  const candidates = Array.from({ length: 18 }, (_, index) => createCandidate(index));
  const plan = candidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best
  );
  const roomCells = new Map();
  const wallCells = new Map();
  const markFloor = (space) => addRoomFloor(roomCells, space);

  plan.corridors.forEach(markFloor);
  plan.rooms.forEach(markFloor);

  const addWallCell = (x, z) => {
    const key = cellKey(x, z);
    if (!roomCells.has(key)) {
      wallCells.set(key, { x, z });
    }
  };

  const addWallRun = (orientation, x, z, length, doorOffsets = []) => {
    const doors = new Set(doorOffsets);
    for (let index = 0; index < length; index += 1) {
      if (doors.has(index)) continue;
      addWallCell(orientation === "horizontal" ? x + index : x, orientation === "horizontal" ? z : z + index);
    }
  };

  const addRoomWalls = (room) => {
    const doorX = Math.max(0, Math.min(room.width - 1, Math.floor(room.width * (0.38 + random() * 0.24))));
    const doorZ = Math.max(0, Math.min(room.depth - 1, Math.floor(room.depth * (0.38 + random() * 0.24))));
    addWallRun("horizontal", room.x, room.z - 1, room.width, room.doorSide === "top" ? [doorX] : []);
    addWallRun("horizontal", room.x, room.z + room.depth, room.width, room.doorSide === "bottom" ? [doorX] : []);
    addWallRun("vertical", room.x - 1, room.z, room.depth, room.doorSide === "left" ? [doorZ] : []);
    addWallRun("vertical", room.x + room.width, room.z, room.depth, room.doorSide === "right" ? [doorZ] : []);
  };

  plan.rooms.forEach(addRoomWalls);

  const frontDoorOffset = Math.floor(footprintWidth * (0.35 + random() * 0.3));
  const backDoorOffset = Math.max(1, Math.floor(footprintWidth * (0.22 + random() * 0.56)));
  addWallRun("horizontal", left, top - 1, footprintWidth, [frontDoorOffset]);
  addWallRun("horizontal", left, top + footprintDepth, footprintWidth, [backDoorOffset]);
  addWallRun("vertical", left - 1, top, footprintDepth, []);
  addWallRun("vertical", left + footprintWidth, top, footprintDepth, []);

  const entities = [];
  Array.from(roomCells.entries()).forEach(([key, room], index) => {
    const [cellX, cellZ] = key.split(",").map(Number);
    const [x, z] = worldPosition(cellX, cellZ);
    entities.push(createFloorTile(`office-floor-${index}`, x, z, room.color));
  });
  Array.from(wallCells.keys()).forEach((key, index) => {
    const [cellX, cellZ] = key.split(",").map(Number);
    const [x, z] = worldPosition(cellX, cellZ);
    const tint = random() > 0.5 ? "#747b80" : "#686f76";
    entities.push(createWallBlock(`office-wall-${index}`, x, z, tint, wallHeight));
  });
  const [entranceX, entranceZ] = worldPosition(left + frontDoorOffset, top - 1);
  const [exitX, exitZ] = worldPosition(left + backDoorOffset, top + footprintDepth);
  entities.push(createPlanMarker("office-entrance", "Lobby Entry", "entrance-marker", entranceX, entranceZ, "#8dd7b7"));
  entities.push(createPlanMarker("office-exit", "Service Exit", "exit-marker", exitX, exitZ, "#f0be70"));
  entities.push(createGameplayMarker("office-safe-lobby", "Safe Start", entranceX, entranceZ + CELL_SIZE, "#9bd4c8", "safe-marker"));
  plan.rooms.slice(0, 28).forEach((room, index) => {
    const center = roomCenter(room);
    const [x, z] = worldPosition(center.x, center.z);
    entities.push(createPlanMarker(`office-zone-${index}`, room.name, "zone-marker", x, z, room.color));
  });
  const operationsRoom =
    plan.rooms.find((room) => room.zone === "operations") ??
    plan.rooms.find((room) => room.zone === "meeting") ??
    plan.rooms[0];
  if (operationsRoom) {
    const center = roomCenter(operationsRoom);
    const [x, z] = worldPosition(center.x, center.z);
    entities.push(createGameplayMarker("office-objective-ops", "Operations Hub", x, z, "#8dd7ff", "objective-marker"));
    entities.push(createGameplayMarker("office-quest-briefing", "Briefing Point", x + CELL_SIZE * 0.5, z, "#b8a7ff", "quest-marker"));
  }
  return {
    preset: "rpg-rooms",
    label: plan.label,
    seed,
    config: {
      footprintWidth,
      footprintDepth,
      layoutMode,
      officeCount,
      meetingRooms,
      serviceRooms,
      corridorWidth,
      roomVariance,
      wallHeight,
      score: Number(plan.score.toFixed(2)),
    },
    entities,
  };
};

export const createMazeMap = (seed, options = {}) => {
  const random = createRandom(seed);
  const size = toIntOption(options.size, 31, 7, 100);
  const extraOpenings = toIntOption(
    options.extraOpenings,
    Math.max(8, Math.round(size * size * 0.025)),
    0,
    Math.floor(size * size * 0.12)
  );
  const corridorWidth = toIntOption(options.corridorWidth, 2, 1, 6);
  const largeRooms = toIntOption(
    options.largeRooms,
    Math.max(2, Math.round(size * 0.06)),
    0,
    Math.max(4, Math.floor(size * 0.2))
  );
  const roomScale = toNumberOption(options.roomScale, 0.32, 0, 1);
  const wallHeight = toNumberOption(options.wallHeight, 2.1, 0.8, 20);
  const wallColorMix = toNumberOption(options.wallColorMix, 0.5, 0, 1);
  const grid = Array.from({ length: size }, () => Array(size).fill(true));
  const corridorRadius = Math.max(0, Math.round((corridorWidth - 1) / 2));
  const mazeStep = Math.max(2, corridorRadius * 4 + 1);
  const stack = [{ x: 1, z: 1 }];
  grid[1][1] = false;

  const setOpen = (x, z) => {
    if (x <= 0 || z <= 0 || x >= size - 1 || z >= size - 1) return;
    grid[z][x] = false;
  };

  const carveRect = (centerX, centerZ, width, depth) => {
    const halfW = Math.floor(width / 2);
    const halfD = Math.floor(depth / 2);
    for (let z = centerZ - halfD; z <= centerZ + halfD; z += 1) {
      for (let x = centerX - halfW; x <= centerX + halfW; x += 1) {
        setOpen(x, z);
      }
    }
  };

  const carveLine = (from, to, radius = 1) => {
    let x = from.x;
    let z = from.z;
    const openDisk = (cx, cz) => {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dz * dz <= radius * radius + 0.4) {
            setOpen(cx + dx, cz + dz);
          }
        }
      }
    };
    openDisk(x, z);
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      openDisk(x, z);
    }
    while (z !== to.z) {
      z += Math.sign(to.z - z);
      openDisk(x, z);
    }
  };

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = [
      { x: current.x + mazeStep, z: current.z },
      { x: current.x - mazeStep, z: current.z },
      { x: current.x, z: current.z + mazeStep },
      { x: current.x, z: current.z - mazeStep },
    ].filter(
      (cell) =>
        cell.x > 0 &&
        cell.z > 0 &&
        cell.x < size - 1 &&
        cell.z < size - 1 &&
        grid[cell.z][cell.x]
    );

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = choice(random, neighbors);
    carveLine(current, next, 0);
    grid[next.z][next.x] = false;
    stack.push(next);
  }

  if (corridorRadius > 0) {
    const widened = grid.map((row) => [...row]);
    for (let z = 1; z < size - 1; z += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        if (grid[z][x]) continue;
        for (let dz = -corridorRadius; dz <= corridorRadius; dz += 1) {
          for (let dx = -corridorRadius; dx <= corridorRadius; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) <= corridorRadius + 1) {
              const nx = x + dx;
              const nz = z + dz;
              if (nx > 0 && nz > 0 && nx < size - 1 && nz < size - 1) {
                widened[nz][nx] = false;
              }
            }
          }
        }
      }
    }
    for (let z = 0; z < size; z += 1) {
      grid[z] = widened[z];
    }
  }

  const breakWall = () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = 2 + Math.floor(random() * Math.max(1, size - 4));
      const z = 2 + Math.floor(random() * Math.max(1, size - 4));
      if (!grid[z][x]) continue;
      const openHorizontal = !grid[z][x - 1] && !grid[z][x + 1];
      const openVertical = !grid[z - 1][x] && !grid[z + 1][x];
      if (openHorizontal || openVertical) {
        grid[z][x] = false;
        return;
      }
    }
  };

  for (let index = 0; index < extraOpenings; index += 1) {
    breakWall();
  }

  const floorCells = [];
  for (let z = 2; z < size - 2; z += 1) {
    for (let x = 2; x < size - 2; x += 1) {
      if (!grid[z][x]) {
        floorCells.push({ x, z });
      }
    }
  }

  const minRoom = Math.max(3, Math.round(3 + roomScale * 3));
  const maxRoom = Math.max(minRoom + 1, Math.round(size * (0.045 + roomScale * 0.055)));
  const chamberCount = Math.min(largeRooms, Math.max(0, Math.floor(floorCells.length / 42)));
  for (let index = 0; index < chamberCount; index += 1) {
    const anchor = choice(random, floorCells);
    const roomWidth = minRoom + Math.floor(random() * Math.max(1, maxRoom - minRoom + 1));
    const roomDepth = minRoom + Math.floor(random() * Math.max(1, maxRoom - minRoom + 1));
    carveRect(anchor.x, anchor.z, roomWidth, roomDepth);
  }

  const findNearestOpen = (target) => {
    let best = null;
    let bestDistance = Infinity;
    for (let z = 1; z < size - 1; z += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        if (grid[z][x]) continue;
        const distance = Math.hypot(x - target.x, z - target.z);
        if (distance < bestDistance) {
          best = { x, z };
          bestDistance = distance;
        }
      }
    }
    return best ?? { x: Math.max(1, Math.min(size - 2, target.x)), z: Math.max(1, Math.min(size - 2, target.z)) };
  };

  const entrance = findNearestOpen({
    x: Math.max(1, 2 + corridorRadius),
    z: Math.max(1, 2 + corridorRadius),
  });
  const start = entrance;
  const exit = findNearestOpen({
    x: Math.min(size - 2, size - 3 - corridorRadius),
    z: Math.min(size - 2, size - 3 - corridorRadius),
  });
  const goal = exit;
  grid[entrance.z][entrance.x] = false;
  grid[start.z][start.x] = false;
  grid[exit.z][exit.x] = false;
  grid[goal.z][goal.x] = false;

  const entities = [];
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const [worldX, worldZ] = worldPosition(x - Math.floor(size / 2), z - Math.floor(size / 2));
      const wallColor = wallColorMix > 0.66 ? "#69737d" : wallColorMix < 0.33 ? "#434d58" : "#56606a";
      entities.push(
        grid[z][x]
          ? createWallBlock(`maze-wall-${x}-${z}`, worldX, worldZ, wallColor, wallHeight)
          : createFloorTile(`maze-floor-${x}-${z}`, worldX, worldZ, "#4f5963")
      );
    }
  }
  const [entranceX, entranceZ] = worldPosition(
    entrance.x - Math.floor(size / 2),
    entrance.z - Math.floor(size / 2)
  );
  const [exitX, exitZ] = worldPosition(
    exit.x - Math.floor(size / 2),
    exit.z - Math.floor(size / 2)
  );
  entities.push(createPlanMarker("maze-entrance", "Entrance", "entrance-marker", entranceX, entranceZ, "#8dd7b7"));
  entities.push(createPlanMarker("maze-exit", "Exit", "exit-marker", exitX, exitZ, "#f0be70"));
  entities.push(createGameplayMarker("maze-safe-start", "Safe Start", entranceX, entranceZ, "#9bd4c8", "safe-marker"));
  entities.push(createGameplayMarker("maze-boss-exit", "Boss Gate", exitX, exitZ, "#d98bff", "objective-marker"));
  return {
    preset: "maze",
    label: "Dungeon Regions",
    seed,
    config: {
      size,
      extraOpenings,
      corridorWidth,
      largeRooms,
      roomScale,
      wallHeight,
      wallColorMix,
    },
    terrainId: "blank",
    terrainParameters: { relief: 0.1, roughness: 0.96, density: 0.02 },
    entities,
  };
};

export const createOutdoorHydrologyMap = (seed, options = {}) => {
  const random = createRandom(seed);
  const entities = [];
  const radius = toIntOption(options.radius, 6, 4, 14);
  const bend = toNumberOption(options.riverBend, 1.1, 0.25, 2.4);
  const riverOffset = random() * 2 - 1;
  const waterWidth = toNumberOption(options.riverWidth, 0.95, 0.35, 2.6);
  const elevation = toNumberOption(options.elevation, 0.58, 0.05, 1.6);
  const noise = toNumberOption(options.noise, 0.22, 0, 0.8);
  const waterLevel = toNumberOption(options.waterLevel, 0.07, -0.2, 0.5);
  const pathWidth = toNumberOption(options.pathWidth, 0.72, 0.35, 2.4);
  const landmarkCount = toIntOption(options.landmarkCount, 5, 1, 14);
  const ridgeDirection = random() > 0.5 ? 1 : -1;
  const pathBend = 0.65 + random() * 0.55;
  const traversableCells = [];
  const pathCells = [];

  for (let z = -radius; z <= radius; z += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const riverCenter =
        Math.sin((z + riverOffset) * bend) * (1.35 + random() * 0.15);
      const distanceToRiver = Math.abs(x - riverCenter);
      const pathCenter = Math.sin(x * pathBend) * 1.35;
      const distanceToPath = Math.abs(z - pathCenter);
      const basin = Math.max(0, 1.4 - distanceToRiver);
      const height =
        Math.max(0.18, Math.abs(x * 0.08) + Math.max(0, z * ridgeDirection) * 0.045) * elevation +
        random() * noise -
        basin * 0.14;
      const [worldX, worldZ] = worldPosition(x, z);
      const isWater = distanceToRiver < waterWidth;
      const isPath = !isWater && distanceToPath < pathWidth;
      const isSand = !isWater && distanceToRiver < waterWidth + 1.1;
      const isStone = !isWater && height > 0.72;
      const tileColor = isPath
        ? "#7b705d"
        : isSand
          ? "#b99758"
        : isStone
          ? "#73776f"
        : "#667e50";

      if (isWater) {
        entities.push(createWaterTile(`hydro-water-${x}-${z}`, worldX, worldZ, basin, waterLevel));
      } else if (isPath || isSand) {
        entities.push(createFloorTile(`hydro-${isPath ? "path" : "sand"}-${x}-${z}`, worldX, worldZ, tileColor));
      } else {
        entities.push(
          createMoundTile(
            `hydro-${isStone ? "stone" : "grass"}-${x}-${z}`,
            worldX,
            worldZ,
            height,
            tileColor
          )
        );
      }
      if (!isWater) {
        traversableCells.push({ x, z, isPath, isSand, isStone });
      }
      if (isPath) {
        pathCells.push({ x, z });
      }
    }
  }
  const startCell = pathCells.reduce(
    (best, cell) => (cell.x < best.x ? cell : best),
    pathCells[0] ?? { x: -radius, z: 0 }
  );
  const exitCell = pathCells.reduce(
    (best, cell) => (cell.x > best.x ? cell : best),
    pathCells[0] ?? { x: radius, z: 0 }
  );
  const [entranceX, entranceZ] = worldPosition(startCell.x, startCell.z);
  const [exitX, exitZ] = worldPosition(exitCell.x, exitCell.z);
  entities.push(createPlanMarker("overworld-entrance", "Trailhead", "entrance-marker", entranceX, entranceZ, "#8dd7b7"));
  entities.push(createPlanMarker("overworld-exit", "Next Region", "exit-marker", exitX, exitZ, "#f0be70"));
  entities.push(createGameplayMarker("overworld-camp", "Camp", entranceX + CELL_SIZE * 1.2, entranceZ, "#9bd4c8", "safe-marker"));
  const landmarkTypes = [
    ["Village", "#b8a7ff", "quest-marker"],
    ["Ruin", "#8dd7ff", "objective-marker"],
    ["Shrine", "#d98bff", "objective-marker"],
  ];
  for (let index = 0; index < landmarkCount; index += 1) {
    const candidates = traversableCells.filter((cell) => index % 2 === 0 ? !cell.isPath : cell.isStone || cell.isSand);
    const cell = choice(random, candidates.length > 0 ? candidates : traversableCells);
    const [x, z] = worldPosition(cell.x, cell.z);
    const [label, color, primitive] = choice(random, landmarkTypes);
    entities.push(createGameplayMarker(`overworld-landmark-${index}`, label, x, z, color, primitive));
  }
  return {
    preset: "outdoor-hydro",
    label: "RPG Overworld",
    seed,
    config: {
      radius,
      riverWidth: waterWidth,
      riverBend: bend,
      elevation,
      noise,
      waterLevel,
      pathWidth,
      landmarkCount,
    },
    terrainId: "grass",
    terrainParameters: { relief: 0.58, roughness: 0.82, density: 0.62 },
    entities,
  };
};

export const createProceduralMap = (preset, seed = Date.now(), options = {}) => {
  if (preset === "maze") return createMazeMap(seed, options);
  if (preset === "outdoor-hydro") return createOutdoorHydrologyMap(seed, options);
  return createRpgRoomMap(seed, options);
};

export const isGeneratedEntityId = (entityId) => entityId.startsWith(GENERATED_PREFIX);
