import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type LngLat,
} from "@maplibre/maplibre-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAP_STYLE_URL, region } from "../config";
import { useLocation } from "../location/LocationProvider";
import { colors, fonts } from "../theme";
import { boundsOf, FIT_DELAY_MS, FIT_PADDING, pointGeoJSON, routesGeoJSON, type LiveMapProps } from "./mapShared";

/**
 * Dark map that follows the phone's GPS position. Panning the map stops
 * following; the Recentre button picks it back up.
 */
export function LiveMap({
  headingUp = false,
  followZoom = 15,
  compact = false,
  routes = [],
  destination,
  onLongPress,
  fitTo,
}: LiveMapProps) {
  const { fix } = useLocation();
  const [following, setFollowing] = useState(true);
  const camera = useRef<CameraRef>(null);

  // New points to show: stop following so the camera can frame them.
  const [lastFitTo, setLastFitTo] = useState(fitTo);
  if (fitTo !== lastFitTo) {
    setLastFitTo(fitTo);
    if (fitTo?.length) setFollowing(false);
  }
  useEffect(() => {
    if (!fitTo?.length) return;
    // Wait for the layout to settle (the route panel opening shrinks the map).
    const timer = setTimeout(
      () => camera.current?.fitBounds(boundsOf(fitTo), { padding: FIT_PADDING, duration: 600 }),
      FIT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [fitTo]);
  const [mapFailed, setMapFailed] = useState(false);

  const position: LngLat | null = fix ? [fix.lng, fix.lat] : null;

  const lng = fix?.lng;
  const lat = fix?.lat;
  const puck = useMemo<GeoJSON.Feature | null>(
    () =>
      lng != null && lat != null
        ? { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: {} }
        : null,
    [lng, lat],
  );

  const followCamera =
    following && position
      ? {
          center: position,
          zoom: followZoom,
          bearing: headingUp && fix?.course != null ? fix.course : 0,
          duration: 800,
          easing: "ease" as const,
        }
      : {};

  return (
    <View style={styles.container}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE_URL}
        logo={false}
        compass={!compact}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        touchRotate={!headingUp}
        onDidFailLoadingMap={() => setMapFailed(true)}
        onDidFinishLoadingStyle={() => setMapFailed(false)}
        onLongPress={(e) => onLongPress?.(e.nativeEvent.lngLat)}
        onRegionWillChange={(e) => {
          if (e.nativeEvent.userInteraction) setFollowing(false);
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: region.defaultCentre, zoom: region.defaultZoom }}
          maxBounds={region.maxBounds}
          {...followCamera}
        />
        <GeoJSONSource id="routes" data={routesGeoJSON(routes)}>
          <Layer
            type="line"
            id="route-solid"
            filter={["==", ["get", "dashed"], false]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": ["get", "color"], "line-width": 5 }}
          />
          <Layer
            type="line"
            id="route-dashed"
            filter={["==", ["get", "dashed"], true]}
            layout={{ "line-join": "round" }}
            paint={{ "line-color": ["get", "color"], "line-width": 5, "line-dasharray": [1.5, 1] }}
          />
        </GeoJSONSource>
        <GeoJSONSource id="destination" data={pointGeoJSON(destination)}>
          <Layer
            type="circle"
            id="destination-dot"
            paint={{
              "circle-radius": 9,
              "circle-color": colors.amber,
              "circle-stroke-color": colors.bg,
              "circle-stroke-width": 3,
            }}
          />
        </GeoJSONSource>
        {puck && (
          <GeoJSONSource id="me" data={puck}>
            <Layer
              type="circle"
              id="me-halo"
              paint={{ "circle-radius": 16, "circle-color": colors.blue, "circle-opacity": 0.25 }}
            />
            <Layer
              type="circle"
              id="me-dot"
              paint={{
                "circle-radius": 7,
                "circle-color": colors.blue,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
          </GeoJSONSource>
        )}
      </Map>

      {mapFailed && (
        <View style={styles.failed} pointerEvents="none">
          <Text style={styles.failedTitle}>Map couldn’t load</Text>
          <Text style={styles.failedBody}>No connection to the map server. GPS is still running.</Text>
        </View>
      )}
      {!following && position && (
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
