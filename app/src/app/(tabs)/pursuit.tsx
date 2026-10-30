import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Tabs, useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchPursuitInfo } from "../../api/pursuit";
import { boroughAt, cardinal, generallyTowards } from "../../area/area";
import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";
import { formatDistance } from "../../format";
import { useLocation, type Fix } from "../../location/LocationProvider";
import { notePursuit, pursuitOpened } from "../../navigation/timings";
import { EMPTY_FEED, feedNote, nextFeed, shownInfo } from "../../navigation/serverFeed";
import { useSearch } from "../../search/SearchProvider";
import { useSession } from "../../session/SessionProvider";
import { snapToLine } from "../../navigation/snapLine";
import { useTeam } from "../../team/TeamProvider";
import { recordEvent } from "../../usage/usage";
import { colors, fonts } from "../../theme";
import { useThemed } from "../../textSize";

const POLL_MS = 1000;
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
/** How often the nearest door number may change on screen. */
const DOOR_EVERY_MS = 5_000;
/** Above this the door number is gone before it's read (29 Oct trial): shown only on foot or crawling. */
const DOOR_MAX_MPH = 10;

export default function PursuitScreen() {
  const styles = useThemed(baseStyles);
  // Tabs stay mounted once visited: only poll and hold the screen on while this one is showing.
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    // Usage counts: a pursuit session each time this screen is opened.
    recordEvent("pursuit");
    activateKeepAwakeAsync("pursuit").catch(() => {});
    return () => {
      deactivateKeepAwake("pursuit").catch(() => {});
    };
  }, [focused]);
  const { fix } = useLocation();
  const { mapView } = useSession();
  const { mapPoints: teamMap } = useTeam();
  const { data, places, blockLabels } = useSearch();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const insets = useSafeAreaInsets();

  // Recent fixes for map matching, and the last real direction of travel.
  const [trace, setTrace] = useState<{ fixes: Fix[]; course: number | null }>({ fixes: [], course: null });
  const lastFix = trace.fixes[trace.fixes.length - 1];
  if (fix && fix.timestamp !== lastFix?.timestamp) {
    const fixes = [...trace.fixes, fix].filter((f) => fix.timestamp - f.timestamp <= TRACE_MAX_AGE_MS).slice(-TRACE_POINTS);
    const moving = fix.speed != null && fix.speed >= MOVING_MS && fix.course != null;
    setTrace({ fixes, course: moving ? fix.course : trace.course });
  }

  // Road, limit and next junction from the server, about once a second. Each
  // request gives up after 8 s rather than hanging; answers older
  // than 10 s are shown as "—", never as last known.
  const [feed, setFeed] = useState(EMPTY_FEED);
  const hasFix = trace.fixes.length > 0;
  // When the tab came into view, for Session → Testing's "Pursuit road" time.
  const openedAt = useRef(0);
  useEffect(() => {
    if (!focused) return;
    openedAt.current = Date.now();
    pursuitOpened();
  }, [focused]);
  const [now, setNow] = useState(() => Date.now());
  const traceRef = useRef(trace);
  useEffect(() => {
    traceRef.current = trace;
  }, [trace]);
  useEffect(() => {
    if (!focused) return;
    let busy = false;
    const controller = new AbortController();
    const tick = async () => {
      setNow(Date.now());
      const { fixes, course } = traceRef.current;
      if (busy || !fixes.length) return;
      busy = true;
      const lookup = await fetchPursuitInfo(
        fixes.map((f) => ({ lat: f.lat, lng: f.lng })),
        course ?? undefined,
        controller.signal,
      );
      busy = false;
      if (controller.signal.aborted) return;
      if (lookup.status === "ok" && lookup.info.road) notePursuit(Date.now() - openedAt.current);
      setFeed((cur) => nextFeed(cur, lookup, Date.now()));
    };
    const timer = setInterval(tick, POLL_MS);
    // At once, not a second later: the 30 Oct browser test took ~7 s to show the road.
    void tick();
    return () => {
      clearInterval(timer);
      controller.abort();
    };
    // Again as soon as the first fix arrives.
  }, [focused, hasFix]);

  const areas = useMemo(
    () => (data.status === "ready" && places.status === "ready" ? data.index.namedAreas() : []),
    [data, places],
  );


  // A fix now and then comes without a speed: show the last one for a moment rather than "—".
  const withSpeed = fix ? [...trace.fixes].reverse().find((f) => f.speed != null && fix.timestamp - f.timestamp <= 3000) : undefined;
  const speed = withSpeed?.speed != null ? Math.round(mph(withSpeed.speed)) : null;
  const pursuit = shownInfo(feed, now);
  // The nearest door changes every second on the move: shown only when slow,
  // and at most every 5 s (or at once on a new road), so it can be read.
  const [door, setDoor] = useState<{ near: string | null; road: string | null; at: number }>({ near: null, road: null, at: 0 });
  const nearNow = pursuit?.near ?? null;
  const roadNow = pursuit?.road ?? null;
  if (nearNow !== door.near && (roadNow !== door.road || !door.near || now - door.at >= DOOR_EVERY_MS)) {
    setDoor({ near: nearNow, road: roadNow, at: now });
  }
  // The car drawn on the road it's matched to, when GPS puts it a few metres off.
  const snapTo = fix ? snapToLine(fix, pursuit?.roadShape) : null;
  const limit = pursuit?.speedLimitMph ?? null;
  const over = speed != null && limit != null && speed > limit;
  const borough = fix ? boroughAt(fix.lat, fix.lng) : null;
  const heading = trace.course;
  const towards = fix && heading != null ? generallyTowards(fix.lat, fix.lng, heading, areas) : null;

  const speedCell = (
    <View style={[styles.cell, styles.speedCell]}>
      <View>
        <Text
          style={[styles.speed, over && styles.over]}
          accessibilityLabel={`Speed ${speed ?? "unknown"} miles per hour`}
        >
          {speed ?? "—"}
        </Text>
        <Text style={styles.unit}>MPH</Text>
      </View>
      <View
        style={styles.roundel}
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
      {/* The nearest numbered door: for a foot chase, or where something was thrown. */}
      {/* Always takes its line, blank when hidden, so the tiles don't jump at 10 mph. */}
      <Text style={styles.dist} numberOfLines={1}>
        {pursuit && door.near && (speed == null || speed <= DOOR_MAX_MPH) ? `by ${door.near}` : " "}
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
              <View style={styles.needleTail} />
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
      <Text style={styles.label} numberOfLines={1}>
        Approaching junction
      </Text>
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
  const note = fix ? feedNote(feed, now) : null;
  const serverNote =
    note &&
    (note.title ? (
      <View style={styles.noSignal} accessibilityRole="alert">
        <Text style={styles.noSignalTitle}>{note.title}</Text>
        <Text style={styles.noSignalText}>{note.text}</Text>
      </View>
    ) : (
      <Text style={styles.note}>{note.text}</Text>
    ));

  // Compact readouts in pairs, so the map gets most of the screen: the crew
  // read roads off it. Landscape puts them beside the map.
  const cells = (
    <>
      <View style={styles.pair}>
        <View style={styles.speedWrap}>{speedCell}</View>
        {roadCell}
      </View>
      <View style={styles.pair}>
        {headingCell}
        {boroughCell}
      </View>
      <View style={styles.pair}>
        {junctionCell}
        {towardsCell}
      </View>
      {serverNote}
    </>
  );

  const map = (
    <View style={styles.map}>
      <LiveMap
        snapTo={snapTo}
        lookAhead
        team={teamMap}
        view={mapView}
        viewControl
        zoomControl
        autoZoom
        roadNames
        vehicleArrow
        labels={blockLabels}
        followZoom={16}
        compact
      />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Every pixel counts here: no app header, the readouts and map start at the top. */}
      <Tabs.Screen options={{ headerShown: false }} />
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

const baseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flex: 1, flexDirection: "row" },
  side: { flex: 0.9 },
  cells: { padding: 6, gap: 5 },
  cell: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 0,
  },
  speedCell: { flexDirection: "row", alignItems: "center", gap: 10 },
  speedWrap: { flexShrink: 0 },
  speed: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 54, fontVariant: ["tabular-nums"] },
  over: { color: colors.warn },
  unit: { color: colors.muted, fontFamily: fonts.displaySemiBold, fontSize: 12, letterSpacing: 2 },
  roundel: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ffffff",
    borderColor: "#d4232b",
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  roundelText: { color: "#111111", fontFamily: fonts.displayBold, fontSize: 24 },
  roundelUnknown: { color: "#777777" },
  pair: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
  // Sentence case: shorter than capitals, so "Approaching junction" fits a half-width cell.
  label: { color: colors.muted, fontFamily: fonts.displaySemiBold, fontSize: 13 },
  big: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 21, lineHeight: 25, flexShrink: 1 },
  amber: { color: colors.amber },
  dist: { color: colors.muted, fontFamily: fonts.mono, fontSize: 13 },
  compassRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  dial: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  // Fills the dial exactly, so it turns about the dial's centre (it was larger than the dial, so turned off-centre).
  needleWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center" },
  // An amber arrow pointing up the dial, rotated to the heading. Long and
  // narrow, with a tail, so which end is the point is never in doubt (a
  // squat triangle read as pointing the wrong way).
  needle: {
    marginTop: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.amber,
  },
  needleTail: { width: 3, height: 8, backgroundColor: colors.amber, opacity: 0.6 },
  note: { color: colors.muted, fontFamily: fonts.mono, fontSize: 11 },
  noSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  noSignalTitle: { color: colors.amber, fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 1 },
  noSignalText: { flex: 1, color: colors.fg, fontFamily: fonts.body, fontSize: 13 },
  map: { flex: 1, minHeight: 140, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
});
