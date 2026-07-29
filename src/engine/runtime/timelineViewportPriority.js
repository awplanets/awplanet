export const canTimelineControlViewport = ({
  mode,
  editorTool,
  phonePilotEnabled = false,
  phoneRuntimeEnabled = false,
  phoneProfile = false,
} = {}) =>
  mode === "select" &&
  (editorTool ?? "select") === "select" &&
  !phonePilotEnabled &&
  !phoneRuntimeEnabled &&
  !phoneProfile;
