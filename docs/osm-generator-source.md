# OSM Generator Source Notes

The built-in OSM sample uses a Google Maps screenshot only as the visual preview.
The generated 3D geometry is driven by matching OpenStreetMap Overpass JSON for the
San Francisco Ferry Building / Embarcadero area.

- Preview asset: `public/map-samples/google-map-preview.jpg`
- Matching OSM data: `src/engine/generation/ferryBuildingOverpass.js`
- Raw downloaded sample: `public/map-samples/ferry-building-overpass.json`
- Runtime converter: `src/engine/generation/osmMapGenerator.js`
- Open-source reference: OSM2World, MIT license, https://github.com/tordanik/OSM2World
- OSM data license: Open Database License, https://www.openstreetmap.org/copyright

Current runtime integration does not vendor OSM2World's Java source directly into the
browser bundle. The editor uses a lightweight local Three.js generator that converts
OSM/Overpass geometry into roads, building blocks, water, green areas, markers, and
collision-ready generated objects.
