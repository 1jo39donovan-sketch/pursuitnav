// One field trip: what was offered and what happened, the track on a map
// with re-routes and marks, notes on the marks (typed here, never while
// moving), and its export.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LiveMap } from "../../components/LiveMap";
import type { MapRoute } from "../../components/mapShared";
import { exportTrips, type ExportKind } from "../../fieldtest/exports";
import { MARKS, type TripEvent } from "../../fieldtest/trip";
import { formatDistance, formatDuration } from "../../format";
import { store } from "../../storage/store";
import { colors, fonts } from "../../theme";

export default function TripScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState(() => store.listTrips().find((t) => t.header.id === id) ?? null);
  const events = useMemo(() => (id ? store.tripEvents(id) : []), [id]);
  const [error, setError] = useState<string | null>(null);

  const track = useMemo(
    () => events.filter((e): e is Extract<TripEvent, { type: "fix" }> => e.type === "fix").map((f) => [f.lng, f.lat] as [number, number]),
    [events],
  );
  const routes = useMemo<MapRoute[]>(() => (track.length > 1 ? [{ id: "track", shape: track, color: colors.blue }] : []), [track]);
  // Marks and re-routes as red points on the map.
  const points = useMemo(() => {
    let last: [number, number] | null = null;
    const out: [number, number][] = [];
    for (const e of events) {
      if (e.type === "fix") last = [e.lng, e.lat];
      if (e.type === "mark") out.push([e.lng, e.lat]);
      if (e.type === "reroute" && last) out.push(last);
    }
    return out;
  }, [events]);
  const marks = events.filter((e): e is Extract<TripEvent, { type: "mark" }> => e.type === "mark");

  if (!record) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, alignItems: "center" }]}>
        <Text style={styles.hint}>This trip isn’t on the phone any more.</Text>
      </View>
    );
  }
  const { header: h, summary: s, others } = record;
  const saveNote = (t: number, note: string) => {
    const next = { ...record, notes: { ...record.notes, [String(t)]: note } };
    if (!note) delete next.notes[String(t)];
    store.saveTrip(next);
    setRecord(next);
  };
  const run = (kind: ExportKind) => {
    setError(null);
    exportTrips([record], kind, kind === "gpx" ? `trip-${h.id}` : `${kind}-${h.id}`).catch((e: unknown) =>
      setError(`Couldn’t export: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  const line = (label: string, value: string | null | undefined) =>
    value ? (
      <View style={styles.line} key={label}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    ) : null;
  const secs = (v: number | null | undefined) => (v === null || v === undefined ? null : formatDuration(v));
  const ms = (v: number | null) => (v === null ? null : `${(v / 1000).toFixed(1)} s`);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.navigate("/trips"))}
        style={styles.back}
        hitSlop={8}
      >
        <Text style={styles.backText}>‹ Field trips</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{h.destination.title}</Text>
        <Text style={styles.hint}>
          {new Date(h.startedAt).toLocaleString("en-GB")} {h.demo ? "· demo drive" : ""} · {h.vehicle} · blue light{" "}
          {h.blueLight ? "on" : "off"}
        </Text>
        <View style={styles.map}>
          <LiveMap compact routes={routes} restrictions={points} fitTo={track.length ? track : null} />
        </View>
        {line("Typed", h.query ? `“${h.query}”` : "picked on the map")}
        {line("Standard route", s.standard ? `${secs(s.standard.etaS)} · ${formatDistance(s.standard.distanceM)}` : null)}
        {line(
          "Blue light",
          s.police ? `${secs(s.police.etaS)} · ${formatDistance(s.police.distanceM)} · ${s.police.restrictions?.length ?? 0} restriction${s.police.restrictions?.length === 1 ? "" : "s"}` : null,
        )}
        {line("Plan times", [ms(s.standardMs) && `standard ${ms(s.standardMs)}`, ms(s.fullMs) && `full ${ms(s.fullMs)}`].filter(Boolean).join(" · ") || null)}
        {line("Followed", s.kind)}
        {line("Took", secs(s.durationS))}
        {line("Driven", s.drivenM ? formatDistance(s.drivenM) : null)}
        {line("ETA error", s.etaErrorS === null ? null : `${s.etaErrorS > 0 ? "+" : ""}${s.etaErrorS} s`)}
        {line("Re-routes", String(s.reroutes))}
        {line("No signal", s.noSignalS ? `${Math.round(s.noSignalS)} s` : null)}
        {line(
          "Other apps",
          others.blueLightMaps !== null || others.googleApple !== null
            ? `Blue Light Maps ${others.blueLightMaps ?? "—"} min · Google/Apple ${others.googleApple ?? "—"} min`
            : null,
        )}
        {line("Ended", s.ended)}

        {marks.length > 0 && <Text style={styles.section}>Marks</Text>}
        {marks.map((m) => (
          <View key={m.t} style={styles.mark}>
            <Text style={styles.value}>
              {new Date(m.t).toLocaleTimeString("en-GB")} · {MARKS.find((x) => x.tag === m.tag)?.label ?? m.tag}
            </Text>
            <NoteField initial={record.notes[String(m.t)] ?? ""} onSave={(note) => saveNote(m.t, note)} />
          </View>
        ))}

        <Text style={styles.section}>Export this trip</Text>
        <View style={styles.buttons}>
          {(
            [
              ["trips", "trips.csv"],
              ["events", "events.csv"],
              ["gpx", "GPX track"],
            ] as const
          ).map(([kind, label]) => (
            <Pressable key={kind} accessibilityRole="button" onPress={() => run(kind)} style={styles.button}>
              <Text style={styles.buttonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {error && <Text style={styles.warn}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

/** A note on a mark, saved when the field is left. */
function NoteField({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={() => text.trim() !== initial && onSave(text.trim())}
      placeholder="Add a note"
      placeholderTextColor={colors.muted}
      style={styles.note}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: "flex-start" },
  backText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 17 },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 24 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  map: { height: 260, borderRadius: 12, overflow: "hidden", marginVertical: 8 },
  line: { flexDirection: "row", gap: 12, paddingVertical: 4 },
  label: { width: 110, color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  value: { flex: 1, color: colors.fg, fontFamily: fonts.body, fontSize: 14 },
  section: {
    marginTop: 16,
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  mark: { gap: 6, paddingVertical: 6, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  note: {
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 15,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 16, textTransform: "uppercase" },
  warn: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 14 },
});
