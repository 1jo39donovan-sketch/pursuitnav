import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Tabs, useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { fetchPursuitInfo, type PursuitInfo } from "../../api/pursuit";
import { boroughAt, cardinal, generallyTowards } from "../../area/area";
import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";
import { formatDistance } from "../../format";
import { useLocation, type Fix } from "../../location/LocationProvider";
import { useSearch } from "../../search/SearchProvider";
import { colors, fonts } from "../../theme";

const POLL_MS = 1000;
// Road and limit older than this are shown as unknown, not as last known.
const STALE_MS = 10000;
const TRACE_POINTS = 8;
const TRACE_MAX_AGE_MS = 30000;
// Below walking pace GPS course is noise.
const MOVING_MS = 2;

const mph = (ms: number) => ms * 2.236936;

/**
 * One screen for the operator in a pursuit: speed, limit, road, heading,
 * borough, next junction and where the car is generally heading. Updates
 * with every GPS fix (about once a second) and keeps the screen on.
 */
export default function PursuitScreen() {
  // Tabs stay mounted once visited: only poll and hold the screen on while this one is showing.
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    activateKeepAwakeAsync("pursuit").catch(() => {});
    return () => {
      deactivateKeepAwake("pursuit").catch(() => {});
    };
  }, [focused]);
  const { fix } = useLocation();
  const { data, places } = useSearch();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  // Recent fixes for map matching, and the last real direction of travel.
  const [trace, setTrace] = useState<{ fixes: Fix[]; course: number | null }>({ fixes: [], course: null });
  const lastFix = trace.fixes[trace.fixes.length - 1];
  if (fix && fix.timestamp !== lastFix?.timestamp) {
    const fixes = [...trace.fixes, fix].filter((f) => fix.timestamp - f.timestamp <= TRACE_MAX_AGE_MS).slice(-TRACE_POINTS);
    const moving = fix.speed != null && fix.speed >= MOVING_MS && fix.course != null;
    setTrace({ fixes, course: moving ? fix.course : trace.course });
  }

  // Road, limit and next junction from the server, every couple of seconds.
  const [info, setInfo] = useState<{ value: PursuitInfo | null; stale: boolean }>({ value: null, stale: true });
  const traceRef = useRef(trace);
  useEffect(() => {
    traceRef.current = trace;
  }, [trace]);
  useEffect(() => {
    if (!focused) return;
    let lastOk = 0;
    let busy = false;
    const controller = new AbortController();
    const tick = async () => {
      const { fixes, course } = traceRef.current;
      if (!busy && fixes.length) {
        busy = true;
        const result = await fetchPursuitInfo(
          fixes.map((f) => ({ lat: f.lat, lng: f.lng })),
          course ?? undefined,
          controller.signal,
        );
        busy = false;
        if (result) {
          lastOk = Date.now();
          setInfo({ value: result, stale: false });
          return;
        }
      }
      if (Date.now() - lastOk > STALE_MS) setInfo((cur) => (cur.stale ? cur : { value: null, stale: true }));
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [focused]);

  const areas = useMemo(
    () => (data.status === "ready" && places.status === "ready" ? data.index.namedAreas() : []),
    [data, places],
  );

  const speed = fix?.speed != null ? Math.round(mph(fix.speed)) : null;
  const pursuit = info.stale ? null : info.value;
  const limit = pursuit?.speedLimitMph ?? null;
  const over = speed != null && limit != null && speed > limit;
  const borough = fix ? boroughAt(fix.lat, fix.lng) : null;
  const heading = trace.course;
  const towards = fix && heading != null ? generallyTowards(fix.lat, fix.lng, heading, areas) : null;

  const speedCell = (
    <View style={[styles.cell, styles.speedCell]}>
      <View>
        <Text
          style={[styles.speed, landscape && styles.speedCompact, over && styles.over]}
          accessibilityLabel={`Speed ${speed ?? "unknown"} miles per hour`}
        >
          {speed ?? "—"}
        </Text>
        <Text style={styles.unit}>MPH</Text>
      </View>
      <View
        style={[styles.roundel, landscape && styles.roundelCompact]}
        accessibilityLabel={limit ? `Speed limit ${limit}` : "Speed limit unknown"}
      >
        <Text style={[styles.roundelText, limit == null && styles.roundelUnknown]}>{limit ?? "—"}</Text>
      </View>
    </View>
  );
  const roadCell = (
    <View style={[styles.cell, styles.grow]}>
      <Text style={styles.label}>On</Text>
      <Text style={styles.big} numberOfLines={2}>
        {pursuit?.road ?? "—"}
      </Text>
    </View>
  );
  const headingCell = (
    <View style={[styles.cell, styles.grow]}>
      <Text style={styles.label}>Heading</Text>
      <View style={styles.compassRow}>
        <View style={styles.dial}>
          {heading != null && (
            <View style={[styles.needleWrap, { transform: [{ rotate: `${heading}deg` }] }]}>
              <View style={styles.needle} />
            </View>
          )}
        </View>
        <Text style={styles.big}>{heading != null ? cardinal(heading) : "—"}</Text>
      </View>
    </View>
  );
  const boroughCell = (
    <View style={[styles.cell, styles.grow]}>
      <Text style={styles.label}>Borough</Text>
      <Text style={styles.big} numberOfLines={2}>
        {borough ?? (fix ? "Outside London" : "—")}
      </Text>
    </View>
  );
  const junctionCell = (
    <View style={[styles.cell, styles.grow]}>
      <Text style={styles.label}>Next junction</Text>
      <Text style={styles.big} numberOfLines={2}>
        {pursuit?.nextJunction?.name ?? "—"}
      </Text>
      {pursuit?.nextJunction && <Text style={styles.dist}>{formatDistance(pursuit.nextJunction.distanceM)}</Text>}
    </View>
  );
  const towardsCell = (
    <View style={[styles.cell, styles.grow]}>
      <Text style={styles.label}>Generally towards</Text>
      <Text style={[styles.big, styles.amber]} numberOfLines={2}>
        {towards ?? "—"}
      </Text>
    </View>
  );
  const serverNote = info.stale && fix && (
    <Text style={styles.note}>Road, limit and junction need the Blue Route server. Showing “—” until it answers.</Text>
  );

  // Portrait: one column, as in the prototype. Landscape: two per row so it all fits.
  const cells = landscape ? (
    <>
      <View style={styles.pair}>
        <View style={styles.grow}>{speedCell}</View>
        {towardsCell}
      </View>
      <View style={styles.pair}>
        {roadCell}
        {boroughCell}
      </View>
      <View style={styles.pair}>
        {headingCell}
        {junctionCell}
      </View>
      {serverNote}
    </>
  ) : (
    <>
      {speedCell}
      {roadCell}
      <View style={styles.pair}>
        {headingCell}
        {boroughCell}
      </View>
      {junctionCell}
      {towardsCell}
      {serverNote}
    </>
  );

  const map = (
    <View style={styles.map}>
      <LiveMap headingUp followZoom={16} compact />
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Every pixel of height counts in landscape: drop the app header there. */}
      <Tabs.Screen options={{ headerShown: !landscape }} />
      <GpsStatus />
      {landscape ? (
        <View style={styles.row}>
          <ScrollView style={styles.side} contentContainerStyle={styles.cells}>
            {cells}
          </ScrollView>
          {map}
        </View>
      ) : (
        <>
          <View style={styles.cells}>{cells}</View>
          {map}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flex: 1, flexDirection: "row" },
  side: { flex: 1.2 },
  cells: { padding: 8, gap: 6 },
  cell: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 0,
  },
  speedCell: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  speedCompact: { fontSize: 60, lineHeight: 62 },
  roundelCompact: { width: 64, height: 64, borderRadius: 32, borderWidth: 7 },
  speed: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 84, lineHeight: 84, fontVariant: ["tabular-nums"] },
  over: { color: colors.warn },
  unit: { color: colors.muted, fontFamily: fonts.displaySemiBold, fontSize: 16, letterSpacing: 2 },
  roundel: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#ffffff",
    borderColor: "#d4232b",
    borderWidth: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  roundelText: { color: "#111111", fontFamily: fonts.displayBold, fontSize: 36 },
  roundelUnknown: { color: "#777777" },
  pair: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
  label: { color: colors.muted, fontFamily: fonts.displaySemiBold, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" },
  big: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26, lineHeight: 30, flexShrink: 1 },
  amber: { color: colors.amber },
  dist: { color: colors.muted, fontFamily: fonts.mono, fontSize: 13 },
  compassRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  dial: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  needleWrap: { width: 40, height: 40, alignItems: "center" },
  // An amber arrowhead pointing up the dial, rotated to the heading.
  needle: {
    marginTop: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.amber,
  },
  note: { color: colors.muted, fontFamily: fonts.mono, fontSize: 11 },
  map: { flex: 1, minHeight: 140, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
});
