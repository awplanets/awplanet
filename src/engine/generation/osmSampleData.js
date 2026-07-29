import ferryBuildingOverpass from "./ferryBuildingOverpass.js";

export const OSM_SAMPLE_IMAGE_URL = "/map-samples/google-map-preview.jpg";

export const OSM_SAMPLE_GEOJSON = ferryBuildingOverpass;

export const OSM_SAMPLE_SOURCE = {
  label: "San Francisco Ferry Building",
  bounds: {
    south: 37.7934,
    west: -122.3975,
    north: 37.7976,
    east: -122.39,
  },
  preview: "Google Maps screenshot",
  geometry: "OpenStreetMap Overpass JSON",
};
