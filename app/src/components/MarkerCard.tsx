import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import type { MarkerProperties } from "./mapShared";
import { useTextStyles, useColors } from "../textSize";

interface Props {
  marker: MarkerProperties;
  away?: string;
  onRoute: () => void;
  onClose: () => void;
  /** More about it, a line each; a warning line in amber. */
  lines?: { text: string; warn?: boolean }[];
  /** Starred in favourites; with onToggleFavourite, a star to tap. */
  favourite?: boolean;
  onToggleFavourite?: () => void;
  /** A second way there, beside Route here (Follow in, for a colleague). */
  other?: { label: string; onPress: () => void; busy?: boolean };
}

/** What a tapped place marker is, with a way to route there. */
export function MarkerCard({ marker, away, onRoute, onClose, lines, other, favourite, onToggleFavourite }: Props) {
  const palette = useColors();
  const styles = useTextStyles(baseStyles);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: marker.color }]} />
        <Text style={styles.type}>{marker.type.toUpperCase()}</Text>
        {away && <Text style={styles.away}>{away}</Text>}
        {onToggleFavourite && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favourite ? "Remove from favourites" : "Add to favourites"}
            onPress={onToggleFavourite}
            hitSlop={12}
            style={styles.close}
          >
            <Text style={[styles.star, favourite && styles.starOn]}>{favourite ? "★" : "☆"}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.name}>{marker.name}</Text>
      <Text style={styles.detail}>{[marker.address, marker.borough].filter(Boolean).join(" · ")}</Text>
      {lines?.map((l) => (
        <Text key={l.text} style={[styles.detail, l.warn && styles.warn]}>
          {l.text}
        </Text>
      ))}
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          onPress={onRoute}
          style={({ pressed }) => [styles.route, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.routeText}>Route here</Text>
        </Pressable>
        {other && (
          <Pressable
            accessibilityRole="button"
            onPress={other.onPress}
            disabled={other.busy}
            style={({ pressed }) => [styles.route, styles.otherButton, pressed && { opacity: 0.85 }]}
          >
            {other.busy ? (
              <ActivityIndicator color={palette.fg} />
            ) : (
              <Text style={[styles.routeText, styles.otherText]}>{other.label}</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
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
  star: { color: colors.muted, fontSize: 22 },
  starOn: { color: colors.amber },
  name: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 22 },
  detail: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  warn: { color: colors.amber, fontFamily: fonts.bodyMedium },
  buttons: { flexDirection: "row", gap: 8, marginTop: 6 },
  route: { flex: 1, backgroundColor: colors.amber, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  otherButton: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1 },
  otherText: { color: colors.fg },
  routeText: { color: "#1a1200", fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 1, textTransform: "uppercase" },
});
