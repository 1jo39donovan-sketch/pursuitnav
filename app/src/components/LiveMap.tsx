import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type LngLat,
} from "@maplibre/maplibre-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAP_STYLE_URL, region } from "../config";
import { useLocation } from "../location/LocationProvider";
import { colors, fonts } from "../theme";

interface Props {
  /** Rotate the map so the direction of travel points up (pursuit mini map). */
  headingUp?: boolean;
  /** Zoom used while following the officer's position. */
  followZoom?: number;
  /** Hide map controls for small embedded maps. */
  compact?: boolean;
}

/**
 * Dark map that follows the phone's GPS position. Panning the map stops
 * following; the Recentre button picks it back up.
 */
export function LiveMap({ headingUp = false, followZoom = 15, compact = false }: Props) {
  const { fix } = useLocation();
  const [following, setFollowing] = useState(true);

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
        onRegionWillChange={(e) => {
          if (e.nativeEvent.userInteraction) setFollowing(false);
        }}
      >
        <Camera
          initialViewState={{ center: region.defaultCentre, zoom: region.defaultZoom }}
          maxBounds={region.maxBounds}
          {...followCamera}
        />
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
  recentreText: {
    color: "#1a1200",
    fontFamily: fonts.displayBold,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
