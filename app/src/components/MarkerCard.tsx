import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import type { MarkerProperties } from "./mapShared";

interface Props {
  marker: MarkerProperties;
  away?: string;
  onRoute: () => void;
  onClose: () => void;
}

/** What a tapped place marker is, with a way to route there. */
export function MarkerCard({ marker, away, onRoute, onClose }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: marker.color }]} />
        <Text style={styles.type}>{marker.type.toUpperCase()}</Text>
        {away && <Text style={styles.away}>{away}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.name}>{marker.name}</Text>
      <Text style={styles.detail}>{[marker.address, marker.borough].filter(Boolean).join(" · ")}</Text>
      <Pressable accessibilityRole="button" onPress={onRoute} style={({ pressed }) => [styles.route, pressed && { opacity: 0.85 }]}>
        <Text style={styles.routeText}>Route here</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  type: { color: colors.muted, fontFamily: fonts.mono, fontSize: 11, flex: 1 },
  away: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  close: { paddingLeft: 8 },
  closeText: { color: colors.muted, fontSize: 16 },
  name: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 22 },
  detail: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  route: { backgroundColor: colors.amber, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 6 },
  routeText: { color: "#1a1200", fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 1, textTransform: "uppercase" },
});
