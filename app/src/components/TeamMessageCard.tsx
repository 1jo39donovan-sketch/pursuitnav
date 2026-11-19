// A team message that's come in: who it's from, what and where, with Route
// here for a place. Floats over the map on Search, Pursuit and navigation;
// OK puts it away (it stays on Session until it runs out).
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TeamMessage } from "../team/messages";
import { routeToMessage } from "../team/routeToMessage";
import { useTeam } from "../team/TeamProvider";
import { colors, fonts } from "../theme";
import { useTextStyles } from "../textSize";
import { ago, useNow } from "./TeamSection";

const TAG: Record<TeamMessage["kind"], string> = { go: "GO HERE", caution: "⚠ CAUTION", note: "NOTE" };

export function TeamMessageCard({ onRoute }: { onRoute?: (m: TeamMessage) => void }) {
  const styles = useTextStyles(baseStyles);
  const { unread, dismiss } = useTeam();
  const now = useNow();
  const m = unread[0];
  if (!m) return null;
  const caution = m.kind === "caution";
  return (
    <View style={[styles.card, caution && styles.caution]} accessibilityRole="alert">
      <View style={styles.head}>
        <Text style={[styles.tag, caution && styles.tagCaution]}>{TAG[m.kind]}</Text>
        <Text style={styles.from} numberOfLines={1}>
          {m.cs} · {ago(now - m.at)}
          {m.to ? " · to you" : ""}
        </Text>
      </View>
      {m.place && (
        <Text style={styles.place} numberOfLines={2}>
          {m.place.label}
        </Text>
      )}
      {m.text ? <Text style={styles.text}>{m.text}</Text> : null}
      <View style={styles.buttons}>
        {m.place && m.kind === "go" && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              dismiss(m.id);
              (onRoute ?? routeToMessage)(m);
            }}
            style={({ pressed }) => [styles.button, styles.route, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.buttonText, styles.routeText]}>Route here</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => dismiss(m.id)}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>OK</Text>
        </Pressable>
        {unread.length > 1 && <Text style={styles.more}>+{unread.length - 1} more</Text>}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.blue,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  caution: { borderColor: colors.amber },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { color: colors.blue, fontFamily: fonts.displayBold, fontSize: 14, letterSpacing: 1 },
  tagCaution: { color: colors.amber },
  from: { flex: 1, color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  place: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 18 },
  text: { color: colors.fg, fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  buttons: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  button: {
    minHeight: 48,
    minWidth: 72,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  route: { backgroundColor: colors.amber, borderColor: colors.amber },
  buttonText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 16 },
  routeText: { color: "#1a1200" },
  more: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
});
