"use client";
import mapboxgl from "mapbox-gl";

/**
 * Real Mapbox wiring for production. The bundled dashboard uses a canvas
 * tactical view so it renders with no token; swap in this initializer for a
 * live basemap with an incident heatmap + markers.
 *
 * Set NEXT_PUBLIC_MAPBOX_TOKEN and import "mapbox-gl/dist/mapbox-gl.css".
 */
export type IncidentPoint = { lon: number; lat: number; severity: number };

export function initTacticalMap(container: HTMLElement, center: [number, number]) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/dark-v11",
    center,
    zoom: 11,
    pitch: 45,
  });

  map.on("load", () => {
    map.addSource("incidents", { type: "geojson", data: emptyFC() });

    // heatmap weighted by severity
    map.addLayer({
      id: "incident-heat",
      type: "heatmap",
      source: "incidents",
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "severity"], 0, 0.2, 3, 1],
        "heatmap-intensity": 1.2,
        "heatmap-radius": 40,
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(56,189,248,0)",
          0.4, "rgba(52,211,153,0.6)",
          0.7, "rgba(251,191,36,0.8)",
          1, "rgba(244,63,94,0.95)",
        ],
      },
    });

    // point markers on top
    map.addLayer({
      id: "incident-points",
      type: "circle",
      source: "incidents",
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "match", ["get", "severity"],
          0, "#34D399", 1, "#FBBF24", 2, "#FB923C", "#F43F5E",
        ],
        "circle-stroke-color": "#0A0F1C",
        "circle-stroke-width": 1.5,
      },
    });
  });

  return {
    map,
    update(points: IncidentPoint[]) {
      const src = map.getSource("incidents") as mapboxgl.GeoJSONSource | undefined;
      src?.setData(toFC(points));
    },
  };
}

function emptyFC() {
  return { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
}
function toFC(points: IncidentPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { severity: p.severity },
    })),
  };
}
