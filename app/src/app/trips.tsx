// Field trips recorded on this phone (Session, "Field-test recording"):
// listed, exported for a spreadsheet or map viewer, and deleted, apart from
// the search log. Opened from the Log.
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { exportTrips, type ExportKind } from "../fieldtest/exports";
import { recorder, useRecorder } from "../fieldtest/instance";
import { storageState, storageText, type TripRecord } from "../fieldtest/trip";
import { formatDuration } from "../format";
import { store } from "../storage/store";
import { colors, fonts } from "../theme";

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  // Re-read when a trip starts or ends.
  useRecorder();
  const [version, setVersion] = useState(0);
  recorder.flush();
  const trips = store.listTrips();
  const storage = store.tripStorage();
  const [includeDemo, setIncludeDemo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = trips.filter((t) => includeDemo || !t.header.demo);

  const run = (kind: ExportKind) => {
    setError(null);
    exportTrips(chosen, kind, kind === "gpx" ? "blue-route-trips" : kind === "trips" ? "trips" : "events").catch(
      (e: unknown) => setError(`Couldn’t export: ${e instanceof Error ? e.message : String(e)}`),
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.navigate("/log"))}
        style={styles.back}
        hitSlop={8}
      >
        <Text style={styles.backText}>‹ Log</Text>
      </Pressable>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.header.id}
        contentContainerStyle={styles.content}
        extraData={version}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={styles.title}>Field trips</Text>
            <Text style={styles.hint}>
              Recorded on this phone only. Nothing is sent anywhere unless you export it.
            </Text>
            <Text style={[styles.hint, storageState(storage.trips, storage.bytes) !== "ok" && styles.warn]}>
              {storageText(storage.trips, storage.bytes)}
            </Text>
          </View>
        }
        renderItem={({ item }) => <TripRow trip={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No trips yet. Turn on Field-test recording on Session, then pick a destination and drive.
          </Text>
        }
        ListFooterComponent={
          trips.length > 0 ? (
            <View style={styles.footer}>
              <Text style={styles.section}>Export {chosen.length === trips.length ? "all" : `${chosen.length} of ${trips.length}`}</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleText} nativeID="demo-label">
                  Include demo-drive trips
                </Text>
                <Switch
                  accessibilityLabelledBy="demo-label"
                  value={includeDemo}
                  onValueChange={setIncludeDemo}
                  trackColor={{ false: colors.line, true: colors.amber }}
                />
              </View>
              <View style={styles.buttons}>
                {(
                  [
                    ["trips", "trips.csv"],
                    ["events", "events.csv"],
                    ["gpx", "GPX track"],
                  ] as const
                ).map(([kind, label]) => (
                  <Pressable
                    key={kind}
                    accessibilityRole="button"
                    disabled={chosen.length === 0}
                    onPress={() => run(kind)}
                    style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }, chosen.length === 0 && { opacity: 0.4 }]}
                  >
                    <Text style={styles.buttonText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {error && <Text style={styles.warn}>{error}</Text>}
              {confirming ? (
                <View style={styles.confirm}>
                  <Text style={styles.confirmText}>
                    Delete all {trips.length} field trip{trips.length === 1 ? "" : "s"}? The search log stays. This can’t be undone.
                  </Text>
                  <View style={styles.buttons}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        store.deleteTrips();
                        setConfirming(false);
                        setVersion((v) => v + 1);
                      }}
                      style={styles.delete}
                    >
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setConfirming(false)} style={styles.button}>
                      <Text style={styles.buttonText}>Keep</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setConfirming(true)} style={styles.button}>
                  <Text style={styles.buttonText}>Delete field trips</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const KIND: Record<string, string> = { police: "BLUE LIGHT", standard: "STANDARD", follow: "FOLLOW-IN" };

function TripRow({ trip }: { trip: TripRecord }) {
  const { header: h, summary: s } = trip;
  const when = new Date(h.startedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/trip/[id]", params: { id: h.id } })}
      style={({ pressed }) => [styles.trip, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.meta}>
        {when}
        {h.demo ? " · DEMO" : ""}
      </Text>
      <Text style={styles.dest} numberOfLines={1}>
        {h.destination.title}
      </Text>
      <Text style={styles.meta}>
        {s.kind ? KIND[s.kind] ?? s.kind.toUpperCase() : "NOT STARTED"}
        {s.durationS !== null ? ` · ${formatDuration(s.durationS)}` : ""} · {s.reroutes} re-route{s.reroutes === 1 ? "" : "s"} ·{" "}
        {s.marks} mark{s.marks === 1 ? "" : "s"} ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: "flex-start" },
  backText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 17 },
  content: { padding: 16, paddingBottom: 40 },
  intro: { gap: 6, marginBottom: 8 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  warn: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 14 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, marginTop: 8 },
  trip: { paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 3 },
  meta: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  dest: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  footer: { marginTop: 24, gap: 12 },
  section: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleText: { flex: 1, color: colors.fg, fontFamily: fonts.body, fontSize: 15 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  buttonText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 16, textTransform: "uppercase" },
  confirm: { gap: 10, borderColor: colors.warn, borderWidth: 1, borderRadius: 10, padding: 12 },
  confirmText: { color: colors.fg, fontFamily: fonts.body, fontSize: 15 },
  delete: { backgroundColor: colors.warn, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, minHeight: 48 },
  deleteText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 16, textTransform: "uppercase" },
});
