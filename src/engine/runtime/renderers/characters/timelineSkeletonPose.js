export const captureTimelineSkeletonPose = (model, sceneNameMap) => {
  if (!model || !sceneNameMap) return undefined;
  return [...sceneNameMap.entries()].flatMap(([key, candidate]) => {
    const bone = model.getObjectByProperty("uuid", candidate.id);
    if (!bone?.isBone) return [];
    return [
      {
        key,
        position: bone.position.toArray(),
        quaternion: bone.quaternion.toArray(),
      },
    ];
  });
};

export const applyTimelineSkeletonPose = (model, sceneNameMap, pose) => {
  if (!model || !sceneNameMap || !Array.isArray(pose)) return false;
  let applied = false;
  pose.forEach((entry) => {
    const candidate = sceneNameMap.get(entry?.key);
    const bone = candidate
      ? model.getObjectByProperty("uuid", candidate.id)
      : null;
    if (!bone?.isBone) return;
    if (Array.isArray(entry.position) && entry.position.length >= 3) {
      bone.position.fromArray(entry.position);
    }
    if (Array.isArray(entry.quaternion) && entry.quaternion.length >= 4) {
      bone.quaternion.fromArray(entry.quaternion).normalize();
    }
    applied = true;
  });
  return applied;
};
