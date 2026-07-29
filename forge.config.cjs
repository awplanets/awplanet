const { execFileSync } = require("node:child_process");
const {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
} = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;

function installLegalFiles(outputPath, platform) {
  const thirdPartyDir = path.join(outputPath, "THIRD-PARTY-LICENSES");
  mkdirSync(thirdPartyDir, { recursive: true });

  const electronLicense = path.join(outputPath, "LICENSE");
  if (existsSync(electronLicense)) {
    copyFileSync(
      electronLicense,
      path.join(thirdPartyDir, "Electron-LICENSE.txt"),
    );
  }

  const legalCopies = [
    ["LICENSE.txt", path.join(outputPath, "LICENSE")],
    [
      "COMMERCIAL-LICENSE.md",
      path.join(outputPath, "COMMERCIAL-LICENSE.md"),
    ],
    ["NOTICE.md", path.join(outputPath, "NOTICE.md")],
    [
      "THIRD-PARTY-NOTICES.md",
      path.join(outputPath, "THIRD-PARTY-NOTICES.md"),
    ],
    [
      "public/godot-icons/LICENSE.txt",
      path.join(thirdPartyDir, "Godot-Icons-LICENSE.txt"),
    ],
    [
      "node_modules/react/LICENSE",
      path.join(thirdPartyDir, "React-LICENSE.txt"),
    ],
    [
      "node_modules/react-dom/LICENSE",
      path.join(thirdPartyDir, "React-DOM-LICENSE.txt"),
    ],
    [
      "node_modules/three/LICENSE",
      path.join(thirdPartyDir, "Three.js-LICENSE.txt"),
    ],
    [
      "node_modules/@react-three/drei/LICENSE",
      path.join(thirdPartyDir, "React-Three-Drei-LICENSE.txt"),
    ],
    [
      "node_modules/react-device-detect/LICENSE",
      path.join(thirdPartyDir, "React-Device-Detect-LICENSE.txt"),
    ],
    [
      "third-party-licenses/Codrops-LICENSE.txt",
      path.join(thirdPartyDir, "Codrops-LICENSE.txt"),
    ],
    [
      "third-party-licenses/React-Three-Fiber-LICENSE.txt",
      path.join(thirdPartyDir, "React-Three-Fiber-LICENSE.txt"),
    ],
  ];

  for (const [source, destination] of legalCopies) {
    copyFileSync(path.join(projectRoot, source), destination);
  }

  if (platform === "darwin") {
    const appLegalDir = path.join(
      outputPath,
      "awplanet.app",
      "Contents",
      "Resources",
      "legal",
    );
    mkdirSync(appLegalDir, { recursive: true });
    copyFileSync(
      path.join(outputPath, "LICENSE"),
      path.join(appLegalDir, "LICENSE"),
    );
    copyFileSync(
      path.join(outputPath, "NOTICE.md"),
      path.join(appLegalDir, "NOTICE.md"),
    );
    copyFileSync(
      path.join(outputPath, "COMMERCIAL-LICENSE.md"),
      path.join(appLegalDir, "COMMERCIAL-LICENSE.md"),
    );
    copyFileSync(
      path.join(outputPath, "THIRD-PARTY-NOTICES.md"),
      path.join(appLegalDir, "THIRD-PARTY-NOTICES.md"),
    );
    cpSync(thirdPartyDir, path.join(appLegalDir, "THIRD-PARTY-LICENSES"), {
      recursive: true,
    });
  }
}

module.exports = {
  packagerConfig: {
    name: "awplanet",
    executableName: "awplanet",
    appBundleId: "com.awplanet.studio",
    appCategoryType: "public.app-category.graphics-design",
    appCopyright:
      "Copyright © 2026 DynamicWang. awplanet trademarks and related intellectual property are owned by DynamicWang.",
    extendInfo: {
      NSHumanReadableCopyright:
        "Copyright © 2026 DynamicWang. awplanet trademarks and brand intellectual property are owned by DynamicWang.",
    },
    asar: true,
    icon: "build/awplanet",
    ignore: [
      /^\/(?:build|docs|feature-doc-assets|ios-phone-pilot|node_modules|out|packaging|public|release|scripts|src)(?:\/|$)/,
      /^\/(?:\.DS_Store|eslint\.config\.js|index\.html|pnpm-lock\.yaml|terrain-feature-intro\.html|vite\.config\.js)$/,
    ],
  },
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      for (const outputPath of packageResult.outputPaths) {
        installLegalFiles(outputPath, packageResult.platform);
        if (packageResult.platform === "darwin") {
          execFileSync(
            "codesign",
            [
              "--force",
              "--deep",
              "--sign",
              "-",
              path.join(outputPath, "awplanet.app"),
            ],
            { stdio: "inherit" },
          );
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        name: "awplanet",
        overwrite: true,
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32"],
    },
  ],
};
