// Buttons on the map: day/night, and on the navigation and pursuit maps the
// view (direction of travel up, tilted 3D, north up). Both are remembered.
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAP_VIEWS, useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

const VIEW_LABEL = { heading: "▲", "3d": "3D", north: "N" } as const;
const VIEW_NAME = { heading: "Direction of travel up", "3d": "Tilted 3D view", north: "North up" } as const;

export function MapButtons({ showView, top = 12 }: { showView: boolean; top?: number }) {
  const { mapTheme, setMapTheme, mapView, setMapView } = useSession();
  const next = MAP_VIEWS[(MAP_VIEWS.indexOf(mapView) + 1) % MAP_VIEWS.length]!;
  return (
    <View style={[styles.column, { top }]} pointerEvents="box-none">
      {showView && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Map view: ${VIEW_NAME[mapView]}. Tap for ${VIEW_NAME[next]}`}
          onPress={() => setMapView(next)}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.label}>{VIEW_LABEL[mapView]}</Text>
          <Text style={styles.caption}>View</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mapTheme === "night" ? "Switch to day map" : "Switch to night map"}
        onPress={() => setMapTheme(mapTheme === "night" ? "day" : "night")}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.label}>{mapTheme === "night" ? "☀" : "☾"}</Text>
        <Text style={styles.caption}>{mapTheme === "night" ? "Day" : "Night"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { position: "absolute", right: 12, gap: 8 },
  button: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.95,
  },
  pressed: { opacity: 0.7 },
  label: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 20 },
  caption: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 },
});
