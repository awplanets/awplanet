const includesAny = (text, terms) => terms.some((term) => text.includes(term));

export const parseAiPromptToCommands = (prompt) => {
  const text = prompt.trim().toLowerCase();
  const commands = [];

  if (!text) return commands;

  if (includesAny(text, ["grass", "草", "forest", "森林"])) {
    commands.push({ type: "switch-terrain", terrainId: "grass" });
    commands.push({
      type: "set-terrain-parameter",
      terrainId: "grass",
      parameter: "density",
      value: 0.92,
    });
  }

  if (includesAny(text, ["water", "湖", "水", "river", "河"])) {
    commands.push({ type: "switch-terrain", terrainId: "water" });
    commands.push({
      type: "set-terrain-parameter",
      terrainId: "water",
      parameter: "relief",
      value: 0.18,
    });
  }

  if (includesAny(text, ["sand", "沙", "desert", "沙漠"])) {
    commands.push({ type: "switch-terrain", terrainId: "sand" });
  }

  if (includesAny(text, ["boulder", "大石", "石头", "rock"])) {
    commands.push({
      type: "add-entity",
      assetKey: "boulder",
      position: [2.8, 0, -4.2],
    });
  }

  if (includesAny(text, ["shrub", "灌木", "bush", "植被"])) {
    commands.push({
      type: "add-entity",
      assetKey: "shrub",
      position: [-2.2, 0, -3.6],
    });
  }

  if (commands.length === 0) {
    commands.push({
      type: "add-entity",
      assetKey: "marker",
      position: [0, 0, -5],
    });
  }

  return commands;
};
