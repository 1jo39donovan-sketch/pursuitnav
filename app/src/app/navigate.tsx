import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRoutes } from "../api/routes";
import { GpsStatus } from "../components/GpsStatus";
import { LiveMap } from "../components/LiveMap";
import type { MapRoute } from "../components/mapShared";
import { formatDistance, formatDuration } from "../format";
import { routeOrigin, useLocation } from "../location/LocationProvider";
import { useNavigation } from "../navigation/NavigationProvider";
import {
  maneuverArrow,
  OFF_ROUTE_FIXES,
  offRouteCount,
  prepare,
  progressAt,
  type Progress,
} from "../navigation/progress";
import { colors, fonts } from "../theme";

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
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active || !fix || !offRoute || inFlight.current) return;
    if (Date.now() - lastAttempt.current < RETRY_MS) return;
    lastAttempt.current = Date.now();
    const controller = new AbortController();
    inFlight.current = controller;
    fetchRoutes(routeOrigin(fix), active.destination, controller.signal)
      .then((plan) => {
        setFailed(false);
        replan(plan);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, [active, fix, offRoute, replan]);
  useEffect(() => () => inFlight.current?.abort(), []);

  const end = () => {
    stop();
    router.back();
  };

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
        <>
          <Text style={styles.distance}>Off route</Text>
          <Text style={styles.instruction}>
            {failed
              ? "Can't reach the routing server. Head back to the line; trying again."
              : "Finding a new route from here…"}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.turnRow}>
            <Text style={styles.arrow}>{maneuverArrow(progress.next?.type ?? 4)}</Text>
            <Text style={styles.distance}>{formatDistance(progress.distanceToNextM)}</Text>
          </View>
          <Text style={styles.instruction} numberOfLines={3}>
            {progress.next?.instruction ?? "Continue to your destination."}
          </Text>
          {progress.after && (
            <Text style={styles.then} numberOfLines={1}>
              Then {maneuverArrow(progress.after.type)} {progress.after.instruction}
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
            ? `POLICE · ${"restrictions" in active.route ? active.route.restrictions.length : 0} RESTR.`
            : "STANDARD"}
        </Text>
        <Pressable accessibilityRole="button" onPress={end} style={styles.endButton}>
          <Text style={styles.endText}>End</Text>
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
            <LiveMap headingUp followZoom={17} routes={routes} destination={destination} compact />
          </View>
        </View>
      ) : (
        <>
          {turnPanel}
          <View style={styles.map}>
            <LiveMap headingUp followZoom={17} routes={routes} destination={destination} compact />
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
  endButton: { backgroundColor: colors.warn, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 22 },
  endText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 1, textTransform: "uppercase" },
});
