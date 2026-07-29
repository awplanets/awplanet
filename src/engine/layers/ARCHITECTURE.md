# AI Native Engine Layers

The engine is split into three layers that can evolve independently:

1. Runtime layer
   - Owns scene state, entities, transforms, active scene lookup, and scene mutation helpers.
   - Does not know about React, Three.js components, or editor UI.

2. Asset pipeline layer
   - Owns terrain, prop, and character asset manifests.
   - Normalizes imported assets into engine-ready definitions.
   - Owns importers for FBX characters and GLTF props.
   - Importers clone renderable objects, prepare materials, measure bounds, center assets, ground assets, and attach import metadata.
   - This is where future validation, retargeting, thumbnails, caching, and asset versioning should live.

3. Command layer
   - Owns structured commands used by UI controls and AI prompts.
   - Converts intent into deterministic engine mutations.
   - Keeps every operation explicit so undo/redo and AI safety can be added later.
   - Exposes a capability manifest so Codex/API clients can call engine abilities instead of generating ad hoc scenes.

The current React editor and Three.js canvas are consumers of these layers, not the engine core.

## Godot Alignment

The next architecture phase should keep this three-layer split, then expand it with
Godot-inspired concepts:

- Object and property schema registry.
- Scene tree made from typed nodes.
- Reusable resources for materials, textures, models, animations, and terrain.
- Runtime services for rendering, physics, input, navigation, and asset importing.
- Editor tool registry for dock buttons and right-side detail panels.
- Schema-driven inspector so new node/resource types become editable automatically.

See `GODOT_ALIGNMENT.md` for the detailed mapping from Godot's `core`, `scene`,
`servers`, `editor`, and `modules` folders into this Three.js/Codex engine.
