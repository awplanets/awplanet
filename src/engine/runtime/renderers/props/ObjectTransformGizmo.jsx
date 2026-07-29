/* eslint-disable react/prop-types */
import { TransformControls } from "@react-three/drei";
import { useEffect, useRef } from "react";

import { ENTITY_LIBRARY } from "../../../scene/createInitialScene";

const MIN_SCALE = 0.05;

const toVector = (value, fallback) =>
  Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((entry, index) =>
        Number.isFinite(Number(entry)) ? Number(entry) : fallback[index]
      )
    : [...fallback];

const clampScale = (scale) =>
  scale.map((value) => Math.max(MIN_SCALE, Math.abs(value)));

const getTransformPatch = (object, yOffset = 0) => ({
  position: [
    object.position.x,
    object.position.y - yOffset,
    object.position.z,
  ],
  rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
  scale: clampScale([object.scale.x, object.scale.y, object.scale.z]),
});

const getUniformScale = (startScale, currentScale) => {
  const ratios = currentScale.map((value, index) =>
    Math.max(MIN_SCALE, Math.abs(value)) /
    Math.max(MIN_SCALE, Math.abs(startScale[index]))
  );
  const dominantRatio = ratios.reduce((selected, ratio) =>
    Math.abs(ratio - 1) > Math.abs(selected - 1) ? ratio : selected
  , ratios[0] ?? 1);

  return startScale.map((value) =>
    Math.max(MIN_SCALE, Math.abs(value) * dominantRatio)
  );
};

export const ObjectTransformGizmo = ({
  entity,
  object,
  mode = "translate",
  onModeChange,
  onCommit,
  onInteractionStart,
  onInteractionEnd,
}) => {
  const draggingRef = useRef(false);
  const shiftPressedRef = useRef(false);
  const dragStartRef = useRef(null);
  const interactionEndRef = useRef(onInteractionEnd);
  const asset = ENTITY_LIBRARY[entity.assetKey] ?? {};
  const yOffset = asset.yOffset ?? 0;
  interactionEndRef.current = onInteractionEnd;

  useEffect(
    () => () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragStartRef.current = null;
      interactionEndRef.current?.();
    },
    []
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Shift") {
        shiftPressedRef.current = true;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const shortcutMode =
        event.key.toLowerCase() === "g"
          ? "translate"
          : event.key.toLowerCase() === "r"
            ? "rotate"
            : event.key.toLowerCase() === "s"
              ? "scale"
              : null;
      if (!shortcutMode) return;
      event.preventDefault();
      onModeChange(shortcutMode);
    };

    const handleKeyUp = (event) => {
      if (event.key === "Shift") {
        shiftPressedRef.current = false;
      }
    };
    const handleWindowBlur = () => {
      shiftPressedRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [onModeChange]);

  const beginTransform = () => {
    if (!object) return;
    draggingRef.current = true;
    dragStartRef.current = {
      position: toVector(entity.position, [0, 0, 0]),
      rotation: toVector(entity.rotation, [0, 0, 0]),
      scale: toVector(entity.scale, [1, 1, 1]),
    };
    onInteractionStart?.();
  };

  const updateTransform = () => {
    if (!object || !draggingRef.current) return;

    if (mode === "scale") {
      const scale = [object.scale.x, object.scale.y, object.scale.z];
      const nextScale =
        shiftPressedRef.current && dragStartRef.current
          ? getUniformScale(dragStartRef.current.scale, scale)
          : clampScale(scale);
      object.scale.set(nextScale[0], nextScale[1], nextScale[2]);
    }
    object.updateMatrixWorld(true);
  };

  const endTransform = () => {
    const start = dragStartRef.current;
    if (!object || !start) {
      draggingRef.current = false;
      return;
    }

    const finalPatch = getTransformPatch(object, yOffset);
    draggingRef.current = false;
    dragStartRef.current = null;
    onCommit(start, finalPatch);
    onInteractionEnd?.();
  };

  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.82}
      space={mode === "translate" ? "world" : "local"}
      onMouseDown={beginTransform}
      onMouseUp={endTransform}
      onObjectChange={updateTransform}
    />
  );
};
