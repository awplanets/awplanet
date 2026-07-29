# Godot-Inspired Engine Alignment

This engine should borrow Godot's proven architecture shape while keeping the current
Three.js runtime, bottom dock UI, right-side panel stack, and Codex command workflow.

Godot source reference in this workspace:

- `/Users/awplanet/Desktop/CodeX/game/godot-master/core`
- `/Users/awplanet/Desktop/CodeX/game/godot-master/scene`
- `/Users/awplanet/Desktop/CodeX/game/godot-master/servers`
- `/Users/awplanet/Desktop/CodeX/game/godot-master/editor`
- `/Users/awplanet/Desktop/CodeX/game/godot-master/modules`

Godot is MIT licensed. If code is copied directly, preserve Godot's copyright and
license notice. Prefer borrowing architecture and behavior contracts first.

## Direction

The goal is not to recreate Godot's desktop editor UI. The goal is to make a more
direct, visual, AI-native game demo engine:

- Godot-like completeness under the hood.
- Current visual language and bottom dock preserved.
- Right detail panels remain the main editing surface.
- Codex/API commands operate on stable engine capabilities, not ad hoc Three.js code.
- Imported assets, terrain, scene nodes, inspectors, commands, and save/load use one
  consistent schema.

## Architecture Mapping

| Godot Area | Godot Role | Our Web/Three Equivalent |
| --- | --- | --- |
| `core/object`, `core/variant` | Base object model, reflection, typed properties | `engine/object`: typed object registry, property schema, serialization |
| `scene/main/node.*` | Node tree, parent/child lifecycle | `engine/scene`: scene graph nodes, lifecycle hooks |
| `scene/3d/node_3d.*` | 3D transform hierarchy | `Node3D`, `MeshInstance3D`, `Camera3D`, `Light3D`, `Terrain3D` descriptors |
| `scene/resources` | Reusable resources/materials/meshes | `engine/resources`: materials, textures, models, animations, terrain presets |
| `servers/rendering` | Rendering backend abstraction | Three.js renderer adapters under `engine/runtime/renderers` |
| `servers/physics_3d` | Physics simulation abstraction | Physics service adapter, initially height/collider queries, later Rapier/Ammo |
| `editor/inspector` | Property editing from reflection | Right detail panel generated from property schemas |
| `editor/plugins` | Extensible editor tools | Tool registry for Terrain, Objects, Brush, AI, Animation, Lighting |
| `editor/import` + `modules/gltf/fbx` | Asset import and validation | Existing asset pipeline expanded into import jobs, previews, warnings |
| `editor/docks` | Organized editor panels | Existing dock + stacked right panels |
| `editor/run` | Play/debug loop | Runtime mode, preview mode, pause/step, profiling hooks |

## Target Module Layout

```text
src/engine/
  object/
    objectClassRegistry.js
    propertySchema.js
    serialization.js
  scene/
    nodeTypes.js
    sceneDocument.js
    sceneQueries.js
    sceneSerialization.js
  resources/
    resourceRegistry.js
    materialResources.js
    modelResources.js
    animationResources.js
    terrainResources.js
  services/
    renderService.js
    physicsService.js
    inputService.js
    navigationService.js
    assetImportService.js
  editor/
    toolRegistry.js
    inspectorSchemaAdapter.js
    selectionService.js
    gizmoService.js
  layers/
    commands/
    assets/
    runtime/
```

The existing files do not need to be thrown away. They should be folded into this
shape gradually.

## First Principles

1. Everything editable is a node or resource.
2. Every node/resource exposes a property schema.
3. The inspector UI is generated from schemas, then styled with our current panels.
4. Commands are the only mutation path.
5. Commands are undoable by default.
6. Importers produce validated engine resources, never raw random objects.
7. Runtime renderers read scene documents and resources; they do not own editor state.
8. AI/Codex uses the same public command capability manifest as the UI.

## Node Types To Add First

- `Node`
- `Node3D`
- `CharacterBody3D`
- `MeshInstance3D`
- `Terrain3D`
- `Camera3D`
- `DirectionalLight3D`
- `Environment3D`
- `WaterSurface3D`
- `GrassField3D`
- `Collider3D`
- `AnimationPlayer`

Each type needs:

- `type`
- `label`
- `parentId`
- `children`
- `properties`
- `resources`
- `editor`
- `runtime`

## Resource Types To Add First

- `MaterialResource`
- `TextureResource`
- `ModelResource`
- `AnimationResource`
- `TerrainMaterialResource`
- `TerrainHeightResource`
- `ColliderResource`
- `PrefabResource`

Resources should be reusable across scenes. Scene nodes reference resources by id.

## Editor Features Required For Godot-Level Completeness

Short term:

- Scene tree panel.
- Selection system that can select any node.
- Schema-driven inspector.
- Add node/resource menu.
- Command history panel.
- Save/load scene JSON.
- Asset import jobs with validation report.
- Node transform gizmo.

Medium term:

- Prefabs/scenes-as-resources.
- Animation state graph.
- Terrain material layers.
- Physics adapter with collision shapes.
- Play mode vs edit mode separation.
- Project settings and input map.
- Command palette for UI and Codex.
- Resource dependency graph.

Long term:

- Plugin system.
- Visual scripting / behavior graph.
- Navigation mesh.
- Lighting probes/reflection probes.
- Particles.
- Export pipeline.
- Multiplayer/network abstraction.
- Profiler/debugger.

## UI Rule

The UI should not become Godot's UI. Godot's architecture can be deep; this editor
should feel simpler:

- Bottom dock remains the primary mode switcher.
- Right panel stack contains details and second-level menus.
- Scene tree and inspector should be compact, visual, and schema-driven.
- Asset cards use previews, not file-name lists.
- AI command panel can generate, preview, run, undo, and explain commands.

## Next Implementation Slice

Build the object/schema foundation:

1. Add `objectClassRegistry`.
2. Add `propertySchema`.
3. Convert current terrain/entity data into node/resource descriptors.
4. Generate inspector controls from schema instead of hand-writing each panel.
5. Extend command bus to validate commands against schema before mutation.
6. Add save/load scene document.

This gives the engine the same skeleton as Godot: object model, scene tree,
resources, inspector, commands, and runtime adapters.
