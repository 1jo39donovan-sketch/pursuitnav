// An area at a glance, one tap from a route to each place in it, with the
// crew's own notes for it (kept on this phone only: radio channels and the
// like never ship with the app). Opened from Session.
//   Police: a BCU, with its custody suites, police stations and A&Es.
//   Ambulance and fire: a borough, with its ambulance or fire stations and A&Es.
//   Other: a borough, with its police, ambulance and fire stations and A&Es.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { custodyIn, custodyStation, type CustodySuite } from "../area/custody";
import { formatDistance } from "../format";
import { aeDestination, isAE } from "../search/quickPlaces";
import { distanceM } from "../geo";
import { useLocation } from "../location/LocationProvider";
import { BCUS, bcuFor, type BoroughGroup } from "../search/boroughGroups";
import { BOROUGHS, type Borough } from "../search/boroughs";
import type { PointOfInterest } from "../search/places";
import { useSearch } from "../search/SearchProvider";
import { useSession } from "../session/SessionProvider";
import { store } from "../storage/store";
import { colors, fonts } from "../theme";
import type { ServiceType } from "../vehicles";
import { useThemed, useColors } from "../textSize";

/** The stations each service wants listed, by OpenStreetMap place type. */
const STATIONS: Record<ServiceType, { types: string[]; label: string }> = {
  police: { types: ["Police station"], label: "Police stations" },
  ambulance: { types: ["Ambulance station"], label: "Ambulance stations" },
  fire: { types: ["Fire station"], label: "Fire stations" },
  other: { types: ["Police station", "Ambulance station", "Fire station"], label: "Emergency service stations" },
};

/** Ambulance and fire areas are boroughs: the boroughs being worked first. */
function boroughUnits(chosen: readonly Borough[]): BoroughGroup[] {
  const order = [...chosen, ...BOROUGHS.filter((b) => !chosen.includes(b))];
  return order.map((b) => ({ code: b, name: b, boroughs: [b] }));
}

/** Route to a place: Search works out both routes, as for a search result. */
function go(title: string, lat: number, lng: number) {
  // Every parameter is given, so none is left over from an earlier visit.
  router.navigate({ pathname: "/search", params: { lat: String(lat), lng: String(lng), title, q: "", from: `area-${Date.now()}` } });
}

export default function AreaScreen() {
  const palette = useColors();
  const styles = useThemed(baseStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const { boroughs, service } = useSession();
  // Police (and installs from before the service choice) work by BCU.
  const police = service === "police" || service === null;
  const stationKind = STATIONS[service ?? "police"];
  const units = useMemo(() => (police ? BCUS : boroughUnits(boroughs)), [police, boroughs]);
  const unitWord = police ? "BCU" : "borough";
  const notesKey = (c: string) => (police ? `bcuNotes:${c}` : `areaNotes:${c}`);
  const { data, places } = useSearch();
  const { fix } = useLocation();
  const [code, setCode] = useState(
    () =>
      units.find((g) => g.code === params.code)?.code ??
      (police ? bcuFor(boroughs)?.code : boroughs[0]) ??
      units[0]!.code,
  );
  const bcu = units.find((g) => g.code === code) ?? units[0]!;

  const away = (p: { lat: number; lng: number }) => (fix ? distanceM(fix, p) : null);
  const byDistance = <T extends { lat: number; lng: number }>(list: T[]) =>
    fix ? [...list].sort((a, b) => distanceM(fix, a) - distanceM(fix, b)) : list;

  // A&E entrances can sit over a borough line from their hospital: looked for everywhere.
  const entrancesAll = useMemo(
    () =>
      data.status === "ready"
        ? data.index.pointsOfInterestIn(new Set(BOROUGHS), new Set(["health"])).filter((p) => p.type === "A&E entrance")
        : [],
    [data, places.status], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { custody, stations, aes } = useMemo(() => {
    const all = data.status === "ready" ? data.index.pointsOfInterestIn(new Set(bcu.boroughs), new Set(["emergency", "health"])) : [];
    const custody = police ? custodyIn(bcu.boroughs).map((suite) => ({ suite, place: custodyStation(suite, all) })) : [];
    const taken = new Set(custody.flatMap((c) => (c.place ? [c.place] : [])));
    return {
      custody,
      stations: all.filter((p) => stationKind.types.includes(p.type) && !taken.has(p)),
      aes: all.filter(isAE),
    };
  }, [data, bcu, places.status, police, stationKind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notes are saved a moment after typing stops (not on every key), and
  // straight away on switching BCU or leaving the screen.
  const [notes, setNotesState] = useState(() => store.getSetting(notesKey(code)) ?? "");
  const unsaved = useRef<{ code: string; text: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNow = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (unsaved.current) store.setSetting(notesKey(unsaved.current.code), unsaved.current.text);
    unsaved.current = null;
  };
  // On leaving: the service (and so where notes go) can't change while this screen is open.
  useEffect(() => saveNow, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (next: string) => {
    saveNow();
    setCode(next);
    setNotesState(store.getSetting(notesKey(next)) ?? "");
  };
  const setNotes = (text: string) => {
    setNotesState(text);
    unsaved.current = { code, text };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 600);
  };

  const placesNote =
    data.status !== "ready" || places.status !== "ready"
      ? `${stationKind.label} and A&Es appear once places have downloaded from the BlueRoute server.`
      : null;

  const placeRow = (p: PointOfInterest, badge?: string) => {
    const d = away(p);
    return (
      <View key={`${p.name}|${p.lat}`} style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.name}>{p.name}</Text>
          <Text style={styles.meta}>
            {[badge, p.address || p.borough, d !== null ? formatDistance(d) : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <GoButton
          label={`Route to ${p.name}`}
          onPress={() => {
            // A hospital: its A&E entrance when one is mapped.
            const to = p.type === "Hospital with A&E" ? aeDestination(p, entrancesAll) : p;
            go(to.name, to.lat, to.lng);
          }}
        />
      </View>
    );
  };

  const custodyRow = ({ suite, place }: { suite: CustodySuite; place: PointOfInterest | null }) => {
    const badge = `${suite.kind === "24/7" ? "24/7 custody" : "Contingency"}${suite.agency !== "MPS" ? ` · ${suite.agency}` : ""}`;
    if (place) return placeRow({ ...place, name: `${suite.name} custody` }, `${badge} · ${place.name}`);
    return (
      <View key={suite.name} style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.name}>{suite.name} custody</Text>
          <Text style={styles.meta}>
            {badge} · {placesNote ? "search for it" : "not on the map as a police station: search for it"}
          </Text>
        </View>
        <GoButton
          label={`Search for ${suite.name}`}
          text="Find"
          onPress={() => router.navigate({ pathname: "/search", params: { q: suite.search, lat: "", lng: "", title: "", from: `area-${Date.now()}` } })}
        />
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Session"
        onPress={() => (router.canGoBack() ? router.back() : router.navigate("/"))}
        style={styles.back}
        hitSlop={8}
      >
        <Text style={styles.backText}>‹ Session</Text>
      </Pressable>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>
          {bcu.name} {police && <Text style={styles.code}>{bcu.code}</Text>}
        </Text>
        {police && <Text style={styles.hint}>{bcu.boroughs.join(" · ")}</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {units.map((g) => (
            <Pressable
              key={g.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: g.code === code }}
              accessibilityLabel={g.name}
              onPress={() => pick(g.code)}
              style={[styles.chip, g.code === code && styles.chipOn]}
            >
              <Text style={[styles.chipText, g.code === code && styles.chipTextOn]}>{g.code}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {police && <Text style={styles.section}>Custody</Text>}
        {police &&
          (custody.length ? custody.map(custodyRow) : <Text style={styles.empty}>No custody suite in this BCU.</Text>)}

        <Text style={styles.section}>{stationKind.label}</Text>
        {placesNote ? (
          <Text style={styles.empty}>{placesNote}</Text>
        ) : stations.length ? (
          byDistance(stations).map((p) => placeRow(p))
        ) : (
          <Text style={styles.empty}>None mapped in this {unitWord}.</Text>
        )}

        <Text style={styles.section}>A&E</Text>
        {placesNote ? null : aes.length ? (
          byDistance(aes).map((p) => placeRow(p))
        ) : (
          <Text style={styles.empty}>No A&E mapped in this {unitWord}.</Text>
        )}

        <Text style={styles.section} nativeID="area-notes-label">
          My notes
        </Text>
        <Text style={styles.hint}>Kept on this phone only, never sent anywhere.</Text>
        <TextInput
          accessibilityLabelledBy="area-notes-label"
          value={notes}
          onChangeText={setNotes}
          onBlur={saveNow}
          multiline
          placeholder={`Anything you want to hand for this ${unitWord}`}
          placeholderTextColor={palette.muted}
          style={styles.notes}
        />
      </ScrollView>
    </View>
  );
}

function GoButton({ label, onPress, text = "Go" }: { label: string; onPress: () => void; text?: string }) {
  const styles = useThemed(baseStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.go, text !== "Go" && styles.find, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.goText, text !== "Go" && styles.findText]}>{text}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: "flex-start" },
  backText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 17 },
  content: { paddingHorizontal: 16, gap: 6 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26 },
  code: { color: colors.muted, fontFamily: fonts.mono, fontSize: 18 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  chips: { gap: 8, paddingVertical: 8 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.mono, fontSize: 14 },
  chipTextOn: { color: "#ffffff" },
  section: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  go: { backgroundColor: colors.blue, borderRadius: 10, minWidth: 64, minHeight: 48, alignItems: "center", justifyContent: "center" },
  goText: { color: "#0c1220", fontFamily: fonts.displayBold, fontSize: 18 },
  find: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  findText: { color: colors.fg },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, paddingVertical: 6 },
  notes: {
    minHeight: 110,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlignVertical: "top",
  },
});
