/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from "react";
import { isMobile, isTablet } from "react-device-detect";

import Scene from "./Scene";
import AssetPreview from "./components/AssetPreview";
import {
  NATURE_ASSET_BASE,
  NATURE_ASSETS,
  getNatureAssetsForTerrain,
} from "./data/natureAssets";
import {
  DEFAULT_TERRAIN_SETTINGS,
  TERRAIN_SETTING_CONTROLS,
  createInitialTerrainSettings,
} from "./data/terrainSettings";

const TERRAIN_OPTIONS = [
  { id: "snow", label: "Snow", colors: ["#f8fafc", "#b9c7d8"] },
  { id: "sand", label: "Sand", colors: ["#d8b46f", "#8b6a34"] },
  { id: "grass", label: "Grass", colors: ["#6fa24d", "#203f28"] },
  { id: "water", label: "Water", colors: ["#73d0e8", "#164c78"] },
  { id: "stone", label: "Stone", colors: ["#8b9297", "#34383d"] },
  { id: "backroom", label: "Backroom", dockLabel: "Room", colors: ["#c7b25f", "#5d5126"] },
];

const SCULPTABLE_TERRAINS = new Set(["snow", "sand", "grass", "stone"]);

const DockIcon = ({ type }) => {
  const commonProps = {
    className: "dock-button__svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (type === "prev") {
    return (
      <svg {...commonProps}>
        <path d="M15 5 8 12l7 7" />
      </svg>
    );
  }

  if (type === "next") {
    return (
      <svg {...commonProps}>
        <path d="m9 5 7 7-7 7" />
      </svg>
    );
  }

  if (type === "object") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (type === "edit") {
    return (
      <svg {...commonProps}>
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
      </svg>
    );
  }

  if (type === "brush") {
    return (
      <svg {...commonProps}>
        <path d="M7 17c2.8.8 6.2.8 10 0" />
        <path d="M9 14h6" />
        <path d="M10 11h4" />
        <path d="M12 4v7" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
};

function App() {
  const tutorialRef = useRef(null);
  const [terrain, setTerrain] = useState("snow");
  const [terrainPanelOpen, setTerrainPanelOpen] = useState(false);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [objectEditorOpen, setObjectEditorOpen] = useState(false);
  const [selectedAssetKey, setSelectedAssetKey] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [placedObjects, setPlacedObjects] = useState([]);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [brushPanelOpen, setBrushPanelOpen] = useState(false);
  const [brushMode, setBrushMode] = useState("raise");
  const [brushSize, setBrushSize] = useState(12);
  const [terrainSettings, setTerrainSettings] = useState(
    createInitialTerrainSettings
  );

  const selectedTerrain = useMemo(
    () => TERRAIN_OPTIONS.find((option) => option.id === terrain),
    [terrain]
  );
  const terrainAssets = useMemo(() => getNatureAssetsForTerrain(terrain), [terrain]);
  const selectedAsset = selectedAssetKey ? NATURE_ASSETS[selectedAssetKey] : null;
  const isBrushTerrain = SCULPTABLE_TERRAINS.has(terrain);
  const selectedObject = useMemo(
    () =>
      placedObjects.find(
        (object) => object.id === selectedObjectId && object.terrain === terrain
      ) ?? null,
    [placedObjects, selectedObjectId, terrain]
  );
  const terrainControls = TERRAIN_SETTING_CONTROLS[terrain] ?? [];
  const currentTerrainSettings =
    terrainSettings[terrain] ?? DEFAULT_TERRAIN_SETTINGS[terrain] ?? {};

  const handlePlaceObject = (placement) => {
    setPlacedObjects((objects) => [
      ...objects,
      {
        ...placement,
        id: `${placement.assetKey}-${Date.now()}-${objects.length}`,
      },
    ]);
  };

  const getObjectBaseScale = (object) => {
    if (object.baseScale) return object.baseScale;
    if (Array.isArray(object.scale)) {
      return Math.max(object.scale[0], object.scale[1], object.scale[2], 0.001);
    }
    return object.scale || NATURE_ASSETS[object.assetKey]?.scale || 1;
  };

  const getObjectScaleAxes = (object) => {
    if (object.scaleAxes) return object.scaleAxes;

    if (Array.isArray(object.scale)) {
      const baseScale = getObjectBaseScale(object);
      return {
        x: object.scale[0] / baseScale,
        y: object.scale[1] / baseScale,
        z: object.scale[2] / baseScale,
      };
    }

    return { x: 1, y: 1, z: 1 };
  };

  const getObjectBaseCollider = (object) => {
    if (object.baseCollider) return object.baseCollider;

    const axes = getObjectScaleAxes(object);
    const collider = object.collider ?? NATURE_ASSETS[object.assetKey]?.collider;

    if (!collider) return null;

    return {
      x: collider.x / Math.max(axes.x, 0.001),
      z: collider.z / Math.max(axes.z, 0.001),
      height: (collider.height ?? 2) / Math.max(axes.y, 0.001),
    };
  };

  const updateSelectedObjectScale = (axis, value) => {
    setPlacedObjects((objects) =>
      objects.map((object) => {
        if (object.id !== selectedObjectId) return object;

        const baseScale = getObjectBaseScale(object);
        const previousAxes = getObjectScaleAxes(object);
        const scaleAxes = {
          ...previousAxes,
          [axis]: Number(value),
        };
        const baseCollider = getObjectBaseCollider(object);

        return {
          ...object,
          baseScale,
          scaleAxes,
          scale: [
            baseScale * scaleAxes.x,
            baseScale * scaleAxes.y,
            baseScale * scaleAxes.z,
          ],
          baseCollider,
          collider: baseCollider
            ? {
                x: baseCollider.x * scaleAxes.x,
                z: baseCollider.z * scaleAxes.z,
                height: baseCollider.height * scaleAxes.y,
              }
            : object.collider,
        };
      })
    );
  };

  const updateSelectedObjectRotation = (degrees) => {
    setPlacedObjects((objects) =>
      objects.map((object) => {
        if (object.id !== selectedObjectId) return object;

        const rotation = object.rotation ?? [0, 0, 0];

        return {
          ...object,
          rotation: [
            rotation[0] ?? 0,
            (Number(degrees) * Math.PI) / 180,
            rotation[2] ?? 0,
          ],
        };
      })
    );
  };

  const selectRelativeTerrain = (step) => {
    const currentIndex = TERRAIN_OPTIONS.findIndex((option) => option.id === terrain);
    const nextIndex =
      (currentIndex + step + TERRAIN_OPTIONS.length) % TERRAIN_OPTIONS.length;
    setTerrain(TERRAIN_OPTIONS[nextIndex].id);
  };

  const handleRelativeTerrainClick = (event, step) => {
    event.preventDefault();
    event.stopPropagation();

    if (!event.currentTarget.contains(event.target)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dockBandTop = window.innerHeight - Math.max(132, rect.height + 42);
    if (event.clientY < dockBandTop) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height, 72) / 2;
    if (Math.hypot(event.clientX - centerX, event.clientY - centerY) > radius) {
      return;
    }

    selectRelativeTerrain(step);
  };

  const updateTerrainSetting = (key, value) => {
    setTerrainSettings((settings) => ({
      ...settings,
      [terrain]: {
        ...(settings[terrain] ?? DEFAULT_TERRAIN_SETTINGS[terrain]),
        [key]: value,
      },
    }));
  };

  const resetTerrainSettings = () => {
    setTerrainSettings((settings) => ({
      ...settings,
      [terrain]: { ...DEFAULT_TERRAIN_SETTINGS[terrain] },
    }));
  };

  useEffect(() => {
    if (!selectedAssetKey) return;
    if (!terrainAssets.includes(selectedAssetKey)) {
      setSelectedAssetKey(null);
    }
  }, [selectedAssetKey, terrainAssets]);

  useEffect(() => {
    if (!selectedObjectId) return;
    if (!selectedObject) {
      setSelectedObjectId(null);
    }
  }, [selectedObject, selectedObjectId]);

  useEffect(() => {
    if (!isBrushTerrain) {
      setBrushPanelOpen(false);
    }
  }, [isBrushTerrain]);

  useEffect(() => {
    const hideTutorial = () => {
      tutorialRef.current.style.display = "none";
    };

    document.addEventListener("touchstart", hideTutorial);
    document.addEventListener("keydown", hideTutorial);

    return () => {
      document.removeEventListener("touchstart", hideTutorial);
      document.removeEventListener("keydown", hideTutorial);
    };
  }, []);

  useEffect(() => {
    const handleTerrainShortcut = (event) => {
      const terrainIndex = Number(event.key) - 1;

      if (terrainIndex >= 0 && terrainIndex < TERRAIN_OPTIONS.length) {
        setTerrain(TERRAIN_OPTIONS[terrainIndex].id);
      }
    };

    document.addEventListener("keydown", handleTerrainShortcut);

    return () => {
      document.removeEventListener("keydown", handleTerrainShortcut);
    };
  }, []);

  return (
    <div className="canvas-wrapper">
      <Scene
        terrain={terrain}
        terrainSettings={terrainSettings}
        selectedAssetKey={selectedAssetKey}
        placedObjects={placedObjects}
        onPlaceObject={handlePlaceObject}
        objectEditMode={objectEditorOpen}
        selectedObjectId={selectedObjectId}
        onSelectObject={setSelectedObjectId}
        brushEnabled={brushPanelOpen && isBrushTerrain}
        brushMode={brushMode}
        brushSize={brushSize}
      />

      <div ref={tutorialRef} className="tutorial-wrapper">
        {isTablet || isMobile ? (
          <span className="mobile-tutorial">
            Touch and drag on the screen to navigate the character.
          </span>
        ) : (
          <div className="tutorial-keys">
            <div className="tutorial-card">
              <div className="tutorial-card__title">Controls</div>

              <div className="tutorial-card__groups">
                <section className="tutorial-control">
                  <strong>WASD</strong>
                  <div className="key-grid wasd-keys" aria-hidden="true">
                    <span>W</span>
                    <span>A</span>
                    <span>S</span>
                    <span>D</span>
                  </div>
                  <dl>
                    <div>
                      <dt>W</dt>
                      <dd>前进</dd>
                    </div>
                    <div>
                      <dt>A</dt>
                      <dd>左移</dd>
                    </div>
                    <div>
                      <dt>S</dt>
                      <dd>后退</dd>
                    </div>
                    <div>
                      <dt>D</dt>
                      <dd>右移</dd>
                    </div>
                  </dl>
                </section>

                <section className="tutorial-control">
                  <strong>Arrow Keys</strong>
                  <div className="key-grid arrow-keys" aria-hidden="true">
                    <span>&uarr;</span>
                    <span>&larr;</span>
                    <span>&darr;</span>
                    <span>&rarr;</span>
                  </div>
                  <dl>
                    <div>
                      <dt>↑</dt>
                      <dd>前进</dd>
                    </div>
                    <div>
                      <dt>←</dt>
                      <dd>左移</dd>
                    </div>
                    <div>
                      <dt>↓</dt>
                      <dd>后退</dd>
                    </div>
                    <div>
                      <dt>→</dt>
                      <dd>右移</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <div className="tutorial-card__actions">
                <section className="tutorial-action">
                  <div className="key-combo" aria-hidden="true">
                    <span>S</span>
                    <span>S</span>
                  </div>
                  <div>
                    <strong>后跳</strong>
                    <span>站立时连续按两下 S</span>
                  </div>
                </section>

                <section className="tutorial-action tutorial-action--wide">
                  <span className="space-key" aria-hidden="true">Space</span>
                  <div>
                    <strong>跳跃</strong>
                    <span>移动时向前跳，奔跑时奔跑跳</span>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`terrain-ui ${chromeHidden ? "is-hidden" : ""}`}>
        {!chromeHidden && (
          <>
            {terrainPanelOpen && (
              <div className="terrain-panel is-open" aria-hidden={false}>
                <div className="terrain-panel__header">
                  <span>Terrain</span>
                  <strong>{selectedTerrain.label}</strong>
                </div>

                <div className="terrain-panel__grid">
                  {TERRAIN_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      className={`terrain-swatch ${
                        terrain === option.id ? "is-active" : ""
                      } material-orb--${option.id}`}
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setTerrain(option.id);
                      }}
                      aria-label={`Set terrain to ${option.label}`}
                    >
                      <span
                        className="terrain-swatch__icon"
                        style={{
                          "--swatch-a": option.colors[0],
                          "--swatch-b": option.colors[1],
                        }}
                      />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>

                <div className="terrain-panel__section">
                  <div className="terrain-panel__subhead">
                    <span>Material Settings</span>
                    <button type="button" onClick={resetTerrainSettings}>
                      Reset
                    </button>
                  </div>

                  <div className="terrain-editor__list">
                    {terrainControls.map((control) => {
                      const value = currentTerrainSettings[control.key] ?? 1;

                      return (
                        <label className="terrain-slider" key={control.key}>
                          <span className="terrain-slider__top">
                            <span>{control.label}</span>
                            <strong>{value.toFixed(2)}</strong>
                          </span>
                          <input
                            type="range"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            value={value}
                            onChange={(event) =>
                              updateTerrainSetting(
                                control.key,
                                Number(event.target.value)
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {assetPanelOpen && (
              <div className="asset-panel is-open" aria-hidden={false}>
                <div className="terrain-panel__header">
                  <span>Objects</span>
                  <strong>{selectedAsset?.label ?? "None"}</strong>
                </div>

                <div className="asset-panel__grid">
                  {terrainAssets.length === 0 ? (
                    <span className="asset-panel__empty">No objects</span>
                  ) : (
                    terrainAssets.map((assetKey) => {
                      const asset = NATURE_ASSETS[assetKey];

                      return (
                        <button
                          key={assetKey}
                          className={`asset-button ${
                            selectedAssetKey === assetKey ? "is-active" : ""
                          }`}
                          type="button"
                          onClick={() =>
                            setSelectedAssetKey((current) =>
                              current === assetKey ? null : assetKey
                            )
                          }
                          aria-label={`Select ${asset.label}`}
                        >
                          {assetPanelOpen && (
                            <AssetPreview
                              url={`${NATURE_ASSET_BASE}${asset.file}`}
                              label={asset.label}
                              active={selectedAssetKey === assetKey}
                            />
                          )}
                          <span>{asset.label}</span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="asset-panel__actions">
                  <button type="button" onClick={() => setSelectedAssetKey(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPlacedObjects((objects) =>
                        objects.filter((object) => object.terrain !== terrain)
                      )
                    }
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {objectEditorOpen && (
              <div className="object-editor-panel is-open" aria-hidden={false}>
                <div className="terrain-panel__header">
                  <span>Edit Object</span>
                  <strong>
                    {selectedObject
                      ? NATURE_ASSETS[selectedObject.assetKey]?.label
                      : "Select"}
                  </strong>
                </div>

                {selectedObject ? (
                  <div className="terrain-editor__list">
                    <label className="terrain-slider">
                      <span className="terrain-slider__top">
                        <span>Y Rotation</span>
                        <strong>
                          {(
                            ((((selectedObject.rotation?.[1] ?? 0) * 180) /
                              Math.PI) %
                              360 +
                              360) %
                            360
                          ).toFixed(0)}
                          °
                        </strong>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={
                          ((((selectedObject.rotation?.[1] ?? 0) * 180) /
                            Math.PI) %
                            360 +
                            360) %
                          360
                        }
                        onChange={(event) =>
                          updateSelectedObjectRotation(event.target.value)
                        }
                      />
                    </label>

                    {["x", "y", "z"].map((axis) => {
                      const scaleAxes = getObjectScaleAxes(selectedObject);
                      const value = scaleAxes[axis] ?? 1;

                      return (
                        <label className="terrain-slider" key={axis}>
                          <span className="terrain-slider__top">
                            <span>{axis.toUpperCase()} Scale</span>
                            <strong>{value.toFixed(2)}</strong>
                          </span>
                          <input
                            type="range"
                            min="0.25"
                            max="3"
                            step="0.05"
                            value={value}
                            onChange={(event) =>
                              updateSelectedObjectScale(axis, event.target.value)
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="object-editor__empty">Click an object</div>
                )}

                <div className="asset-panel__actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedObject) return;
                      ["x", "y", "z"].forEach((axis) =>
                        updateSelectedObjectScale(axis, 1)
                      );
                    }}
                    disabled={!selectedObject}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setObjectEditorOpen(false);
                      setSelectedObjectId(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {brushPanelOpen && isBrushTerrain && (
              <div className="brush-panel is-open" aria-hidden={false}>
                <div className="terrain-panel__header">
                  <span>Terrain Brush</span>
                  <strong>{brushMode === "raise" ? "Raise" : "Lower"}</strong>
                </div>

                <div className="brush-mode-toggle">
                  <button
                    className={brushMode === "raise" ? "is-active" : ""}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setBrushMode("raise");
                    }}
                  >
                    Raise
                  </button>
                  <button
                    className={brushMode === "lower" ? "is-active" : ""}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setBrushMode("lower");
                    }}
                  >
                    Lower
                  </button>
                </div>

                <label className="terrain-slider">
                  <span className="terrain-slider__top">
                    <span>Brush Size</span>
                    <strong>{brushSize.toFixed(0)}</strong>
                  </span>
                  <input
                    type="range"
                    min="5"
                    max="34"
                    step="1"
                    value={brushSize}
                    onChange={(event) => setBrushSize(Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            <div className="terrain-status">
              <span>Material</span>
              <strong>{selectedTerrain.label}</strong>
            </div>

            <nav className="terrain-dock" aria-label="Terrain controls">
              <button
                className="dock-button"
                type="button"
                onClick={(event) => handleRelativeTerrainClick(event, -1)}
                aria-label="Previous terrain"
              >
                <span className="dock-button__icon">
                  <DockIcon type="prev" />
                </span>
                <span>Prev</span>
              </button>

              <button
                className={`dock-button dock-button--primary material-orb--${terrain}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTerrainPanelOpen((open) => !open);
                }}
                aria-label={`Current terrain ${selectedTerrain.label}`}
              >
                <span className="dock-button__icon">
                  <span
                    className="dock-button__swatch"
                    style={{
                      "--swatch-a": selectedTerrain.colors[0],
                      "--swatch-b": selectedTerrain.colors[1],
                    }}
                  />
                </span>
                <span>{selectedTerrain.dockLabel ?? selectedTerrain.label}</span>
              </button>

              <button
                className="dock-button"
                type="button"
                onClick={(event) => handleRelativeTerrainClick(event, 1)}
                aria-label="Next terrain"
              >
                <span className="dock-button__icon">
                  <DockIcon type="next" />
                </span>
                <span>Next</span>
              </button>

              <button
                className={`dock-button ${assetPanelOpen ? "is-active" : ""}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setAssetPanelOpen((open) => !open);
                  setBrushPanelOpen(false);
                  setObjectEditorOpen(false);
                  setSelectedObjectId(null);
                }}
                aria-label="Toggle object panel"
              >
                <span className="dock-button__icon">
                  <DockIcon type="object" />
                </span>
                <span>Obj</span>
              </button>

              <button
                className={`dock-button ${objectEditorOpen ? "is-active" : ""}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const nextOpen = !objectEditorOpen;
                  setObjectEditorOpen(nextOpen);
                  if (!nextOpen) setSelectedObjectId(null);
                  setSelectedAssetKey(null);
                  setAssetPanelOpen(false);
                  setBrushPanelOpen(false);
                }}
                aria-label="Toggle object editor"
              >
                <span className="dock-button__icon">
                  <DockIcon type="edit" />
                </span>
                <span>Edit</span>
              </button>

              <button
                className={`dock-button ${brushPanelOpen ? "is-active" : ""}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setBrushPanelOpen((open) => (isBrushTerrain ? !open : false));
                  setAssetPanelOpen(false);
                  setObjectEditorOpen(false);
                  setSelectedAssetKey(null);
                  setSelectedObjectId(null);
                }}
                aria-label="Toggle terrain brush"
                disabled={!isBrushTerrain}
              >
                <span className="dock-button__icon">
                  <DockIcon type="brush" />
                </span>
                <span>Brush</span>
              </button>

              <button
                className="dock-button"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setChromeHidden(true);
                  setTerrainPanelOpen(false);
                  setAssetPanelOpen(false);
                  setObjectEditorOpen(false);
                  setBrushPanelOpen(false);
                }}
                aria-label="Hide controls"
              >
                <span className="dock-button__icon">
                  <DockIcon type="hide" />
                </span>
                <span>Hide</span>
              </button>
            </nav>
          </>
        )}

        {chromeHidden && (
          <button
            className="restore-button"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setChromeHidden(false);
            }}
            aria-label="Show terrain controls"
          >
            ≋
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
