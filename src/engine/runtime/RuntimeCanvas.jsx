/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";

import { useEngine } from "../core/useEngine";
import { getActiveScene } from "../scene/createInitialScene";
import { RuntimeAssetPreloader } from "./renderers/assets/RuntimeAssetPreloader";
import { RuntimeSceneRenderer } from "./renderers/RuntimeSceneRenderer";

export const RuntimeCanvas = ({ profile = "desktop" } = {}) => {
  const { engineState, runCommand } = useEngine();
  const [contextVersion, setContextVersion] = useState(0);
  const recoveryTimeoutRef = useRef(null);
  const isPhoneProfile =
    profile === "phone" ||
    (typeof window !== "undefined" && window.location.pathname === "/phone-pilot");
  const activeScene = getActiveScene(engineState.scene);
  const editorSelectionEnabled =
    !isPhoneProfile &&
    engineState.mode === "select" &&
    !activeScene.camera?.phonePilotEnabled;

  useEffect(() => {
    document.body.dataset.runtimeCanvasMounted = "true";
    return () => {
      window.clearTimeout(recoveryTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const refreshRuntimeCanvas = () => {
      document.body.dataset.runtimeCanvasManualRefreshAt = String(Date.now());
      setContextVersion((version) => version + 1);
    };

    window.addEventListener(
      "awplanet:refresh-runtime-canvas",
      refreshRuntimeCanvas
    );
    return () => {
      window.removeEventListener(
        "awplanet:refresh-runtime-canvas",
        refreshRuntimeCanvas
      );
    };
  }, []);

  const handleCreated = useCallback(
    ({ gl, size }) => {
      const canvas = gl.domElement;
      const handleContextLost = (event) => {
        event.preventDefault();
        window.clearTimeout(recoveryTimeoutRef.current);
        document.body.dataset.runtimeContextLost = "true";
        document.body.dataset.runtimeContextLostAt = String(Date.now());
        document.body.dataset.runtimeContextLostCount = String(
          Number(document.body.dataset.runtimeContextLostCount ?? 0) + 1
        );
        window.dispatchEvent(
          new CustomEvent("awplanet:runtime-context-lost", {
            detail: { profile: isPhoneProfile ? "phone" : "desktop" },
          })
        );
        recoveryTimeoutRef.current = window.setTimeout(() => {
          if (document.body.dataset.runtimeContextLost === "true") {
            document.body.dataset.runtimeContextForcedRemountAt = String(Date.now());
            setContextVersion((version) => version + 1);
          }
        }, 2000);
      };
      const handleContextRestored = () => {
        window.clearTimeout(recoveryTimeoutRef.current);
        recoveryTimeoutRef.current = null;
        document.body.dataset.runtimeContextLost = "false";
        document.body.dataset.runtimeContextRestoredAt = String(Date.now());
        document.body.dataset.runtimeContextRestoredCount = String(
          Number(document.body.dataset.runtimeContextRestoredCount ?? 0) + 1
        );
        window.dispatchEvent(
          new CustomEvent("awplanet:runtime-context-restored", {
            detail: { profile: isPhoneProfile ? "phone" : "desktop" },
          })
        );
      };

      canvas.addEventListener("webglcontextlost", handleContextLost, false);
      canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

      document.body.dataset.runtimeContextLost = "false";
      document.body.dataset.runtimeCanvasCreated = JSON.stringify({
        width: size.width,
        height: size.height,
        profile: isPhoneProfile ? "phone" : "desktop",
        contextLost: gl.getContext().isContextLost(),
      });
    },
    [isPhoneProfile]
  );

  return (
    <Canvas
      key={`ai-native-runtime-renderer-systems-v1-${contextVersion}`}
      shadows={!isPhoneProfile}
      camera={{ position: [0, 20, 30], fov: 44 }}
      dpr={isPhoneProfile ? [0.45, 0.65] : [1, 1.2]}
      gl={{
        antialias: false,
        alpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      }}
      resize={{ debounce: 80 }}
      style={{ width: "100%", height: "100%" }}
      onCreated={handleCreated}
      onPointerMissed={() => {
        if (!editorSelectionEnabled || !activeScene.selectedEntityId) return;
        runCommand({ type: "select-entity", entityId: null });
      }}
    >
      <RuntimeAssetPreloader includeOptional={!isPhoneProfile} />
      <RuntimeSceneRenderer profile={isPhoneProfile ? "phone" : "desktop"} />
    </Canvas>
  );
};
