# awplanet Desktop

The desktop build embeds the production renderer and the Phone Pilot LAN service in
one Electron application. No separate terminal or local web server is required.

## Local development

```bash
npm install
npm run dev
```

The existing browser workflow remains available at the Vite URL.

## Run the desktop app

```bash
npm run desktop:start
```

## Create distributable builds

On macOS:

```bash
npm run desktop:make
```

Artifacts are written to `out/make`. The DMG is convenient for testers and the ZIP
is suitable for GitHub Releases.

Windows builds should be created on Windows:

```powershell
npm install
npm run desktop:make
```

The current cross-platform maker emits a ZIP containing `awplanet.exe`. A signed
installer can be added on a Windows build runner when the project has Windows
signing credentials.

## Signing

Unsigned macOS builds may show a Gatekeeper warning on another Mac. Public releases
should use an Apple Developer ID certificate and notarization. Keep signing secrets
in CI environment variables; never commit certificates or passwords.
