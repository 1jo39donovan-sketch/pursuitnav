// Buttons on the map: day/night, and the view (tilted 3D, direction of travel
// up, north up). Both are remembered; day and 3D until the operator changes them.
// The View button swaps 3D and flat ahead-up; north up is the compass's job.
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

const VIEW_LABEL = { heading: "▲", "3d": "3D", north: "N" } as const;
const VIEW_NAME = { heading: "Direction of travel up", "3d": "Tilted 3D view", north: "North up" } as const;
// Under the button: which view it's in, in two words.
// One short word each: "Ahead up" didn't fit the 52 px button and was cut to "AHEAD …".
const VIEW_CAPTION = { heading: "Ahead", "3d": "3D view", north: "North" } as const;

export function MapButtons({
  showView,
  top = 12,
  onZoom,
  onNorth,
  bearing = 0,
  onWhereAmI,
}: {
  showView: boolean;
  top?: number;
  /** With showView: a compass, which turns the map north up (the map resets its rotation). */
  onNorth?: () => void;
  /** Which way the map is turned, degrees: the compass needle turns with it. */
  bearing?: number;
  /** With this, a button under Night: exactly where the officer is, to read out or share. */
  onWhereAmI?: () => void;
  /** With this, + and − buttons: +1 zooms in, −1 out. */
  onZoom?: (step: 1 | -1) => void;
}) {
  const { mapTheme, setMapTheme, mapView, setMapView } = useSession();
  const next = mapView === "3d" ? "heading" : "3d";
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
          <Text style={styles.caption} numberOfLines={1}>
            {VIEW_CAPTION[mapView]}
          </Text>
        </Pressable>
      )}
      {showView && onNorth && (
        // A compass, as in Google Maps: its red end points north as the map turns; a tap puts north up.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compass: tap for north up"
          accessibilityState={{ selected: mapView === "north" }}
          onPress={() => {
            setMapView("north");
            onNorth();
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.compass, pressed && styles.pressed]}
        >
          <View style={[styles.needle, { transform: [{ rotate: `${-bearing}deg` }] }]}>
            <View style={styles.needleNorth} />
            <View style={styles.needleSouth} />
          </View>
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
      {onWhereAmI && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Where am I: address, postcode, grid reference, share"
          onPress={onWhereAmI}
          style={({ pressed }) => [styles.button, styles.where, pressed && styles.pressed]}
        >
          <Text style={[styles.label, styles.whereIcon]}>◎</Text>
          <Text style={styles.caption}>Where</Text>
        </Pressable>
      )}
      {onZoom &&
        ([1, -1] as const).map((step) => (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? "Zoom in" : "Zoom out"}
            onPress={() => onZoom(step)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={[styles.label, styles.zoom]}>{step === 1 ? "+" : "−"}</Text>
          </Pressable>
        ))}
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
  where: { borderColor: colors.blue },
  whereIcon: { color: colors.blue, fontSize: 22 },
  compass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  needle: { alignItems: "center" },
  needleNorth: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#e5484d",
  },
  needleSouth: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#9aa3b5",
  },
  label: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 20 },
  zoom: { fontSize: 28, lineHeight: 30 },
  caption: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
    alignSelf: "stretch",
  },
});
