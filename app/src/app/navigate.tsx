import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { useNetworkState } from "expo-network";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
import { formatDistance, formatDuration, roadLabel } from "../format";
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
import { demoDriveStartedAt, setDemoPath } from "../demo/demoDrive";
import { recorder, useRecorder } from "../fieldtest/instance";
import { MARKS, type MarkTag } from "../fieldtest/trip";
import {
  linkBanner,
  mayAnnounceReroute,
  nextLink,
  ONLINE,
  onReconnect,
  wayBack,
  type LinkEvent,
  type LinkState,
} from "../navigation/connectivity";
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
import { reportUrl } from "../feedback";
import { loadNotes, noteNear } from "../search/blockNotes";
import { useTextStyles } from "../textSize";

const DEMO_GRACE_MS = 5000;
const ARRIVAL_GRACE_MS = 10_000;

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
  const styles = useTextStyles(baseStyles);
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
  const { fix: lastFix, simulated, facing } = useLocation();
  // When this screen opened. On a demo drive, a fix from before then is from
  // the patrol, not the route the car is about to be put on: not used.
  const [openedAt] = useState(() => Date.now());
  const fix = simulated && lastFix && lastFix.timestamp < openedAt ? null : lastFix;
  const { blockLabels } = useSearch();
  const { vehicle, voice: voiceOn, setVoice, mapView, roads, learning, demoDrive, policeRoutes, mapLook } = useSession();
  const { mapPoints: teamMap } = useTeam();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const prepared = useMemo(() => (active ? prepare(active.route) : null), [active]);
  // The crew's own note on the block they're going to, if they wrote one (Search).
  const destLat = active?.destination.lat;
  const destLng = active?.destination.lng;
  const blockNote = useMemo(
    () => (destLat != null && destLng != null ? noteNear(loadNotes(), { lat: destLat, lng: destLng })?.note : undefined),
    [destLat, destLng],
  );

  // The demo drive follows the route being navigated, from its first point,
  // and goes back on patrol afterwards.
  const shape = active?.route.shape;
  useEffect(() => {
    if (!simulated || !shape) return;
    setDemoPath(shape);
    return () => setDemoPath(null);
  }, [simulated, shape]);

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
      // The demo car's first fixes can still be from before it was put on
      // this route: never call those off route.
      offCount:
        fresh || (simulated && fix.timestamp - demoDriveStartedAt() < DEMO_GRACE_MS)
          ? 0
          : offRouteCount(track.offCount, progress.offRouteBy, fix.accuracy),
    });
  }
  const progress = track.prepared === prepared ? track.progress : null;
  const offRoute = track.prepared === prepared && track.offCount >= OFF_ROUTE_FIXES;

  // Signal. Guidance carries on without it (the route is on the phone); only
  // re-routes need it. When it comes back: re-route at once if off the line,
  // otherwise make the refresh that failed, quietly (navigation/connectivity.ts).
  const [linkState, setLinkState] = useState<LinkState>(ONLINE);
  const linkRef = useRef(linkState);
  const onLink = useCallback((event: LinkEvent) => {
    linkRef.current = nextLink(linkRef.current, event);
    setLinkState(linkRef.current);
  }, []);
  const network = useNetworkState();
  const connected = network.isConnected;
  // Bumped when the network comes back with something to do: starts a re-route at once.
  const [reconnected, setReconnected] = useState<{ n: number; quiet: boolean }>({ n: 0, quiet: false });
  const wasConnected = useRef(connected);
  const offRouteNow = useRef(offRoute);
  useEffect(() => {
    offRouteNow.current = offRoute;
  }, [offRoute]);
  useEffect(() => {
    const before = wasConnected.current;
    wasConnected.current = connected;
    if (connected === false) onLink({ type: "network-down" });
    else if (connected === true && before === false) {
      const owed = onReconnect(linkRef.current, offRouteNow.current);
      onLink({ type: "network-up" });
      if (owed) setReconnected((r) => ({ n: r.n + 1, quiet: owed === "refresh" }));
    }
  }, [connected, onLink]);
  const handledReconnect = useRef(0);

  // Field-test recording (off unless switched on): breadcrumbs, the first
  // ETA once moving, each time off the line, and signal changes.
  useEffect(() => {
    if (fix)
      recorder.event({ type: "fix", lat: fix.lat, lng: fix.lng, speed: fix.speed, heading: fix.course, accuracy: fix.accuracy });
  }, [fix]);
  const etaSaid = useRef<unknown>(null);
  useEffect(() => {
    if (!progress || etaSaid.current === prepared) return;
    etaSaid.current = prepared;
    recorder.event({ type: "eta", etaS: Math.round(progress.remainingS) });
  }, [progress, prepared]);
  useEffect(() => {
    if (offRoute && fix && progress) {
      recorder.event({ type: "off-route", offByM: Math.round(progress.offRouteBy), lat: fix.lat, lng: fix.lng });
    }
    // Once per time off the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offRoute]);
  useEffect(() => {
    recorder.event({ type: "signal", state: linkState.link });
  }, [linkState.link]);
  // Arriving ends the trip, whether or not End is tapped after; not in the
  // first few seconds, when a stale fix (or the demo car before it's put on
  // the route) can sit by the destination.
  const arrived = !!progress?.arrived && !!fix && fix.timestamp - openedAt > ARRIVAL_GRACE_MS;
  useEffect(() => {
    if (arrived) recorder.end("arrived");
  }, [arrived]);

  // Off route for a few seconds, or asked for (an old plan, "Re-route now"),
  // or signal back after a failure: get a new route from here, same kind.
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
    const asked = active.rerouteAsked !== handledAsk.current;
    // Signal back: don't wait out the 10 s after the failure.
    const back = reconnected.n !== handledReconnect.current;
    const forced = asked || back;
    if (!forced && (!offRoute || inFlight.current)) return;
    if (!rerouteAllowed(last.current, Date.now(), forced)) return;
    handledAsk.current = active.rerouteAsked;
    handledReconnect.current = reconnected.n;
    // A refresh on the line, when signal returns, changes nothing on screen until the new route is in.
    // So does freshening an old plan on Go while still on its line: no "Re-routing" for a clean start.
    const quiet = (back && !asked && reconnected.quiet && !offRoute) || (asked && active.rerouteReason === "stale-refresh" && !offRoute);
    // Asked for now: what was in flight was for the old choice.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    // With no signal it isn't re-routing, so it doesn't say so (it still
    // tries, every 10 s, in case the phone's network state is behind).
    const canReroute = mayAnnounceReroute(linkRef.current.link);
    if (!quiet && canReroute) setRerouting(true);
    if (voiceOn && !quiet && canReroute) {
      Speech.stop();
      Speech.speak("Re-routing", { language: "en-GB" });
      recorder.event({ type: "speech", text: "Re-routing" });
    }
    const current = () => inFlight.current === controller && !controller.signal.aborted;
    // Field-test recording: why, how long, how it went, and the route before and after.
    const startedAt = Date.now();
    const trigger = back && !asked ? "signal-back" : asked ? (active.rerouteReason ?? "reroute-now") : "auto";
    const routeKind = (k: string, police: boolean) => (active.follow ? "follow" : k === "police" && police ? "police" : "standard");
    const kindBefore = routeKind(active.kind, "restrictions" in active.route);
    let kindAfter = kindBefore;
    const swapIn = (plan: RoutePlan, stage?: "checking" | "done") => {
      if (!current()) return;
      setRerouting(false);
      kindAfter = routeKind(active.kind, !!plan.police);
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
        onLink({ type: "answer" });
        last.current = { at: Date.now(), ok: true };
        recorder.event({ type: "reroute", trigger, startedAt, ms: Date.now() - startedAt, outcome: "ok", kindBefore, kindAfter });
      })
      .catch((err: unknown) => {
        if (!current()) return;
        const failure = rerouteFailure(err);
        setFailed(failure);
        onLink({ type: "failed", failure });
        last.current = { at: Date.now(), ok: false };
        recorder.event({
          type: "reroute",
          trigger,
          startedAt,
          ms: Date.now() - startedAt,
          outcome: failure ?? "error",
          kindBefore,
          kindAfter: kindBefore,
        });
      })
      .finally(() => {
        if (inFlight.current !== controller) return;
        inFlight.current = null;
        setRerouting(false);
      });
  }, [active, fix, offRoute, replan, vehicle, roads, voiceOn, reconnected, onLink]);
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
    const reason = progress?.arrived ? "arrived" : "end";
    recorder.end(reason);
    stop(reason);
    router.back();
  };

  // Quick actions: one tap each, no second End tap needed.
  const [sheet, setSheet] = useState(false);
  // Field test: one-tap marks while recording ("Wrong instruction", …).
  const { recording } = useRecorder();
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);
  // How much of the map's top the floating turn card covers.
  const [turnHeight, setTurnHeight] = useState(180);
  const newDestination = () => {
    setSheet(false);
    recorder.end("new-destination");
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
      recorder.event({ type: "speech", text: callout.text });
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
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.endButton}>
          <Text style={styles.endText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const isPolice = "restrictions" in active.route;
  const routeColor = isPolice ? colors.amber : colors.blue;
  // The route always in solid blue with a white edge: easy to see on any map.
  const routes: MapRoute[] = [{ id: "nav", shape: active.route.shape, color: colors.blue }];
  const destination: [number, number] = [active.destination.lng, active.destination.lat];
  const restrictions = "restrictions" in active.route ? restrictionPoints(active.route) : [];

  const offRouteMsg = offRouteText(failed, RETRY_AFTER_FAILURE_MS / 1000, reroutingFor);
  // The off-route panel also shows while a re-route asked for on the line is worked out.
  const showOff = offRoute || rerouting;
  const banner = linkBanner(linkState.link);
  // Off the line with no signal: no new route is coming, so show the way back.
  const back =
    offRoute && linkState.link === "no-signal" && fix
      ? wayBack(fix, facing, active.route.shape, active.destination)
      : null;
  const turnPanel = (
    <View style={[styles.turn, showOff && styles.turnOff]}>
      {!progress ? (
        <Text style={styles.instruction}>Waiting for GPS…</Text>
      ) : progress.arrived ? (
        <>
          <Text style={styles.distance}>⚑ Arrived</Text>
          <Text style={styles.instruction}>{active.destination.title}</Text>
          {blockNote && <Text style={styles.blockNote}>✎ {blockNote}</Text>}
        </>
      ) : back ? (
        <View accessibilityRole="alert">
          <Text style={[styles.instruction, styles.noSignal]}>No signal: head back to the route</Text>
          <View style={styles.turnRow}>
            <Text style={[styles.arrow, { transform: [{ rotate: `${back.toRouteTurn}deg` }] }]}>↑</Text>
            <Text style={styles.distance}>{formatDistance(back.toRouteM)}</Text>
          </View>
          <View style={styles.turnRow}>
            <Text style={[styles.smallArrow, { transform: [{ rotate: `${back.toDestinationTurn}deg` }] }]}>↑</Text>
            <Text style={styles.then}>
              Destination {formatDistance(back.toDestinationM)}
              {back.fromNorth ? " · arrows point from north" : ""}
            </Text>
          </View>
        </View>
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
      {banner && !back && (
        <Text accessibilityRole="alert" style={styles.linkBanner}>
          {banner}
        </Text>
      )}
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
            On {(progress && roadLabel(progress.current.streetNames)) ?? "—"}
          </Text>
          {/* The crew's note on the block, as they get close. */}
          {blockNote && progress && !progress.arrived && progress.remainingM < NOTE_WITHIN_M && (
            <Text style={styles.blockNote} numberOfLines={2}>
              ✎ {blockNote}
            </Text>
          )}
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
        {recording && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark this spot for the field test"
            onPress={() => setMarking(true)}
            style={[styles.routeButton, styles.markButton]}
          >
            <Text style={[styles.routeText, styles.markText]}>{marked ? "✓" : "Mark"}</Text>
          </Pressable>
        )}
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
          accessibilityLabel={confirmEnd ? "Tap again to end navigation" : "End navigation"}
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
              lookAhead
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
              lookAhead
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
      {marking && (
        <MarkSheet
          bottomInset={insets.bottom}
          onClose={() => setMarking(false)}
          onMark={(tag) => {
            setMarking(false);
            if (recorder.mark(tag)) {
              setMarked(true);
              setTimeout(() => setMarked(false), 1500);
            }
          }}
        />
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
          onReport={() => {
            setSheet(false);
            const r = active.route;
            void Linking.openURL(
              reportUrl({
                kind: active.kind,
                vehicle,
                roads,
                mapLook,
                distanceM: r.distanceM,
                durationS: r.durationS,
                restrictions: "restrictions" in r ? r.restrictions.length : undefined,
              }),
            ).catch(() => {});
          }}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

/** Field-test marks: one tap saves the time and place; a note can be added later on the Log. */
function MarkSheet({
  onMark,
  onClose,
  bottomInset,
}: {
  onMark: (tag: MarkTag) => void;
  onClose: () => void;
  bottomInset: number;
}) {
  const styles = useTextStyles(baseStyles);
  return (
    <View style={styles.sheetBackdrop}>
      <Pressable style={{ flex: 1 }} accessibilityLabel="Close marks" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.markGrid}>
          {MARKS.map((m) => (
            <Pressable
              key={m.tag}
              accessibilityRole="button"
              onPress={() => onMark(m.tag)}
              style={({ pressed }) => [styles.sheetButton, styles.markOption, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.sheetText}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.sheetButton, styles.sheetCancel, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.sheetText}>Cancel</Text>
        </Pressable>
      </View>
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
  onReport,
  bottomInset,
}: {
  kind: RouteKind;
  blueLightOn: boolean;
  onClose: () => void;
  onNewDestination: () => void;
  onSwitch: (kind: "standard" | "police") => void;
  onRerouteNow: () => void;
  destination: { lat: number; lng: number };
  onReport: () => void;
  bottomInset: number;
}) {
  const styles = useTextStyles(baseStyles);
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
        {/* An email in the tester's own mail app, with nothing about the call in it. */}
        {action("Report a problem with this route", onReport)}
        {action("Cancel", onClose, styles.sheetCancel)}
      </View>
    </View>
  );
}

/** The block note shows from this close to the destination. */
const NOTE_WITHIN_M = 500;

const baseStyles = StyleSheet.create({
  blockNote: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 21 },
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
  smallArrow: { color: colors.amber, fontSize: 26, fontWeight: "700" },
  linkBanner: {
    color: colors.bg,
    backgroundColor: colors.amber,
    fontFamily: fonts.displaySemiBold,
    fontSize: 17,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
    overflow: "hidden",
  },
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
  markButton: { flex: 0, minWidth: 72, minHeight: 56, borderColor: "#e5484d" },
  markText: { color: "#ff8a8d" },
  markGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  markOption: { flexBasis: "47%", flexGrow: 1, borderColor: "#e5484d", paddingHorizontal: 6 },
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
