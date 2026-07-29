/* eslint-disable react/prop-types */

export const EnvironmentRenderer = ({
  terrain,
  mobile = false,
  backgroundColor,
  lighting,
}) => {
  const lightHeight = Math.min(60, Math.max(4, Number(lighting?.height ?? 18)));
  const lightIntensity = Math.min(
    3,
    Math.max(0.2, Number(lighting?.intensity ?? 1))
  );
  const lightAngle = Number(lighting?.angle ?? 40);
  const angleRadians = (lightAngle * Math.PI) / 180;
  const mainRadius = 16;
  const fillRadius = 12;
  const mainPosition = [
    Math.sin(angleRadians) * mainRadius,
    lightHeight,
    Math.cos(angleRadians) * mainRadius,
  ];
  const fillPosition = [
    -Math.sin(angleRadians) * fillRadius,
    Math.max(4, lightHeight * 0.4),
    -Math.cos(angleRadians) * fillRadius,
  ];

  return (
    <>
      <color attach="background" args={[backgroundColor ?? terrain.fog]} />
      <fog attach="fog" args={[backgroundColor ?? terrain.fog, 95, 280]} />
      <ambientLight
        intensity={(mobile ? 0.82 : 0.72) * lightIntensity}
      />
      <directionalLight
        castShadow={!mobile}
        position={mainPosition}
        intensity={(mobile ? 1.05 : 1.72) * lightIntensity}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-58}
        shadow-camera-right={58}
        shadow-camera-top={58}
        shadow-camera-bottom={-58}
        shadow-camera-far={Math.max(96, lightHeight * 4 + 32)}
        shadow-bias={-0.0002}
        shadow-normalBias={0.035}
      />
      <directionalLight
        position={fillPosition}
        intensity={(mobile ? 0.36 : 0.58) * lightIntensity}
        color="#d8f1ff"
      />
      <pointLight
        position={[0, Math.max(4, lightHeight * 0.32), 4.8]}
        intensity={(mobile ? 0.8 : 1.15) * lightIntensity}
        distance={20}
        color="#c8ecff"
      />
    </>
  );
};
