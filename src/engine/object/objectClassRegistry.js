const createClass = ({ type, label, icon, groups }) => ({
  type,
  label,
  icon,
  groups,
});

export const OBJECT_CLASS_REGISTRY = {
  Project: createClass({
    type: "Project",
    label: "Project",
    icon: "Project",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "name", label: "Name", valueType: "text", editable: true },
        ],
      },
      {
        id: "runtime",
        label: "Runtime",
        properties: [
          { key: "sceneCount", label: "Scenes", valueType: "number" },
          { key: "activeSceneId", label: "Active Scene", valueType: "reference" },
        ],
      },
    ],
  }),

  Scene: createClass({
    type: "Scene",
    label: "Scene",
    icon: "Scene",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "name", label: "Name", valueType: "text", editable: true },
        ],
      },
      {
        id: "contents",
        label: "Contents",
        properties: [
          { key: "terrainId", label: "Terrain", valueType: "reference" },
          { key: "entityCount", label: "Entities", valueType: "number" },
          { key: "selectedEntityId", label: "Selected", valueType: "reference" },
        ],
      },
    ],
  }),

  Terrain3D: createClass({
    type: "Terrain3D",
    label: "Terrain3D",
    icon: "Terrain",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "label", label: "Material", valueType: "text" },
        ],
      },
      {
        id: "material",
        label: "Material Resource",
        properties: [
          { key: "color", label: "Base Color", valueType: "color" },
          { key: "fog", label: "Distance Fog", valueType: "color" },
          {
            key: "relief",
            label: "Relief",
            valueType: "number",
            editable: true,
            min: 0,
            max: 1,
            step: 0.01,
          },
          {
            key: "roughness",
            label: "Roughness",
            valueType: "number",
            editable: true,
            min: 0,
            max: 1,
            step: 0.01,
          },
          {
            key: "density",
            label: "Density",
            valueType: "number",
            editable: true,
            min: 0,
            max: 1,
            step: 0.01,
          },
        ],
      },
    ],
  }),

  Camera3D: createClass({
    type: "Camera3D",
    label: "Camera3D",
    icon: "Camera",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "label", label: "Label", valueType: "text", editable: true },
          { key: "mode", label: "Mode", valueType: "reference" },
        ],
      },
      {
        id: "view",
        label: "View",
        properties: [
          { key: "position", label: "Position", valueType: "vector3", editable: true },
          { key: "target", label: "Target", valueType: "vector3", editable: true },
          {
            key: "minDistance",
            label: "Min Distance",
            valueType: "number",
            editable: true,
            min: 1,
            step: 0.5,
          },
          {
            key: "maxDistance",
            label: "Max Distance",
            valueType: "number",
            editable: true,
            min: 5,
            step: 1,
          },
        ],
      },
      {
        id: "phone-pilot",
        label: "Phone Pilot",
        properties: [
          {
            key: "phonePilotEnabled",
            label: "Enabled",
            valueType: "boolean",
            editable: true,
          },
          {
            key: "phonePilotLookAmount",
            label: "Look Amount",
            valueType: "number",
            editable: true,
            min: 0,
            max: 1.8,
            step: 0.01,
          },
          {
            key: "phonePilotPitchAmount",
            label: "Pitch Amount",
            valueType: "number",
            editable: true,
            min: 0,
            max: 1.4,
            step: 0.01,
          },
          {
            key: "phonePilotRollAmount",
            label: "Roll Amount",
            valueType: "number",
            editable: true,
            min: 0,
            max: 1,
            step: 0.01,
          },
          {
            key: "phonePilotSmoothing",
            label: "Smoothing",
            valueType: "number",
            editable: true,
            min: 1,
            max: 24,
            step: 0.5,
          },
          {
            key: "phonePilotMoveScale",
            label: "Move Scale",
            valueType: "number",
            editable: true,
            min: 0,
            max: 42,
            step: 0.25,
          },
          {
            key: "phonePilotHeightAmount",
            label: "Height Amount",
            valueType: "number",
            editable: true,
            min: 0,
            max: 2,
            step: 0.01,
          },
        ],
      },
    ],
  }),

  CharacterBody3D: createClass({
    type: "CharacterBody3D",
    label: "CharacterBody3D",
    icon: "Character",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "label", label: "Label", valueType: "text", editable: true },
          { key: "assetKey", label: "Asset", valueType: "reference" },
        ],
      },
      {
        id: "transform",
        label: "Transform",
        properties: [
          { key: "position", label: "Position", valueType: "vector3", editable: true },
          { key: "rotation", label: "Rotation", valueType: "vector3", editable: true },
          { key: "scale", label: "Scale", valueType: "vector3", editable: true, min: 0.05 },
        ],
      },
      {
        id: "resources",
        label: "Resources",
        properties: [
          { key: "modelUrl", label: "Model", valueType: "reference" },
          { key: "targetHeight", label: "Target Height", valueType: "number" },
        ],
      },
      {
        id: "physics",
        label: "Physics Body",
        properties: [
          { key: "collisionEnabled", label: "Collision Enabled", valueType: "boolean", editable: true },
          { key: "collider", label: "Collider", valueType: "object" },
        ],
      },
    ],
  }),

  MeshInstance3D: createClass({
    type: "MeshInstance3D",
    label: "MeshInstance3D",
    icon: "Mesh",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "label", label: "Label", valueType: "text", editable: true },
          { key: "assetKey", label: "Asset", valueType: "reference" },
        ],
      },
      {
        id: "transform",
        label: "Transform",
        properties: [
          { key: "position", label: "Position", valueType: "vector3", editable: true },
          { key: "rotation", label: "Rotation", valueType: "vector3", editable: true },
          { key: "scale", label: "Scale", valueType: "vector3", editable: true, min: 0.05 },
        ],
      },
      {
        id: "mesh",
        label: "Mesh Resource",
        properties: [
          { key: "primitive", label: "Primitive", valueType: "text" },
          { key: "color", label: "Fallback Color", valueType: "color" },
        ],
      },
      {
        id: "physics",
        label: "Physics Body",
        properties: [
          { key: "collisionEnabled", label: "Collision Enabled", valueType: "boolean", editable: true },
          { key: "collider", label: "Collider", valueType: "object" },
        ],
      },
    ],
  }),

  Foliage3D: createClass({
    type: "Foliage3D",
    label: "Foliage3D",
    icon: "Foliage",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "label", label: "Label", valueType: "text", editable: true },
          { key: "assetKey", label: "Asset", valueType: "reference" },
        ],
      },
      {
        id: "transform",
        label: "Transform",
        properties: [
          { key: "position", label: "Position", valueType: "vector3", editable: true },
          { key: "rotation", label: "Rotation", valueType: "vector3", editable: true },
          { key: "scale", label: "Scale", valueType: "vector3", editable: true, min: 0.05 },
        ],
      },
      {
        id: "foliage",
        label: "Foliage Resource",
        properties: [
          { key: "primitive", label: "Primitive", valueType: "text" },
          { key: "color", label: "Fallback Color", valueType: "color" },
        ],
      },
      {
        id: "physics",
        label: "Physics Body",
        properties: [
          { key: "collisionEnabled", label: "Collision Enabled", valueType: "boolean", editable: true },
          { key: "collider", label: "Collider", valueType: "object" },
        ],
      },
    ],
  }),

  LogicMarker: createClass({
    type: "LogicMarker",
    label: "LogicMarker",
    icon: "Logic",
    groups: [
      {
        id: "identity",
        label: "Identity",
        properties: [
          { key: "id", label: "ID", valueType: "reference" },
          { key: "label", label: "Label", valueType: "text", editable: true },
          { key: "assetKey", label: "Asset", valueType: "reference" },
        ],
      },
      {
        id: "transform",
        label: "Transform",
        properties: [
          { key: "position", label: "Position", valueType: "vector3", editable: true },
          { key: "rotation", label: "Rotation", valueType: "vector3", editable: true },
          { key: "scale", label: "Scale", valueType: "vector3", editable: true, min: 0.05 },
        ],
      },
    ],
  }),
};

export const getObjectClass = (type) =>
  OBJECT_CLASS_REGISTRY[type] ?? OBJECT_CLASS_REGISTRY.MeshInstance3D;

export const getEntityObjectClassType = (entity) => {
  if (entity.id === "hero" || entity.type === "character") {
    return "CharacterBody3D";
  }

  if (entity.type === "foliage") {
    return "Foliage3D";
  }

  if (entity.type === "logic") {
    return "LogicMarker";
  }

  return "MeshInstance3D";
};
