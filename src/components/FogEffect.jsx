/* eslint-disable react/prop-types */
import { extend } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import * as THREE from "three";

const FogMaterial = shaderMaterial(
  {
    uCenter: new THREE.Vector2(0.5, 0.5),
    uRadius: 0.031,
    uColor: new THREE.Color(0xffffff),
  },
  `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  `
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform vec3 uColor;
      varying vec2 vUv;
      
      void main() {
        float dist = distance(vUv, uCenter);
        float alpha = smoothstep(uRadius - 0.01, uRadius + 0.01, dist);
        gl_FragColor = vec4(uColor, alpha);
      }
    `
);

extend({ FogMaterial });

export function FogEffect({ color = "#ffffff" }) {
  return (
    <mesh rotation={[4.725, 0, 0]} position={[0, 4, 0]}>
      <planeGeometry args={[1000, 1000, 1, 1]} />
      <fogMaterial
        uColor={new THREE.Color(color)}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
