import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRoutes, restrictionPoints, type RoutePlan } from "../api/routes";
import { fetchFollow } from "../api/teams";
import { queueSamples } from "../learning/queue";
import { wayTimes, type Observation } from "../learning/timing";
import { GpsStatus } from "../components/GpsStatus";
import { LiveMap } from "../components/LiveMap";
import { namedPoints, type MapRoute } from "../components/mapShared";
import { formatDistance, formatDuration } from "../format";
import { routeOrigin, useLocation } from "../location/LocationProvider";
import { useNavigation } from "../navigation/NavigationProvider";
import { offRouteText, rerouteFailure, type RerouteFailure } from "../navigation/reroute";
import { nextCallout } from "../navigation/voice";
import { useSearch } from "../search/SearchProvider";
import { useSession } from "../session/SessionProvider";
import { useTeam } from "../team/TeamProvider";
import {
  maneuverArrow,
  upcomingInstruction,
  OFF_ROUTE_FIXES,
  offRouteCount,
  prepare,
  progressAt,
  type PreparedRoute,
  type Progress,
} from "../navigation/progress";
import { colors, fonts } from "../theme";

interface Timing {
  prepared: PreparedRoute | null;
  obs: Observation[];
}

/** Queues the road times measured on a route, and starts afresh on the next. */
function flushTiming(t: Timing, next: PreparedRoute | null): Timing {
  if (t.prepared?.route.ways && t.obs.length > 1) {
    queueSamples(wayTimes(t.prepared.route.ways, t.prepared.cumulative, t.obs));
  }
  return { prepared: next, obs: [] };
}

// While re-routing fails (no signal), try again this often.
const RETRY_MS = 10000;

/** Turn-by-turn guidance, readable at a glance by the operator. */
export default function NavigateScreen() {
  // Screen stays on while navigating. Ending quickly can release the lock
  // before it has taken hold; that's harmless, so it isn't an error.
  useEffect(() => {
    activateKeepAwakeAsync("navigate").catch(() => {});
    return () => {
      deactivateKeepAwake("navigate").catch(() => {});
    };
  }, []);
  const { active, replan, stop } = useNavigation();
  const { fix } = useLocation();
  const { data, places } = useSearch();
  const { vehicle, voice: voiceOn, setVoice, mapView, roads, learning, demoDrive } = useSession();
  const { mapPoints: teamMap } = useTeam();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const prepared = useMemo(() => (active ? prepare(active.route) : null), [active]);

  // Progress along the route, updated once per GPS fix. The last segment
  // carries forward so a route doubling back on itself snaps to the right leg.
  const [track, setTrack] = useState<{
    prepared: typeof prepared;
    fixAt: number;
    progress: Progress | null;
    offCount: number;
  }>({ prepared: null, fixAt: 0, progress: null, offCount: 0 });
  if (prepared && fix && (fix.timestamp !== track.fixAt || prepared !== track.prepared)) {
    const fresh = prepared !== track.prepared;
    const progress = progressAt(prepared, fix, fresh ? 0 : (track.progress?.segment ?? 0));
    setTrack({
      prepared,
      fixAt: fix.timestamp,
      progress,
      offCount: fresh ? 0 : offRouteCount(track.offCount, progress.offRouteBy, fix.accuracy),
    });
  }
  const progress = track.prepared === prepared ? track.progress : null;
  const offRoute = track.prepared === prepared && track.offCount >= OFF_ROUTE_FIXES;

  // Off route for a few seconds: get a new route from here, same kind.
  const inFlight = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  // Each request gives up after 8 s, so a dead connection shows as no signal rather than hanging.
  const [failed, setFailed] = useState<RerouteFailure>(null);
  useEffect(() => {
    if (!active || !fix || !offRoute || inFlight.current) return;
    if (Date.now() - lastAttempt.current < RETRY_MS) return;
    lastAttempt.current = Date.now();
    const controller = new AbortController();
    inFlight.current = controller;
    // A standard route only needs the quick request; a blue-light one the full check.
    // Follow-in re-routes back onto the colleague's track, not to a fresh route.
    const fresh: Promise<RoutePlan> = active.follow
      ? fetchFollow(routeOrigin(fix), active.follow.track, vehicle, roads, controller.signal).then((f) => ({
          standard: f.route,
          police: f.route,
        }))
      : fetchRoutes(routeOrigin(fix), active.destination, vehicle, controller.signal, active.kind === "standard", roads);
    fresh
      .then((plan) => {
        setFailed(null);
        replan(plan);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setFailed(rerouteFailure(err));
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, [active, fix, offRoute, replan, vehicle, roads]);
  useEffect(() => () => inFlight.current?.abort(), []);

  // Opt-in learning: time each road of this route while on it. Only way IDs
  // and seconds are kept, on the phone, and sent hours later (learning/queue.ts).
  const timing = useRef<Timing>({ prepared: null, obs: [] });
  useEffect(() => {
    if (!learning || demoDrive || !prepared) return;
    if (timing.current.prepared !== prepared) timing.current = flushTiming(timing.current, prepared);
    if (offRoute) timing.current = flushTiming(timing.current, null);
    else if (progress && fix) timing.current.obs.push({ along: progress.along, at: fix.timestamp });
  }, [learning, demoDrive, prepared, progress, offRoute, fix]);
  useEffect(() => () => void flushTiming(timing.current, null), []);

  const end = () => {
    stop();
    router.back();
  };

  // Spoken directions, so the crew can keep their eyes on the road.
  // Remembered between routes (and set on Session), so a muted app stays muted.
  const toggleVoice = () => {
    setVoice(!voiceOn);
    if (voiceOn) Speech.stop();
  };
  const said = useRef<{ route: unknown; keys: Set<string> }>({ route: null, keys: new Set() });
  useEffect(() => {
    if (!progress || !prepared || offRoute) return;
    // A new route (after a re-route) starts its callouts afresh.
    if (said.current.route !== prepared) said.current = { route: prepared, keys: new Set() };
    const callout = nextCallout(progress, said.current.keys);
    if (!callout) return;
    said.current.keys.add(callout.key);
    if (voiceOn) {
      Speech.stop();
      Speech.speak(callout.text, { language: "en-GB" });
    }
  }, [progress, prepared, offRoute, voiceOn]);
  useEffect(() => () => void Speech.stop(), []);

  // Ending takes a second tap, so a bump on the way doesn't drop the route.
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 3000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  // Named blocks and estates round the destination, so the crew can find the right one.
  const destLat = active?.destination.lat;
  const destLng = active?.destination.lng;
  const blockLabels = useMemo(
    () =>
      data.status === "ready" && places.status === "ready" && destLat != null && destLng != null
        ? namedPoints(data.index.housingNear(destLat, destLng, 600))
        : null,
    [data, places, destLat, destLng],
  );

  if (!active || !prepared) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyText}>No route chosen.</Text>
        <Pressable onPress={() => router.back()} style={styles.endButton}>
          <Text style={styles.endText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const isPolice = "restrictions" in active.route;
  const routeColor = isPolice ? colors.amber : colors.blue;
  const routes: MapRoute[] = [{ id: "nav", shape: active.route.shape, color: routeColor, dashed: isPolice }];
  const destination: [number, number] = [active.destination.lng, active.destination.lat];
  const restrictions = "restrictions" in active.route ? restrictionPoints(active.route) : [];

  const offRouteMsg = offRouteText(failed, RETRY_MS / 1000);
  const turnPanel = (
    <View style={[styles.turn, offRoute && styles.turnOff]}>
      {!progress ? (
        <Text style={styles.instruction}>Waiting for GPS…</Text>
      ) : progress.arrived ? (
        <>
          <Text style={styles.distance}>⚑ Arrived</Text>
          <Text style={styles.instruction}>{active.destination.title}</Text>
        </>
      ) : offRoute ? (
        <View accessibilityRole={failed ? "alert" : undefined}>
          <Text style={[styles.distance, failed === "no-signal" && styles.noSignal]}>{offRouteMsg.title}</Text>
          <Text style={styles.instruction}>{offRouteMsg.detail}</Text>
        </View>
      ) : (
        <>
          <View style={styles.turnRow}>
            <Text style={styles.arrow}>{maneuverArrow(progress.next?.type ?? 4)}</Text>
            <Text style={styles.distance}>{formatDistance(progress.distanceToNextM)}</Text>
          </View>
          <Text style={styles.instruction} numberOfLines={3}>
            {progress.next ? upcomingInstruction(progress.next) : "Continue to your destination."}
          </Text>
          {progress.after && (
            <Text style={styles.then} numberOfLines={1}>
              Then {maneuverArrow(progress.after.type)} {upcomingInstruction(progress.after)}
            </Text>
          )}
        </>
      )}
      {active.note && <Text style={styles.note}>{active.note}</Text>}
    </View>
  );

  const etaPanel = (
    <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
      <View style={styles.eta}>
        <Text style={styles.etaClock}>
          {progress
            ? new Date(track.fixAt + progress.remainingS * 1000).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </Text>
        <Text style={styles.etaMeta}>
          {progress ? `${formatDuration(progress.remainingS)} · ${formatDistance(progress.remainingM)}` : ""}
        </Text>
        <Text style={styles.road} numberOfLines={1}>
          On {progress?.current.streetNames[0] ?? "—"}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.badge, { color: routeColor, borderColor: routeColor }]}>
          {isPolice
            ? `BLUE LIGHT · ${"restrictions" in active.route ? active.route.restrictions.length : 0} RESTR.`
            : "STANDARD"}
        </Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceOn }}
            aria-checked={voiceOn}
            accessibilityLabel="Spoken directions"
            onPress={toggleVoice}
            hitSlop={8}
            style={[styles.voiceButton, !voiceOn && styles.voiceOff]}
          >
            <Text style={styles.voiceText}>{voiceOn ? "🔊" : "🔇"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Tap twice to end navigation"
            onPress={() => (confirmEnd || progress?.arrived ? end() : setConfirmEnd(true))}
            style={[styles.endButton, confirmEnd && styles.endConfirm]}
          >
            <Text style={styles.endText}>{confirmEnd ? "Tap to end" : "End"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <GpsStatus />
      {landscape ? (
        <View style={styles.row}>
          <View style={styles.landscapeSide}>
            {turnPanel}
            <View style={{ flex: 1 }} />
            {etaPanel}
          </View>
          <View style={styles.map}>
            <LiveMap
              team={teamMap}
              view={mapView}
              viewControl
              zoomControl
              autoZoom
              roadNames
              vehicleArrow
              followZoom={16.5}
              routes={routes}
              destination={destination}
              restrictions={restrictions}
              labels={blockLabels}
              compact
            />
          </View>
        </View>
      ) : (
        <>
          {turnPanel}
          <View style={styles.map}>
            <LiveMap
              team={teamMap}
              view={mapView}
              viewControl
              zoomControl
              autoZoom
              roadNames
              followZoom={16.5}
              routes={routes}
              destination={destination}
              restrictions={restrictions}
              labels={blockLabels}
              compact
            />
          </View>
          {etaPanel}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { alignItems: "center", justifyContent: "center", gap: 16 },
  emptyText: { color: colors.muted, fontFamily: fonts.body, fontSize: 16 },
  row: { flex: 1, flexDirection: "row" },
  landscapeSide: { width: "42%", borderRightColor: colors.line, borderRightWidth: StyleSheet.hairlineWidth },
  map: { flex: 1 },
  turn: {
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  turnOff: { backgroundColor: "#2a1d0a" },
  turnRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  arrow: { color: colors.amber, fontSize: 56, lineHeight: 64, fontWeight: "700" },
  distance: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 58, fontVariant: ["tabular-nums"] },
  noSignal: { color: colors.amber },
  instruction: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26, lineHeight: 30 },
  then: { color: colors.muted, fontFamily: fonts.body, fontSize: 15 },
  note: { color: colors.amber, fontFamily: fonts.body, fontSize: 14, marginTop: 4 },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  eta: { flex: 1, minWidth: 0 },
  etaClock: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 40, fontVariant: ["tabular-nums"] },
  etaMeta: { color: colors.muted, fontFamily: fonts.mono, fontSize: 13 },
  road: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 15, marginTop: 2 },
  side: { alignItems: "flex-end", gap: 8 },
  badge: { fontFamily: fonts.mono, fontSize: 11, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  buttons: { flexDirection: "row", gap: 10, alignItems: "center" },
  voiceButton: {
    minWidth: 52,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceOff: { borderColor: colors.warn },
  voiceText: { fontSize: 24 },
  endButton: {
    backgroundColor: colors.warn,
    borderRadius: 8,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  endConfirm: { backgroundColor: "#ff3b30" },
  endText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 1, textTransform: "uppercase" },
});
