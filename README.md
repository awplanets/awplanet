# awplanet

awplanet is a source-available, AI-native 3D direction and scene creation studio
built with React, Three.js, Vite, and Electron. It combines a visual scene
editor, playable character controls, cinematic camera tools, a storyboard
timeline, terrain sculpting, object placement, and a browser-based phone pilot.

![awplanet editor](public/brand/awplanet-startup-banner.jpg)

## Highlights

- Visual 3D editor with project, character, object, world, camera, and brush tools.
- Third-person play mode, FPV camera pilot, and virtual production workflows.
- Character pose and skeletal rig controls.
- Camera presets, target locking, lens controls, recording, and timeline replay.
- Terrain sculpting and multiple world materials.
- Object placement and transform gizmos.
- Browser phone pilot with orientation tracking and a virtual movement joystick.
- Desktop packages for macOS Apple Silicon and Windows x64.

## Quick Start

Requirements:

- Node.js 20 or newer
- npm 10 or newer

```bash
git clone https://github.com/awplanets/awplanet.git
cd awplanet
npm install
npm run dev
```

Open the local URL printed by Vite.

## Desktop App

Run the Electron desktop shell locally:

```bash
npm run desktop:start
```

Build platform packages:

```bash
npm run desktop:make:mac
npm run desktop:make:windows
```

Generated packages are written to `out/make`. The macOS command currently
targets Apple Silicon (`arm64`); the Windows command targets 64-bit Windows
(`x64`).

Packaged desktop builds are also published on the GitHub Releases page.

## Phone Pilot Web

The `/phone-pilot` route is the browser-based mobile controller. It mirrors the
desktop viewport, keeps horizontal phone orientation tracking, and provides a
circular joystick for deliberate forward, backward, and lateral camera motion.
Connect and pause controls are available directly on the phone page.

Motion sensors require HTTPS on mobile browsers. For a temporary public HTTPS
URL:

```bash
brew install cloudflared
npm run phone:web
```

Open the generated URL ending in `/phone-pilot` on the phone.

For local-network HTTPS:

```bash
npm run dev:https
```

The native iOS/ARKit companion is intentionally not included in this repository.

## Project Structure

- `src/engine`: runtime state, rendering, assets, physics, and commands.
- `src/editor`: editor shell, panels, timeline, and viewport tools.
- `src/phone`: browser phone pilot interface.
- `electron`: desktop application entry point and local server.
- `server`: phone pilot synchronization middleware.
- `public`: runtime assets and third-party license files.

## Verification

```bash
npm run lint
npm run build
npm run verify:rig
```

## Contributing

Issues and focused pull requests are welcome. Keep new systems separated across
runtime, editor, and command layers, and include attribution for added assets.

## Assets

Third-party icons, models, textures, and other assets remain under their
respective licenses. Review `THIRD-PARTY-NOTICES.md` and the license files kept
beside individual asset collections before redistributing them.

## License And Commercial Use

awplanet is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE.txt). The repository may be used,
modified, and redistributed only for purposes permitted by that license.
Commercial use requires a separate written license from DynamicWang. See
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for the commercial-use and
collaboration policy.

This is a source-available project and is not distributed under an OSI-approved
open-source license.

## Copyright And Trademark

Copyright (c) 2026 DynamicWang.

Except for separately identified third-party components, the awplanet name,
logo, trademarks, original software, interface design, and related intellectual
property are owned by DynamicWang. The repository license does not grant
permission to use the awplanet name, logo, or trademarks for derived product
branding. See `LICENSE.txt`, `COMMERCIAL-LICENSE.md`, and `NOTICE.md`.
