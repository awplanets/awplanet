import { useEffect, useRef, useState } from "react";

import {
  setRuntimePhonePilotEnabled,
  setRuntimePhonePilotFrame,
  setRuntimePhonePilotSettings,
} from "../engine/runtime/phonePilotRuntime";
import { runtimeCameraState } from "../engine/runtime/runtimeCameraState";

const DEFAULT_STATUS = {
  urls: [],
  connected: false,
  frame: null,
  settings: null,
  ageMs: null,
  updatedAt: 0,
  bridgeAvailable: false,
};

export const usePhonePilotReceiver = (enabled, sceneState = null) => {
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const connectedRef = useRef(false);

  useEffect(() => {
    setRuntimePhonePilotEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;

    const loadHostInfo = async () => {
      try {
        const response = await fetch("/__phone-pilot/host", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Phone Pilot bridge unavailable.");
        const data = await response.json();
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          urls: Array.isArray(data.urls) ? data.urls : [],
          bridgeAvailable: true,
        }));
      } catch {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          bridgeAvailable: false,
        }));
      }
    };

    loadHostInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !sceneState) return undefined;

    const controller = new AbortController();
    const serializedScene = JSON.stringify({
      scene: sceneState,
      cameraPose:
        runtimeCameraState.phonePilotStartPose ?? runtimeCameraState.pose,
    });
    const syncScene = () => {
      fetch("/__phone-pilot/scene", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: serializedScene,
        signal: controller.signal,
      }).catch(() => {
        if (controller.signal.aborted) return;
        setStatus((current) => ({
          ...current,
          bridgeAvailable: false,
        }));
      });
    };

    const timeout = window.setTimeout(syncScene, 40);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [enabled, sceneState]);

  useEffect(() => {
    if (!enabled) {
      connectedRef.current = false;
      setRuntimePhonePilotFrame({
        connected: false,
        frame: null,
        ageMs: null,
        updatedAt: 0,
      });
      return undefined;
    }

    let cancelled = false;
    let timeout = 0;
    let lastUiUpdateAt = 0;

    const poll = async () => {
      try {
        const response = await fetch("/__phone-pilot/state", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Phone Pilot state unavailable.");
        const data = await response.json();
        if (cancelled) return;
        const nextStatus = {
          urls: status.urls,
          bridgeAvailable: true,
          connected: Boolean(data.connected),
          frame: data.frame
            ? {
                ...data.frame,
                sessionId:
                  typeof data.sessionId === "string"
                    ? data.sessionId
                    : null,
              }
            : null,
          settings: data.settings ?? null,
          ageMs: data.ageMs ?? null,
          updatedAt: data.updatedAt ?? 0,
        };
        setRuntimePhonePilotFrame(nextStatus);
        if (nextStatus.settings) {
          setRuntimePhonePilotSettings({
            phonePilotMoveScale: Number(nextStatus.settings.phonePilotMoveScale),
          });
        }
        const now = performance.now();
        if (now - lastUiUpdateAt > 250 || nextStatus.connected !== connectedRef.current) {
          lastUiUpdateAt = now;
          connectedRef.current = nextStatus.connected;
          setStatus((current) => ({
            ...current,
            ...nextStatus,
            urls: current.urls,
          }));
        }
      } catch {
        if (cancelled) return;
        connectedRef.current = false;
        setRuntimePhonePilotFrame({
          connected: false,
          frame: null,
          ageMs: null,
          updatedAt: 0,
        });
        setStatus((current) => ({
          ...current,
          connected: false,
          bridgeAvailable: false,
        }));
      }
      if (!cancelled) {
        timeout = window.setTimeout(poll, 16);
      }
    };

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [enabled, status.urls]);

  return status;
};
