/* eslint-disable react/prop-types */
import { Component, Suspense, useMemo, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";

import {
  applyMtlStandardMaterials,
  parseMtlColorLibrary,
} from "../engine/layers/assets/importers/renderableMaterials";
import {
  BasicPrimitiveGeometry,
  isBasicPrimitive,
} from "../engine/runtime/renderers/props/BasicPrimitiveGeometry";

const preparePreviewObject = (sourceObject) => {
  const clone = sourceObject.clone(true);
  const bounds = new THREE.Box3().setFromObject(clone);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const fitScale = 2.25 / maxDimension;

  clone.position.sub(center);
  clone.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.filter(Boolean).forEach((material) => {
      if (material.transparent || material.alphaMap) {
        material.side = THREE.DoubleSide;
        material.alphaTest = Math.max(material.alphaTest ?? 0, 0.24);
        material.depthWrite = true;
      }

      material.needsUpdate = true;
    });
  });

  return { clone, fitScale };
};

const PreviewGroup = ({ model }) => (
  <group rotation={[0.18, -0.55, 0]} scale={model.fitScale}>
    <primitive object={model.clone} />
  </group>
);

const GltfPreviewModel = ({ url }) => {
  const gltf = useLoader(GLTFLoader, url);
  const model = useMemo(() => preparePreviewObject(gltf.scene), [gltf.scene]);
  return <PreviewGroup model={model} />;
};

const ObjPreviewModel = ({ url, mtlUrl }) => {
  const mtlText = useLoader(THREE.FileLoader, mtlUrl, (loader) => {
    loader.setResponseType("text");
  });
  const obj = useLoader(OBJLoader, url);
  const colorLibrary = useMemo(() => parseMtlColorLibrary(mtlText), [mtlText]);
  const model = useMemo(
    () =>
      preparePreviewObject(
        applyMtlStandardMaterials(obj.clone(true), colorLibrary)
      ),
    [colorLibrary, obj]
  );
  return <PreviewGroup model={model} />;
};

const PreviewModel = ({ url, asset }) => {
  if (isBasicPrimitive(asset?.primitive)) {
    return (
      <mesh
        rotation={asset.primitive === "plane" ? [-Math.PI / 2, 0, 0] : [0.18, -0.55, 0]}
        scale={asset.primitive === "plane" ? 0.82 : 0.72}
      >
        <BasicPrimitiveGeometry primitive={asset.primitive} />
        <meshStandardMaterial
          color={asset.color ?? "#8d949b"}
          metalness={0.06}
          roughness={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  if (asset?.primitive === "obj") {
    return <ObjPreviewModel url={asset.url ?? url} mtlUrl={asset.mtlUrl} />;
  }

  return <GltfPreviewModel url={asset?.url ?? url} />;
};

class PreviewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn("Asset preview failed.", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

const assetAccent = (asset) => {
  if (asset?.category === "house") return ["#c5b497", "#6d5d46"];
  if (asset?.category === "interior") return ["#c8ccd0", "#5f646d"];
  if (asset?.category === "city") return ["#9aa8b5", "#394652"];
  if (asset?.category === "terrain") return ["#8ea074", "#3d5234"];
  if (asset?.category === "prop") return ["#bdb6a6", "#676154"];
  if (asset?.type === "foliage") return ["#83af6f", "#315f36"];
  return ["#aab2b8", "#444c54"];
};

const AssetPreviewFallback = ({ asset, label }) => {
  const [start, end] = assetAccent(asset);
  const shape = asset?.category ?? asset?.type ?? "object";

  return (
    <span
      className={`asset-preview__fallback asset-preview__fallback--${shape}`}
      style={{ "--asset-accent-a": start, "--asset-accent-b": end }}
    >
      <span className="asset-preview__shape" />
      <span className="asset-preview__label">{label?.slice(0, 2) ?? "3D"}</span>
    </span>
  );
};

const AssetPreviewCanvas = ({ previewUrl, label, asset }) => (
  <Canvas
    orthographic
    camera={{ position: [3.2, 2.5, 4.2], zoom: 34 }}
    dpr={[0.75, 1]}
    frameloop="demand"
    gl={{
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    }}
    shadows={false}
  >
    <color attach="background" args={["#10151b"]} />
    <ambientLight intensity={1.35} />
    <directionalLight position={[3.2, 4.5, 3.8]} intensity={2.1} />
    <directionalLight position={[-3, 1.8, -2.5]} intensity={0.45} />
    <Suspense
      fallback={
        <mesh>
          <sphereGeometry args={[0.72, 18, 18]} />
          <meshStandardMaterial color="#6f7b6b" roughness={0.9} />
        </mesh>
      }
    >
      <PreviewModel url={previewUrl} asset={asset} label={label} />
    </Suspense>
  </Canvas>
);

const AssetPreview = ({ url, label, asset, active = false }) => {
  const previewUrl = asset?.url ?? url;
  const [armed, setArmed] = useState(false);
  const shouldRenderCanvas =
    isBasicPrimitive(asset?.primitive) || active || armed;
  const fallback = <AssetPreviewFallback asset={asset} label={label} />;

  return (
    <span
      className="asset-preview"
      aria-hidden="true"
      onPointerEnter={() => setArmed(true)}
      onFocus={() => setArmed(true)}
    >
      {fallback}
      {shouldRenderCanvas && (
        <PreviewErrorBoundary fallback={fallback}>
          <AssetPreviewCanvas previewUrl={previewUrl} asset={asset} label={label} />
        </PreviewErrorBoundary>
      )}
    </span>
  );
};

export default AssetPreview;
