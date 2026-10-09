import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";

import { useLog } from "../../log/LogProvider";
import type { LogEntry, LoggedRoute } from "../../storage/types";
import { colors, fonts } from "../../theme";

const ROUTE_LABEL: Record<LoggedRoute, { text: string; color: string }> = {
  standard: { text: "STANDARD ROUTE", color: colors.blue },
  police: { text: "POLICE ROUTE", color: colors.amber },
  "google-maps": { text: "GOOGLE MAPS", color: colors.muted },
  waze: { text: "WAZE", color: colors.muted },
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Every search and the route picked. Kept on the phone until cleared here. */
export default function LogScreen() {
  const { entries, clear } = useLog();
  const [confirming, setConfirming] = useState(false);

  const sections = useMemo(() => {
    const byDay = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const day = dayLabel(e.at);
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    return [...byDay].map(([title, data]) => ({ title, data }));
  }, [entries]);

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(e) => String(e.id)}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.intro}>
          <Text style={styles.title}>Search log</Text>
          <Text style={styles.hint}>
            Every address searched and route picked, kept on this phone so you can refer back. Never cleared
            automatically.
          </Text>
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
      renderItem={({ item }) => <Entry entry={item} />}
      ListEmptyComponent={<Text style={styles.empty}>Nothing logged yet. Searches appear here once you pick a destination.</Text>}
      ListFooterComponent={
        entries.length > 0 ? (
          <View style={styles.footer}>
            {confirming ? (
              <View style={styles.confirm}>
                <Text style={styles.confirmText}>
                  Delete all {entries.length} entr{entries.length === 1 ? "y" : "ies"}? This can’t be undone.
                </Text>
                <View style={styles.confirmButtons}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      clear();
                      setConfirming(false);
                    }}
                    style={styles.delete}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setConfirming(false)} style={styles.keep}>
                    <Text style={styles.keepText}>Keep</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.keep}>
                <Text style={styles.keepText}>Clear log</Text>
              </Pressable>
            )}
          </View>
        ) : null
      }
    />
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const route = entry.route ? ROUTE_LABEL[entry.route] : null;
  return (
    <View style={styles.entry}>
      <Text style={styles.meta}>
        {time} · {entry.query ? `searched “${entry.query}”` : "picked on the map"}
      </Text>
      <Text style={styles.chosen}>{entry.chosen}</Text>
      <View style={styles.row}>
        <Text style={styles.borough}>{entry.borough ?? "Outside London"}</Text>
        <Text style={[styles.route, { color: route?.color ?? colors.muted, borderColor: route?.color ?? colors.line }]}>
          {route?.text ?? "NO ROUTE PICKED"}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.navigate({
            pathname: "/search",
            params: { lat: String(entry.lat), lng: String(entry.lng), title: entry.chosen, from: String(entry.id) },
          })
        }
        hitSlop={6}
      >
        <Text style={styles.again}>Route there again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  intro: { gap: 6, marginBottom: 8 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  day: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 4,
  },
  entry: { paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 3 },
  meta: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  chosen: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  borough: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, flexShrink: 1 },
  route: { fontFamily: fonts.mono, fontSize: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  again: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14, marginTop: 4 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, marginTop: 8 },
  footer: { marginTop: 24, alignItems: "flex-start" },
  confirm: { gap: 10, borderColor: colors.warn, borderWidth: 1, borderRadius: 10, padding: 12, alignSelf: "stretch" },
  confirmText: { color: colors.fg, fontFamily: fonts.body, fontSize: 15 },
  confirmButtons: { flexDirection: "row", gap: 10 },
  delete: { backgroundColor: colors.warn, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  deleteText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 16, textTransform: "uppercase" },
  keep: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  keepText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 16, textTransform: "uppercase" },
});
