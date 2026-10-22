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
import { useElapsed } from "../components/useElapsed";
import { LiveMap } from "../components/LiveMap";
import type { MapRoute } from "../components/mapShared";
import { ExternalLinks } from "../components/RoutePanel";
import { formatDistance, formatDuration } from "../format";
import { routeOrigin, useLocation } from "../location/LocationProvider";
import { useNavigation, type RouteKind } from "../navigation/NavigationProvider";
import {
  offRouteText,
  policeReroute,
  RETRY_AFTER_FAILURE_MS,
  rerouteAllowed,
  rerouteFailure,
  type LastReroute,
  type RerouteFailure,
} from "../navigation/reroute";
import { nextCallout } from "../navigation/voice";
import { recordEvent } from "../usage/usage";
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
  const { active, replan, rerouteNow, stop } = useNavigation();
  // Usage counts: one navigation session per time this screen opens.
  useEffect(() => recordEvent("navigation"), []);
  const { fix } = useLocation();
  const { blockLabels } = useSearch();
  const { vehicle, voice: voiceOn, setVoice, mapView, roads, learning, demoDrive, policeRoutes } = useSession();
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

  // Off route for a few seconds, or asked for (an old plan, "Re-route now"):
  // get a new route from here, same kind.
  const inFlight = useRef<AbortController | null>(null);
  const last = useRef<LastReroute | null>(null);
  const handledAsk = useRef(0);
  // A re-route gives up after 30 s; "No signal" only when the network itself failed.
  const [failed, setFailed] = useState<RerouteFailure>(null);
  // Waiting for the first new route (not for the blue-light check after it).
  const [rerouting, setRerouting] = useState(false);
  const reroutingFor = useElapsed(rerouting);
  useEffect(() => {
    if (!active || !fix) return;
    const forced = active.rerouteAsked !== handledAsk.current;
    if (!forced && (!offRoute || inFlight.current)) return;
    if (!rerouteAllowed(last.current, Date.now(), forced)) return;
    handledAsk.current = active.rerouteAsked;
    // Asked for now: what was in flight was for the old choice.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setRerouting(true);
    if (voiceOn) {
      Speech.stop();
      Speech.speak("Re-routing", { language: "en-GB" });
    }
    const current = () => inFlight.current === controller && !controller.signal.aborted;
    const swapIn = (plan: RoutePlan, stage?: "checking" | "done") => {
      if (!current()) return;
      setRerouting(false);
      replan(plan, stage);
    };
    const from = routeOrigin(fix);
    // Follow-in re-routes back onto the colleague's track, not to a fresh route.
    // A standard route only needs the quick request. A blue-light one swaps
    // in the quick standard route at once, then the blue-light one if any.
    const work: Promise<void> = active.follow
      ? fetchFollow(from, active.follow.track, vehicle, roads, controller.signal).then((f) =>
          swapIn({ standard: f.route, police: f.route }),
        )
      : active.kind === "standard"
        ? fetchRoutes(from, active.destination, vehicle, controller.signal, true, roads).then((plan) => swapIn(plan))
        : policeReroute(
            (standardOnly) => fetchRoutes(from, active.destination, vehicle, controller.signal, standardOnly, roads),
            swapIn,
            () => !current(),
          );
    work
      .then(() => {
        if (!current()) return;
        setFailed(null);
        last.current = { at: Date.now(), ok: true };
      })
      .catch((err: unknown) => {
        if (!current()) return;
        setFailed(rerouteFailure(err));
        last.current = { at: Date.now(), ok: false };
      })
      .finally(() => {
        if (inFlight.current !== controller) return;
        inFlight.current = null;
        setRerouting(false);
      });
  }, [active, fix, offRoute, replan, vehicle, roads, voiceOn]);
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
    stop(progress?.arrived ? "arrived" : "end");
    router.back();
  };

  // Quick actions: one tap each, no second End tap needed.
  const [sheet, setSheet] = useState(false);
  // How much of the map's top the floating turn card covers.
  const [turnHeight, setTurnHeight] = useState(180);
  const newDestination = () => {
    setSheet(false);
    stop("new-destination");
    // Back to Search, wherever navigation was started from (follow-in starts on Session).
    if (router.canGoBack()) router.back();
    router.navigate("/search");
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

  const offRouteMsg = offRouteText(failed, RETRY_AFTER_FAILURE_MS / 1000, reroutingFor);
  // The off-route panel also shows while a re-route asked for on the line is worked out.
  const showOff = offRoute || rerouting;
  const turnPanel = (
    <View style={[styles.turn, showOff && styles.turnOff]}>
      {!progress ? (
        <Text style={styles.instruction}>Waiting for GPS…</Text>
      ) : progress.arrived ? (
        <>
          <Text style={styles.distance}>⚑ Arrived</Text>
          <Text style={styles.instruction}>{active.destination.title}</Text>
        </>
      ) : showOff ? (
        <View accessibilityRole={failed ? "alert" : undefined}>
          <Text style={[styles.distance, failed === "no-signal" && styles.noSignal]}>
            {offRoute ? offRouteMsg.title : "Re-routing"}
          </Text>
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

  // Two rows, so nothing has to squeeze: arrival time and road, then the buttons.
  const etaPanel = (
    <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
      <View style={styles.etaRow}>
        <Text style={styles.etaClock} numberOfLines={1}>
          {progress
            ? new Date(track.fixAt + progress.remainingS * 1000).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </Text>
        <View style={styles.eta}>
          <Text style={styles.etaMeta} numberOfLines={1}>
            {progress ? `${formatDuration(progress.remainingS)} · ${formatDistance(progress.remainingM)}` : ""}
          </Text>
          <Text style={styles.road} numberOfLines={1}>
            On {progress?.current.streetNames[0] ?? "—"}
          </Text>
        </View>
        <Text style={[styles.badge, { color: routeColor, borderColor: routeColor }]}>
          {isPolice
            ? `BLUE LIGHT · ${"restrictions" in active.route ? active.route.restrictions.length : 0}`
            : "STANDARD"}
        </Text>
      </View>
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
          accessibilityLabel="Route options"
          onPress={() => setSheet(true)}
          style={styles.routeButton}
        >
          <Text style={styles.routeText}>Route</Text>
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
          {/* The map fills the screen; the next turn floats over its top. */}
          <View style={styles.map}>
            <LiveMap
              overlayTop={turnHeight}
              overlayBottom={18}
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
            <View
              style={styles.turnFloat}
              pointerEvents="box-none"
              onLayout={(e) => setTurnHeight(e.nativeEvent.layout.height + 8)}
            >
              {turnPanel}
            </View>
          </View>
          {etaPanel}
        </>
      )}
      {sheet && (
        <RouteSheet
          kind={active.kind}
          blueLightOn={policeRoutes}
          onClose={() => setSheet(false)}
          onNewDestination={newDestination}
          onSwitch={(kind) => {
            setSheet(false);
            rerouteNow(kind);
          }}
          onRerouteNow={() => {
            setSheet(false);
            rerouteNow();
          }}
          destination={active.destination}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

/** The quick actions behind the Route button, each one big and one tap. */
function RouteSheet({
  kind,
  blueLightOn,
  onClose,
  onNewDestination,
  onSwitch,
  onRerouteNow,
  destination,
  bottomInset,
}: {
  kind: RouteKind;
  blueLightOn: boolean;
  onClose: () => void;
  onNewDestination: () => void;
  onSwitch: (kind: "standard" | "police") => void;
  onRerouteNow: () => void;
  destination: { lat: number; lng: number };
  bottomInset: number;
}) {
  const action = (label: string, onPress: () => void, style?: object) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sheetButton, style, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.sheetText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={{ flex: 1 }} accessibilityLabel="Close route options" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        {action("New destination", onNewDestination)}
        {/* Follow-in keeps to the colleague's way in, so there's nothing to switch to. */}
        {kind === "police" && action("Switch to standard", () => onSwitch("standard"))}
        {kind === "standard" && blueLightOn && action("Switch to blue light", () => onSwitch("police"))}
        {action("Re-route now", onRerouteNow)}
        {/* Handing over to another app leaves this navigation running underneath. */}
        <ExternalLinks lat={destination.lat} lng={destination.lng} onOpen={onClose} />
        {action("Cancel", onClose, styles.sheetCancel)}
      </View>
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
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  turnFloat: { position: "absolute", top: 8, left: 8, right: 8 },
  turnOff: { backgroundColor: "#2a1d0a" },
  turnRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  arrow: { color: colors.amber, fontSize: 56, lineHeight: 64, fontWeight: "700" },
  distance: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 52,
    lineHeight: 58,
    fontVariant: ["tabular-nums"],
  },
  noSignal: { color: colors.amber },
  instruction: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26, lineHeight: 30 },
  then: { color: colors.muted, fontFamily: fonts.body, fontSize: 15 },
  note: { color: colors.amber, fontFamily: fonts.body, fontSize: 14, marginTop: 4 },
  bottom: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginTop: -18,
  },
  etaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  eta: { flex: 1, minWidth: 0 },
  etaClock: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 36,
    lineHeight: 40,
    fontVariant: ["tabular-nums"],
  },
  etaMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  road: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 15 },
  badge: {
    fontFamily: fonts.mono,
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  buttons: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  voiceButton: {
    width: 56,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceOff: { borderColor: colors.warn },
  voiceText: { fontSize: 24 },
  endButton: {
    flex: 1,
    backgroundColor: colors.warn,
    borderRadius: 10,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  routeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
    alignItems: "center",
  },
  routeText: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sheetBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: colors.panel,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  sheetButton: {
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetCancel: { borderColor: colors.line },
  sheetText: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  endConfirm: { backgroundColor: "#ff3b30" },
  endText: {
    color: "#ffffff",
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
