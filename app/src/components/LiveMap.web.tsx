// Browser version of LiveMap, so the app can be previewed without a phone
// build. Same props and behaviour as LiveMap.tsx, using maplibre-gl.
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapControls.web.css";

import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DEMO_MODE, MAP_STYLE_URL, region } from "../config";
import { demoBoroughLabels, demoMapStyle } from "../demo/demoMapStyle";
import { useLocation } from "../location/LocationProvider";
import { colors, fonts } from "../theme";

interface Props {
  headingUp?: boolean;
  followZoom?: number;
  compact?: boolean;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function LiveMap({ headingUp = false, followZoom = 15, compact = false }: Props) {
  const { fix } = useLocation();
  const [following, setFollowing] = useState(true);
  const container = useRef<View>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  // The demo map only has borough outlines, which say nothing at street zoom.
  const zoom = DEMO_MODE ? 12 : followZoom;

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current as unknown as HTMLElement,
      style: DEMO_MODE ? demoMapStyle : MAP_STYLE_URL,
      center: region.defaultCentre,
      zoom: region.defaultZoom,
      maxBounds: [
        [region.maxBounds[0], region.maxBounds[1]],
        [region.maxBounds[2], region.maxBounds[3]],
      ],
      attributionControl: { compact: true },
      dragRotate: !headingUp,
    });
    if (!compact) m.addControl(new maplibregl.NavigationControl({ showZoom: false }), "top-right");
    m.on("load", () => {
      m.addSource("me", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "me-halo",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 16, "circle-color": colors.blue, "circle-opacity": 0.25 },
      });
      m.addLayer({
        id: "me-dot",
        type: "circle",
        source: "me",
        paint: {
          "circle-radius": 7,
          "circle-color": colors.blue,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      if (DEMO_MODE) {
        // The offline demo style has no font glyphs, so names are HTML markers.
        for (const { name, lngLat } of demoBoroughLabels) {
          const el = document.createElement("div");
          el.textContent = name;
          Object.assign(el.style, {
            color: colors.muted,
            fontFamily: fonts.mono,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            textAlign: "center",
            maxWidth: "90px",
            pointerEvents: "none",
          });
          new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(m);
        }
      }
      setLoaded(true);
      setMapFailed(false);
    });
    // An error before the style has loaded means the map itself is unusable.
    m.on("error", () => {
      if (!m.isStyleLoaded()) setMapFailed(true);
    });
    m.on("dragstart", () => setFollowing(false));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [headingUp, compact]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || !fix) return;
    (m.getSource("me") as maplibregl.GeoJSONSource).setData({
      type: "Feature",
      geometry: { type: "Point", coordinates: [fix.lng, fix.lat] },
      properties: {},
    });
    if (following) {
      m.easeTo({
        center: [fix.lng, fix.lat],
        zoom,
        bearing: headingUp && fix.course != null ? fix.course : 0,
        duration: 800,
      });
    }
  }, [fix, loaded, following, zoom, headingUp]);

  return (
    <View style={styles.container}>
      {/* flex rather than absoluteFill: maplibre-gl's CSS sets position: relative on this element. */}
      <View ref={container} style={styles.map} />
      {mapFailed && (
        <View style={styles.failed} pointerEvents="none">
          <Text style={styles.failedTitle}>Map couldn’t load</Text>
          <Text style={styles.failedBody}>No connection to the map server. GPS is still running.</Text>
        </View>
      )}
      {!following && fix && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFollowing(true)}
          style={({ pressed }) => [styles.recentre, pressed && styles.pressed]}
        >
          <Text style={styles.recentreText}>Recentre</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  map: { flex: 1 },
  recentre: {
    position: "absolute",
    right: 12,
    bottom: 16,
    backgroundColor: colors.amber,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.8 },
  failed: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 16,
    backgroundColor: colors.panel,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  failedTitle: { color: colors.amber, fontFamily: fonts.displaySemiBold, fontSize: 20 },
  failedBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  recentreText: {
    color: "#1a1200",
    fontFamily: fonts.displayBold,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
