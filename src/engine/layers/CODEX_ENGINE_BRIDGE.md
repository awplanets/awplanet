# Codex Engine Bridge

This project should be controlled through engine capabilities, not by asking an agent to generate a new ad hoc Three.js scene.

## Principle

Codex/API clients should:

1. Inspect the scene and asset registry.
2. Choose an existing engine capability.
3. Emit structured commands.
4. Let the command bus mutate runtime state.
5. Let renderer systems display the result.

## Current Callable Surface

The current command surface is defined in:

- `src/engine/layers/commands/engineCapabilities.js`
- `src/engine/layers/commands/commandBus.js`

The current asset import surface is defined in:

- `src/engine/layers/assets/importers/characterImporter.js`
- `src/engine/layers/assets/importers/propImporter.js`
- `src/engine/layers/assets/importers/importValidation.js`

## Why This Matters

The goal is for Codex or an API client to quickly create a playable game demo by composing stable engine abilities:

- switch terrain
- tune terrain parameters
- import/validate assets
- spawn scene entities
- transform objects
- inspect validation reports
- preview command batches
- undo and redo engine transactions
- drive character and gameplay systems

This avoids rebuilding rough one-off scenes from scratch.
