import * as THREE from "three";

const DEVICE_EULER = new THREE.Euler();
const DEVICE_QUATERNION = new THREE.Quaternion();
const TRANSLATION_QUATERNION = new THREE.Quaternion();
const SCREEN_QUATERNION = new THREE.Quaternion();
const SCREEN_AXIS = new THREE.Vector3(0, 0, 1);
const CAMERA_ALIGNMENT = new THREE.Quaternion(
  -Math.sqrt(0.5),
  0,
  0,
  Math.sqrt(0.5)
);
const OUTPUT_EULER = new THREE.Euler();

const toRadians = THREE.MathUtils.degToRad;
const toDegrees = THREE.MathUtils.radToDeg;
const WEB_TRANSLATION_DEAD_ZONE = 0.06;
const WEB_TRANSLATION_MAX_ACCELERATION = 12;
const WEB_TRANSLATION_MAX_SPEED = 2.4;
const WEB_TRANSLATION_ACTIVE_DAMPING = 0.28;
const WEB_TRANSLATION_IDLE_DAMPING = 18;
const WEB_TRANSLATION_STOP_SPEED = 0.006;
const WEB_TRANSLATION_QUIET_SECONDS = 0.1;
const WEB_TRANSLATION_IDLE_BIAS_RATE = 3.5;
const WEB_TRANSLATION_ACTIVE_BIAS_RATE = 0.08;
const WEB_TRANSLATION_FILTER_RATE = 24;
const WEB_TRANSLATION_MAX_DELTA_SECONDS = 0.08;
const WEB_TRANSLATION_MAX_POSITION = 12;
const WEB_TRANSLATION_QUIET_ROTATION_RATE = 10;
const WEB_TRANSLATION_ROTATION_GUARD_RATE = 24;
const WEB_TRANSLATION_ROTATION_SETTLE_SECONDS = 0.14;
const WEB_TRANSLATION_HORIZONTAL_GAIN = 2.35;

export const WEB_TRANSLATION_TRACKER_VERSION = 5;

const finiteAngle = (value) => {
  const angle = Number(value);
  return Number.isFinite(angle) ? angle : null;
};

const readAccelerationValues = (acceleration) => {
  const values = [acceleration?.x, acceleration?.y, acceleration?.z];
  if (
    values.some((value) => value == null || value === "") ||
    !values.map(Number).every(Number.isFinite)
  ) {
    return null;
  }
  return values.map(Number);
};

export const getScreenOrientationAngle = () => {
  const screenAngle = Number(globalThis.screen?.orientation?.angle);
  if (Number.isFinite(screenAngle)) return screenAngle;

  const legacyAngle = Number(globalThis.orientation);
  return Number.isFinite(legacyAngle) ? legacyAngle : 0;
};

export const createWebMotionFrame = (event, screenAngle = 0) => {
  const alpha = finiteAngle(event?.alpha);
  const beta = finiteAngle(event?.beta);
  const gamma = finiteAngle(event?.gamma);
  if (alpha == null || beta == null || gamma == null) return null;

  DEVICE_EULER.set(
    toRadians(beta),
    toRadians(alpha),
    -toRadians(gamma),
    "YXZ"
  );
  DEVICE_QUATERNION.setFromEuler(DEVICE_EULER);
  DEVICE_QUATERNION.multiply(CAMERA_ALIGNMENT);
  // DeviceMotion acceleration is expressed in the phone's hardware axes.
  // Keep this quaternion free of the display-orientation correction used by
  // the rendered camera, otherwise landscape mode rotates translation twice.
  TRANSLATION_QUATERNION.copy(DEVICE_QUATERNION);
  SCREEN_QUATERNION.setFromAxisAngle(
    SCREEN_AXIS,
    -toRadians(Number(screenAngle) || 0)
  );
  DEVICE_QUATERNION.multiply(SCREEN_QUATERNION);

  OUTPUT_EULER.setFromQuaternion(DEVICE_QUATERNION, "YXZ");

  return {
    source: "web-sensor",
    yaw: toDegrees(OUTPUT_EULER.y),
    pitch: toDegrees(OUTPUT_EULER.x),
    roll: toDegrees(OUTPUT_EULER.z),
    alpha,
    beta,
    gamma,
    motionQuaternion: DEVICE_QUATERNION.toArray(),
    translationQuaternion: TRANSLATION_QUATERNION.toArray(),
    absolute: Boolean(event?.absolute),
    trackingState: "normal",
  };
};

export const createWebTranslationTracker = () => {
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const accelerationBias = new THREE.Vector3();
  const rawAcceleration = new THREE.Vector3();
  const worldAcceleration = new THREE.Vector3();
  const relativeAcceleration = new THREE.Vector3();
  const correctedAcceleration = new THREE.Vector3();
  const filteredAcceleration = new THREE.Vector3();
  const nextVelocity = new THREE.Vector3();
  const deviceQuaternion = new THREE.Quaternion();
  const originRight = new THREE.Vector3(1, 0, 0);
  const originUp = new THREE.Vector3(0, 1, 0);
  const originForward = new THREE.Vector3(0, 0, -1);
  const originCameraForward = new THREE.Vector3();
  const originDeviceTop = new THREE.Vector3();
  let lastTimestamp = null;
  let quietSeconds = 0;
  let rotationSettleSeconds = 0;
  let hasOrigin = false;
  let hasAccelerationSample = false;

  const reset = () => {
    position.set(0, 0, 0);
    velocity.set(0, 0, 0);
    accelerationBias.set(0, 0, 0);
    filteredAcceleration.set(0, 0, 0);
    nextVelocity.set(0, 0, 0);
    lastTimestamp = null;
    quietSeconds = 0;
    rotationSettleSeconds = 0;
    hasOrigin = false;
    hasAccelerationSample = false;
  };

  const readPosition = () => position.toArray();

  const update = (event, orientationQuaternion = null) => {
    const timestamp = Number(event?.timeStamp);
    // WebKit can expose a zero-filled `acceleration` object even while
    // `accelerationIncludingGravity` contains the actual motion sample.
    // Always prefer the latter and remove its stationary baseline below.
    const accelerationValues =
      readAccelerationValues(event?.accelerationIncludingGravity) ??
      readAccelerationValues(event?.acceleration);
    if (
      !Number.isFinite(timestamp) ||
      !accelerationValues
    ) {
      return readPosition();
    }

    const quaternionValues = Array.isArray(orientationQuaternion)
      ? orientationQuaternion.slice(0, 4).map(Number)
      : null;
    if (
      quaternionValues?.length === 4 &&
      quaternionValues.every(Number.isFinite)
    ) {
      deviceQuaternion.fromArray(quaternionValues).normalize();
    } else {
      deviceQuaternion.identity();
    }

    if (!hasOrigin) {
      originUp.set(0, 1, 0);
      originCameraForward
        .set(0, 0, -1)
        .applyQuaternion(deviceQuaternion);
      originForward.set(
        originCameraForward.x,
        0,
        originCameraForward.z
      );
      if (originForward.lengthSq() < 0.01) {
        originDeviceTop
          .set(0, 1, 0)
          .applyQuaternion(deviceQuaternion);
        originForward.set(originDeviceTop.x, 0, originDeviceTop.z);
      }
      if (originForward.lengthSq() < 0.0001) {
        originForward.set(0, 0, -1);
      } else {
        originForward.normalize();
      }
      originRight
        .crossVectors(originForward, originUp)
        .normalize();
      hasOrigin = true;
    }

    rawAcceleration.fromArray(accelerationValues);
    worldAcceleration
      .copy(rawAcceleration)
      .applyQuaternion(deviceQuaternion);
    relativeAcceleration.set(
      worldAcceleration.dot(originRight),
      worldAcceleration.dot(originUp),
      // Forward/back movement is always normal to the phone display. Reading
      // device-local Z directly avoids losing the signal when a landscape
      // phone is pitched away from its initial pose.
      -rawAcceleration.z
    );

    if (lastTimestamp == null) {
      lastTimestamp = timestamp;
      accelerationBias.copy(relativeAcceleration);
      filteredAcceleration.copy(relativeAcceleration);
      hasAccelerationSample = true;
      return readPosition();
    }

    const elapsedSeconds = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0 ||
      elapsedSeconds > WEB_TRANSLATION_MAX_DELTA_SECONDS
    ) {
      velocity.set(0, 0, 0);
      quietSeconds = 0;
      return readPosition();
    }
    const deltaSeconds = THREE.MathUtils.clamp(
      elapsedSeconds,
      1 / 240,
      WEB_TRANSLATION_MAX_DELTA_SECONDS
    );

    const filterAlpha = 1 - Math.exp(-WEB_TRANSLATION_FILTER_RATE * deltaSeconds);
    if (!hasAccelerationSample) {
      filteredAcceleration.copy(relativeAcceleration);
      hasAccelerationSample = true;
    } else {
      filteredAcceleration.lerp(relativeAcceleration, filterAlpha);
    }

    correctedAcceleration
      .copy(filteredAcceleration)
      .sub(accelerationBias);
    const accelerationMagnitude = correctedAcceleration.length();
    const rotationRate = event?.rotationRate;
    const rotationMagnitude = Math.hypot(
      Number(rotationRate?.alpha) || 0,
      Number(rotationRate?.beta) || 0,
      Number(rotationRate?.gamma) || 0
    );
    const rotationGuardActive =
      rotationMagnitude >= WEB_TRANSLATION_ROTATION_GUARD_RATE;
    if (rotationGuardActive) {
      rotationSettleSeconds = WEB_TRANSLATION_ROTATION_SETTLE_SECONDS;
    } else {
      rotationSettleSeconds = Math.max(
        0,
        rotationSettleSeconds - deltaSeconds
      );
    }
    const translationSuspended =
      rotationGuardActive || rotationSettleSeconds > 0;
    const isQuiet =
      accelerationMagnitude < WEB_TRANSLATION_DEAD_ZONE &&
      rotationMagnitude < WEB_TRANSLATION_QUIET_ROTATION_RATE;
    if (translationSuspended) {
      filteredAcceleration.copy(relativeAcceleration);
      accelerationBias.copy(relativeAcceleration);
      correctedAcceleration.set(0, 0, 0);
      velocity.set(0, 0, 0);
      quietSeconds = 0;
    } else {
      accelerationBias.lerp(
        filteredAcceleration,
        Math.min(
          1,
          deltaSeconds *
            (isQuiet
              ? WEB_TRANSLATION_IDLE_BIAS_RATE
              : WEB_TRANSLATION_ACTIVE_BIAS_RATE)
        )
      );
      quietSeconds = isQuiet ? quietSeconds + deltaSeconds : 0;
    }

    if (translationSuspended || isQuiet) {
      correctedAcceleration.set(0, 0, 0);
    } else if (
      correctedAcceleration.length() > WEB_TRANSLATION_MAX_ACCELERATION
    ) {
      correctedAcceleration.setLength(WEB_TRANSLATION_MAX_ACCELERATION);
    }
    correctedAcceleration.x *= WEB_TRANSLATION_HORIZONTAL_GAIN;
    correctedAcceleration.z *= WEB_TRANSLATION_HORIZONTAL_GAIN;

    nextVelocity
      .copy(velocity)
      .addScaledVector(correctedAcceleration, deltaSeconds);

    // A physical stop creates acceleration opposite to the current velocity.
    // Clamp only an actual zero crossing so braking cannot turn into the
    // backwards "kick" that the previous gesture-direction model produced.
    for (const axis of ["x", "y", "z"]) {
      const before = velocity[axis];
      const after = nextVelocity[axis];
      const accelerationValue = correctedAcceleration[axis];
      if (
        Math.abs(before) > WEB_TRANSLATION_STOP_SPEED &&
        before * accelerationValue < 0 &&
        before * after <= 0
      ) {
        nextVelocity[axis] = 0;
      }
    }

    velocity.copy(nextVelocity);
    velocity.multiplyScalar(
      Math.exp(
        -(isQuiet
          ? WEB_TRANSLATION_IDLE_DAMPING
          : WEB_TRANSLATION_ACTIVE_DAMPING) * deltaSeconds
      )
    );
    if (velocity.length() > WEB_TRANSLATION_MAX_SPEED) {
      velocity.setLength(WEB_TRANSLATION_MAX_SPEED);
    }
    if (
      velocity.length() < WEB_TRANSLATION_STOP_SPEED ||
      quietSeconds >= WEB_TRANSLATION_QUIET_SECONDS
    ) {
      velocity.set(0, 0, 0);
    }

    position.addScaledVector(velocity, deltaSeconds);
    if (position.length() > WEB_TRANSLATION_MAX_POSITION) {
      position.setLength(WEB_TRANSLATION_MAX_POSITION);
    }
    return readPosition();
  };

  return {
    readPosition,
    reset,
    update,
    version: WEB_TRANSLATION_TRACKER_VERSION,
  };
};
