import type { LngLat } from "@maplibre/maplibre-react-native";
import { router, Tabs, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRoutes, restrictionPoints, RouteError, withoutPolice } from "../../api/routes";
import { AddPlaceForm } from "../../components/AddPlaceForm";
import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";
import { namedPoints, type MapRoute, type MarkerProperties } from "../../components/mapShared";
import { MarkerCard } from "../../components/MarkerCard";
import { PlacesControl } from "../../components/PlacesControl";
import { RoutePanel, type PlanState } from "../../components/RoutePanel";
import { SearchResultsList } from "../../components/SearchResultsList";
import { boroughAt } from "../../area/area";
import { DEMO_MODE } from "../../config";
import { useLog } from "../../log/LogProvider";
import { formatDistance } from "../../format";
import { distanceM } from "../../geo";
import { routeOrigin, useLocation } from "../../location/LocationProvider";
import { useNavigation } from "../../navigation/NavigationProvider";
import { planIsStale } from "../../navigation/routeChoice";
import type { SearchResult } from "../../search/engine";
import { destinationNote } from "../../search/destinationNote";
import { mergeAddresses } from "../../search/merge";
import { DEFAULT_MARKER_GROUPS, GROUP_COLOR, MARKER_GROUPS } from "../../search/placeGroups";
import type { PlaceGroup } from "../../search/places";
import { useSearch } from "../../search/SearchProvider";
import { useAddressLookup } from "../../search/useAddressLookup";
import { useSession } from "../../session/SessionProvider";
import { useTeam } from "../../team/TeamProvider";
import { store } from "../../storage/store";
import { colors, fonts } from "../../theme";

interface Destination {
  point: LngLat;
  title?: string;
  /** Set when it's a whole road (no door): its name, to list the blocks on it. */
  road?: string;
  note?: string;
  /** The log entry for this pick, to add the route chosen. */
  logId?: number;
}

// Type what the control room gave, pick the match, get both routes from
// where the phone is now. A long press on the map also sets a destination.
export default function SearchScreen() {
  const { fix } = useLocation();
  const insets = useSafeAreaInsets();
  const { boroughs, policeRoutes, vehicle, roads, mapView } = useSession();
  const { mapPoints: teamMap } = useTeam();
  const { data, search, places, area: searchArea } = useSearch();
  const navigation = useNavigation();
  const log = useLog();
  const [query, setQuery] = useState("");
  const input = useRef<TextInput>(null);
  const [showOutside, setShowOutside] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [state, setState] = useState<PlanState | null>(null);
  const request = useRef<AbortController | null>(null);
  const [markerGroups, setMarkerGroupsState] = useState<PlaceGroup[]>(() => loadMarkerGroups());
  const [tapped, setTapped] = useState<{ marker: MarkerProperties; point: LngLat } | null>(null);
  const setMarkerGroups = (groups: PlaceGroup[]) => {
    setMarkerGroupsState(groups);
    store.setSetting("markerGroups", JSON.stringify(groups));
  };

  // Searching 40,000 roads on every keystroke can lag a little; let typing win.
  const deferredQuery = useDeferredValue(query);
  const showResults = query.trim().length >= 2 && !destination;
  const lookup = useAddressLookup(query, showResults);
  const area = useMemo(() => new Set(boroughs), [boroughs]);
  const results = useMemo(() => {
    const offline = search(deferredQuery);
    return lookup.state.status === "ok" ? mergeAddresses(offline, lookup.state.addresses, searchArea) : offline;
  }, [search, deferredQuery, lookup, searchArea]);
  const lookupNote =
    !showResults || lookup.state.status === "idle"
      ? null
      : lookup.state.status === "searching"
        ? "Checking full addresses…"
        : lookup.state.status === "unavailable"
          ? "Full addresses unavailable (no signal?). Showing roads from the phone."
          : lookup.state.status === "not-configured"
            ? "Road-level search only: full address lookup isn't set up."
            : null;
  // Say plainly when shops, cafés and other places can't be searched yet.
  const placesNote =
    showResults && places.status !== "ready"
      ? DEMO_MODE
        ? "This demo has no shops, cafés or other places: they come from the Blue Route server."
        : "Shops, cafés and other places aren't on this phone yet. They download from the Blue Route server."
      : null;

  const routeTo = useCallback(
    async (dest: Destination) => {
      request.current?.abort();
      setDestination(dest);
      if (!fix) {
        // Routed automatically when the first fix arrives (below).
        setState({ status: "error", message: "Waiting for a GPS position to route from.", waitingForFix: true });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setState({ status: "loading" });
      const to = { lat: dest.point[1], lng: dest.point[0] };
      const from = routeOrigin(fix);
      const origin = { madeAt: Date.now(), from };
      // The standard route comes back in a second or so; the blue-light one
      // takes longer to check, so show the standard route as soon as it's here.
      const quick = fetchRoutes(from, to, vehicle, controller.signal, true, roads);
      const full = policeRoutes ? fetchRoutes(from, to, vehicle, controller.signal, false, roads) : null;
      let fullDone = false;
      quick
        .then((plan) => {
          if (!controller.signal.aborted && !fullDone) setState({ status: "ready", plan, checking: !!full, origin });
        })
        .catch(() => {});
      try {
        if (!full) {
          const plan = await quick;
          if (!controller.signal.aborted) setState({ status: "ready", plan, origin });
          return;
        }
        const plan = await full;
        fullDone = true;
        if (!controller.signal.aborted) setState({ status: "ready", plan, origin });
      } catch (err) {
        fullDone = true;
        if (controller.signal.aborted) return;
        // The blue-light check failed but the standard route may be fine.
        const standard = await quick.catch(() => null);
        if (standard) {
          setState({ status: "ready", plan: { ...standard, noPoliceReason: "check-failed" }, origin });
          return;
        }
        const message = err instanceof RouteError ? err.message : "Something went wrong working out routes.";
        setState({ status: "error", message });
      }
    },
    [fix, vehicle, policeRoutes, roads],
  );

  useEffect(() => () => request.current?.abort(), []);

  /** Logs what was typed and what was chosen, then works out routes there. */
  const choose = (dest: Destination, typed: string, borough: string | null) => {
    const logId = log.record({
      query: typed,
      chosen: dest.title ?? "Destination",
      borough,
      lat: dest.point[1],
      lng: dest.point[0],
    });
    routeTo({ ...dest, logId });
  };

  // "Route there again" from the Log tab arrives as params.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; title?: string; from?: string }>();
  const handledParams = useRef<string | null>(null);
  useEffect(() => {
    if (!params.from || !params.lat || !params.lng || handledParams.current === params.from) return;
    handledParams.current = params.from;
    const title = params.title ?? "Destination";
    setQuery(title);
    choose(
      { point: [Number(params.lng), Number(params.lat)], title },
      "",
      boroughAt(Number(params.lat), Number(params.lng)),
    );
    // choose() is recreated each render; only new params should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.from, params.lat, params.lng, params.title]);

  const pick = (r: SearchResult) => {
    Keyboard.dismiss();
    setQuery(r.label);
    const note = destinationNote(r);
    choose(
      { point: [r.lng, r.lat], title: r.label, note, road: r.precision === "road" ? r.road : undefined },
      query,
      r.borough,
    );
  };

  const clear = () => {
    request.current?.abort();
    setDestination(null);
    setState(null);
    setQuery("");
    setShowOutside(false);
  };

  // Refused for want of a GPS position: route as soon as the first fix arrives.
  const hasFix = !!fix;
  useEffect(() => {
    if (!hasFix || !destination || state?.status !== "error" || !state.waitingForFix) return;
    const t = setTimeout(() => routeTo(destination), 0);
    return () => clearTimeout(t);
    // Only when the first fix arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix]);

  // Back from navigation: a plan from where the crew were before is never
  // offered again. After arriving, or "New destination", start clean and
  // ready to type; after End, work the routes out again from here.
  const handledEnd = useRef(navigation.ended);
  useEffect(() => {
    const ended = navigation.ended;
    if (!ended || handledEnd.current === ended) return;
    const t = setTimeout(() => {
      handledEnd.current = ended;
      if (ended.reason === "end" && destination) {
        routeTo(destination);
        return;
      }
      clear();
      input.current?.focus();
    }, 0);
    return () => clearTimeout(t);
    // Only when navigation ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation.ended]);

  // Place markers for the chosen kinds of place, across the selected boroughs.
  const markers = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (data.status !== "ready" || places.status !== "ready" || !markerGroups.length) return null;
    const pois = data.index.pointsOfInterestIn(area, new Set(markerGroups));
    return {
      type: "FeatureCollection",
      features: pois.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          name: p.name,
          type: p.type,
          address: p.address,
          borough: p.borough,
          color: GROUP_COLOR[p.group] ?? GROUP_COLOR.other,
        } satisfies MarkerProperties,
      })),
    };
  }, [data, places, area, markerGroups]);

  // Blue-light routes only for someone who has said they drive for an emergency service.
  const shown = useMemo<PlanState | null>(
    () => (state?.status === "ready" && !policeRoutes ? { ...state, plan: withoutPolice(state.plan) } : state),
    [state, policeRoutes],
  );
  const plan = shown?.status === "ready" ? shown.plan : null;
  const routes = useMemo<MapRoute[]>(() => {
    if (!plan) return [];
    const out: MapRoute[] = [{ id: "standard", shape: plan.standard.shape, color: colors.blue }];
    if (plan.police) out.push({ id: "police", shape: plan.police.shape, color: colors.amber, dashed: true });
    return out;
  }, [plan]);
  // Frame the routes once they arrive; until then, the destination and where we are.
  const here = fix ? ([fix.lng, fix.lat] as LngLat) : null;
  const hasHere = here !== null;
  const fitTo = useMemo(() => {
    if (routes.length) return routes.flatMap((r) => r.shape);
    if (!destination) return null;
    return here ? [destination.point, here] : [destination.point];
    // Only reframe when the destination or routes change, not on every GPS fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, destination, hasHere]);

  // Named blocks and estates: labelled on the map round the destination, and
  // listed for a whole road, so the crew know which block to head for.
  const destLng = destination?.point[0];
  const destLat = destination?.point[1];
  const destRoad = destination?.road;
  const blockLabels = useMemo(
    () =>
      data.status === "ready" && places.status === "ready" && destLat != null && destLng != null
        ? namedPoints(data.index.housingNear(destLat, destLng, 600))
        : null,
    [data, places, destLat, destLng],
  );
  const blocks = useMemo(
    () =>
      data.status === "ready" && places.status === "ready" && destRoad && destLat != null && destLng != null
        ? data.index.housingOnRoad(destRoad, { lat: destLat, lng: destLng })
        : [],
    [data, places, destRoad, destLat, destLng],
  );

  const dataNote =
    data.status === "loading"
      ? "Loading London roads…"
      : data.status === "error"
        ? `Search data didn't load: ${data.message}`
        : boroughs.length === 0
          ? "No boroughs picked: every match shows as outside your area. Pick them on the Session tab."
          : null;

  // Ready to type the moment the screen opens, unless a route is already up.
  useFocusEffect(
    useCallback(() => {
      if (!destination && !query) input.current?.focus();
      // Only on arriving at the screen, not on every keystroke.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // The last few places routed to, one tap away.
  const entries = log.entries;
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof entries = [];
    for (const e of entries) {
      const key = `${e.chosen}|${e.lat.toFixed(5)}|${e.lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length === 3) break;
    }
    return out;
  }, [entries]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* No app header: the search box sits at the top and the map gets the rest. */}
      <Tabs.Screen options={{ headerShown: false }} />
      <View style={styles.searchBar}>
        <TextInput
          ref={input}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setShowOutside(false);
            if (destination) {
              request.current?.abort();
              setDestination(null);
              setState(null);
            }
          }}
          placeholder="Address, postcode, or a place like Costa"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel="Address from the control room"
          style={styles.input}
        />
        {query.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={clear} style={styles.clear}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        )}
      </View>
      {dataNote && <Text style={styles.dataNote}>{dataNote}</Text>}
      {lookupNote && <Text style={styles.dataNote}>{lookupNote}</Text>}
      {placesNote && <Text style={styles.dataNote}>{placesNote}</Text>}
      <GpsStatus />

      <View style={styles.body}>
        <LiveMap
          team={teamMap}
          view={mapView}
          viewControl
          vehicleArrow
          routes={routes}
          restrictions={restrictionPoints(plan?.police)}
          labels={blockLabels}
          destination={destination?.point}
          onLongPress={(point) =>
            choose(
              { point, title: `Point on the map (${point[1].toFixed(5)}, ${point[0].toFixed(5)})` },
              "",
              boroughAt(point[1], point[0]),
            )
          }
          fitTo={fitTo}
          markers={showResults ? null : markers}
          onMarkerPress={(marker, point) => setTapped({ marker, point })}
        />
        {!showResults && !destination && (
          <PlacesControl
            groups={markerGroups}
            onChange={setMarkerGroups}
            shownCount={places.status === "ready" ? (markers?.features.length ?? 0) : null}
          />
        )}
        {tapped && !destination && !showResults && (
          <MarkerCard
            marker={tapped.marker}
            away={fix ? formatDistance(distanceM(fix, { lat: tapped.point[1], lng: tapped.point[0] })) : undefined}
            onClose={() => setTapped(null)}
            onRoute={() => {
              const { marker, point } = tapped;
              setTapped(null);
              setQuery(marker.name);
              choose({ point, title: marker.name }, "", marker.borough);
            }}
          />
        )}
        {!destination && !showResults && !tapped && recent.length > 0 && (
          <View style={styles.recent}>
            <Text style={styles.recentLabel}>Recent</Text>
            {recent.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={`Route to ${e.chosen} again`}
                onPress={() => {
                  setQuery(e.chosen);
                  choose({ point: [e.lng, e.lat], title: e.chosen }, "", e.borough);
                }}
                style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.recentText} numberOfLines={1}>
                  ↻ {e.chosen}
                </Text>
                {e.borough && <Text style={styles.recentMeta}>{e.borough}</Text>}
              </Pressable>
            ))}
          </View>
        )}
        {!destination && !showResults && !tapped && recent.length === 0 && (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>Type an address above, or press and hold on the map.</Text>
          </View>
        )}
        {showResults && (
          <View style={styles.results}>
            <SearchResultsList
              results={results}
              showOutside={showOutside}
              onToggleOutside={() => setShowOutside((v) => !v)}
              onPick={pick}
              from={fix}
              emptyText={
                data.status === "ready"
                  ? "No matches in your area. Check the spelling, or add it below if it's a block or estate."
                  : "Search data is still loading."
              }
              footer={
                data.status === "ready" ? (
                  <AddPlaceForm initialName={query.replace(/^\d+\s*/, "")} onSaved={(name) => setQuery(name)} />
                ) : null
              }
            />
          </View>
        )}
      </View>

      {destination && shown && (
        <RoutePanel
          state={shown}
          destination={{ lat: destination.point[1], lng: destination.point[0] }}
          title={destination.title}
          note={destination.note}
          blocks={blocks}
          onPickBlock={(b) => {
            setQuery(b.name);
            choose({ point: [b.lng, b.lat], title: `${b.name}, ${destination.road}` }, query, b.borough);
          }}
          onClose={clear}
          onRetry={() => routeTo(destination)}
          onOpenExternal={(app) => destination.logId && log.setRoute(destination.logId, app)}
          onGo={(kind) => {
            if (shown.status !== "ready") return;
            if (destination.logId) log.setRoute(destination.logId, kind);
            // An old plan, or one from somewhere else: go now, and re-route from here at once.
            const stale = !shown.origin || planIsStale(shown.origin, fix, Date.now());
            navigation.start(
              kind,
              shown.plan,
              { lat: destination.point[1], lng: destination.point[0], title: destination.title ?? "Destination" },
              undefined,
              stale,
            );
            router.push("/navigate");
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  clear: { padding: 10 },
  clearText: { color: colors.muted, fontSize: 18 },
  dataNote: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12, paddingHorizontal: 16, paddingTop: 6 },
  body: { flex: 1 },
  results: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.bg },
  hint: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  hintText: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: "center" },
  recent: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recentLabel: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  recentRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recentText: { flex: 1, color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  recentMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
});

function loadMarkerGroups(): PlaceGroup[] {
  const saved = store.getSetting("markerGroups");
  if (saved === null) return DEFAULT_MARKER_GROUPS;
  try {
    const known = new Set(MARKER_GROUPS.map((g) => g.key));
    return (JSON.parse(saved) as PlaceGroup[]).filter((g) => known.has(g));
  } catch {
    return DEFAULT_MARKER_GROUPS;
  }
}
