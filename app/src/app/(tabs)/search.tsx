import type { LngLat } from "@maplibre/maplibre-react-native";
import { useNetworkState } from "expo-network";
import { router, Tabs, useLocalSearchParams } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  planRequests,
  NoAnswerRouteError,
  NoSignalRouteError,
  ServerDownRouteError,
  restrictionPoints,
  RouteError,
  withoutPolice,
  type PoliceRoute,
  type Route,
} from "../../api/routes";
import { AddPlaceForm } from "../../components/AddPlaceForm";
import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";
import { ROUTE_ALT, type MapRoute, type MarkerProperties } from "../../components/mapShared";
import { MarkerCard } from "../../components/MarkerCard";
import { PlacesControl } from "../../components/PlacesControl";
import { RoutePanel, type PlanState } from "../../components/RoutePanel";
import { SearchResultsList } from "../../components/SearchResultsList";
import { WhereAmI } from "../../components/WhereAmI";
import { boroughAt } from "../../area/area";
import { API_URL, DEMO_MODE } from "../../config";
import { useLog } from "../../log/LogProvider";
import { formatDistance } from "../../format";
import { distanceM } from "../../geo";
import { routeOrigin, useLocation } from "../../location/LocationProvider";
import { APP_VERSION, PLATFORM, recorder } from "../../fieldtest/instance";
import { NO_ANSWER_ROUTE_START, NO_SIGNAL_ROUTE_START, SERVER_DOWN_ROUTE_START } from "../../navigation/connectivity";
import { PREFETCH_PAUSE_MS, prefetchKey, prefetchTarget, usable, type Prefetch } from "../../navigation/prefetch";
import { rerouteFailure } from "../../navigation/reroute";
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
import { recordEvent } from "../../usage/usage";
import { useTextStyles } from "../../textSize";
import { loadFavourites, samePlace, saveFavourites, toggled, type Favourite } from "../../search/favourites";
import { quickPlaces } from "../../search/quickPlaces";
import { BOROUGHS, type Borough } from "../../search/boroughs";

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
  const styles = useTextStyles(baseStyles);
  const { fix, simulated } = useLocation();
  const insets = useSafeAreaInsets();
  // Height of the floating search box (and any notes under it), from the top of the screen.
  const [topSpace, setTopSpace] = useState(insets.top + 72);
  const { boroughs, policeRoutes, vehicle, roads, mapView } = useSession();
  const { mapPoints: teamMap } = useTeam();
  const { data, search, places, blockLabels, area: searchArea } = useSearch();
  const navigation = useNavigation();
  const log = useLog();
  const [query, setQuery] = useState("");
  const input = useRef<TextInput>(null);
  const [showOutside, setShowOutside] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [state, setState] = useState<PlanState | null>(null);
  const request = useRef<AbortController | null>(null);
  // Routes asked for before the tap, for the likely match (navigation/prefetch.ts).
  const prefetch = useRef<Prefetch | null>(null);
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
        ? "This demo has no shops, cafés or other places: they come from the BlueRoute server."
        : "Shops, cafés and other places aren't on this phone yet. They download from the BlueRoute server."
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
      const to = { lat: dest.point[1], lng: dest.point[0] };
      // Already asked for before the tap? Then carry on with that.
      const pre = prefetch.current;
      prefetch.current = null;
      const ready = pre && usable(pre, prefetchKey(to, vehicle, roads, policeRoutes), fix, Date.now()) ? pre : null;
      if (pre && !ready) pre.controller.abort();
      const controller = ready?.controller ?? new AbortController();
      request.current = controller;
      setState({ status: "loading" });
      const from = ready?.origin.from ?? routeOrigin(fix);
      const origin = ready?.origin ?? { madeAt: Date.now(), from };
      // The standard route comes back in a second or so; the blue-light one
      // takes longer to check, so show the standard route as soon as it's here.
      const fresh = ready ? null : planRequests(from, to, { vehicle, roads, blueLight: policeRoutes, signal: controller.signal });
      const quick = ready?.quick ?? fresh!.quick;
      const full = ready ? ready.full : fresh!.full;
      // The server didn't count a plan asked for before the tap: count it now it's used.
      if (ready) recordEvent("plan");
      // Field-test recording (off unless switched on): how long each part of the plan took.
      quick.then((p) => recorder.event({ type: "plan-standard", ms: recorder.sinceStart(), standard: offered(p.standard) }), () => {});
      (full ?? quick).then(
        (p) =>
          recorder.event({
            type: "plan-full",
            ms: recorder.sinceStart(),
            standard: offered(p.standard),
            police: p.police ? offered(p.police) : null,
            fastest: p.police && p.police.durationS < p.standard.durationS ? "police" : "standard",
          }),
        (err: unknown) => recorder.event({ type: "plan-failed", ms: recorder.sinceStart(), outcome: rerouteFailure(err) ?? "error" }),
      );
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
        if (err instanceof NoSignalRouteError) {
          setState({ status: "error", message: NO_SIGNAL_ROUTE_START, noSignal: true });
          return;
        }
        // Either way Google Maps and Waze come first; a slow answer may be weak signal, so it says so.
        if (err instanceof NoAnswerRouteError || err instanceof ServerDownRouteError) {
          const message = err instanceof NoAnswerRouteError ? NO_ANSWER_ROUTE_START : SERVER_DOWN_ROUTE_START;
          setState({ status: "error", message, serverDown: true });
          return;
        }
        const message = err instanceof RouteError ? err.message : "Something went wrong working out routes.";
        setState({ status: "error", message });
      }
    },
    [fix, vehicle, policeRoutes, roads],
  );

  useEffect(() => () => request.current?.abort(), []);

  // Before the tap: once typing pauses on a likely match, ask for its routes.
  const target = showResults && fix && API_URL ? prefetchTarget(results) : null;
  const targetKey = target ? prefetchKey(target, vehicle, roads, policeRoutes) : null;
  useEffect(() => {
    if (!target || !targetKey || !fix) {
      // No likely match any more (more matches, or the query changed): stop asking.
      prefetch.current?.controller.abort();
      prefetch.current = null;
      return;
    }
    const t = setTimeout(() => {
      if (usable(prefetch.current, targetKey, fix, Date.now())) return;
      prefetch.current?.controller.abort();
      const controller = new AbortController();
      const from = routeOrigin(fix);
      const to = { lat: target.lat, lng: target.lng };
      const { quick, full } = planRequests(from, to, {
        vehicle,
        roads,
        blueLight: policeRoutes,
        signal: controller.signal,
        prefetch: true,
      });
      const entry: Prefetch = { key: targetKey, origin: { madeAt: Date.now(), from }, quick, full, controller, failed: false };
      const failed = () => {
        entry.failed = true;
      };
      quick.catch(failed);
      full?.catch(failed);
      prefetch.current = entry;
    }, PREFETCH_PAUSE_MS);
    return () => clearTimeout(t);
    // Only when the likely match (or a choice that changes its route) changes, not on every GPS fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);
  useEffect(() => () => prefetch.current?.controller.abort(), []);

  /** Logs what was typed and what was chosen, then works out routes there. */
  const choose = (dest: Destination, typed: string, borough: string | null) => {
    // A field-test trip, if recording is on: one per destination picked.
    recorder.begin({
      appVersion: APP_VERSION,
      platform: PLATFORM,
      vehicle,
      blueLight: policeRoutes,
      demo: simulated,
      query: typed,
      destination: { title: dest.title ?? "Destination", lat: dest.point[1], lng: dest.point[0] },
      gpsAccuracyM: fix?.accuracy ?? null,
    });
    const logId = log.record({
      query: typed,
      chosen: dest.title ?? "Destination",
      borough,
      lat: dest.point[1],
      lng: dest.point[0],
    });
    routeTo({ ...dest, logId });
  };

  // "Route there again" from the Log, or a place picked on the BCU screen,
  // arrives as params: a point to route to, or (q) something to search for.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; title?: string; q?: string; from?: string }>();
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

  // Something to search for, from the BCU screen (a custody suite not mapped as a police station).
  // It may be outside the boroughs being worked, so matches everywhere show.
  useEffect(() => {
    if (!params.from || !params.q || params.lat || handledParams.current === params.from) return;
    const from = params.from;
    const q = params.q;
    const t = setTimeout(() => {
      handledParams.current = from;
      clear();
      setQuery(q);
      setShowOutside(true);
    }, 0);
    return () => clearTimeout(t);
    // clear() is recreated each render; only new params should trigger this.
  }, [params.from, params.q, params.lat]);

  // Refused for want of a GPS position: route as soon as the first fix arrives.
  const hasFix = !!fix;
  useEffect(() => {
    if (!hasFix || !destination || state?.status !== "error" || !state.waitingForFix) return;
    const t = setTimeout(() => routeTo(destination), 0);
    return () => clearTimeout(t);
    // Only when the first fix arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix]);

  // No signal when a destination was picked: try again the moment the phone
  // has a network again, and every 15 s meanwhile (its network state can lag).
  const connected = useNetworkState().isConnected;
  const noSignal = state?.status === "error" && !!state.noSignal;
  const wasConnected = useRef(connected);
  useEffect(() => {
    const back = wasConnected.current === false && connected === true;
    wasConnected.current = connected;
    if (!noSignal || !destination) return;
    const again = () => routeTo(destination);
    const t = back ? setTimeout(again, 500) : null;
    const every = setInterval(again, 15_000);
    return () => {
      if (t) clearTimeout(t);
      clearInterval(every);
    };
    // A new attempt only when signal comes back, or on the 15 s beat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSignal, connected]);

  // Back from navigation: a plan from where the crew were before is never
  // offered again. After arriving, or "New destination", start clean (the map, no
  // keyboard); after End, work the routes out again from here.
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
    // The blue-light route, when there is one, in blue on top; the standard
    // route under it in grey. Alone, the standard route is the blue one.
    if (!plan.police) return [{ id: "standard", shape: plan.standard.shape, color: colors.blue }];
    return [
      { id: "standard", shape: plan.standard.shape, color: ROUTE_ALT },
      { id: "police", shape: plan.police.shape, color: colors.blue },
    ];
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

  // The keyboard waits for a tap on the search bar: opening Search may be just
  // to look at the map.

  // "Where am I": the officer's exact position, to read out or share.
  const [whereOpen, setWhereOpen] = useState(false);

  // The last few places routed to, one tap away: shown under the search bar
  // while it's being typed in, so they don't cover the map otherwise.
  const [typing, setTyping] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);
  const { service } = useSession();
  const allPois = useMemo(
    () => (data.status === "ready" ? data.index.pointsOfInterestIn(new Set(BOROUGHS), new Set(["emergency", "health"])) : []),
    // The place list arrives after the roads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, places.status],
  );
  // Nearest from where the phone is, worked out again every ~200 m, not on every fix.
  const roughLat = fix ? Math.round(fix.lat * 500) / 500 : null;
  const roughLng = fix ? Math.round(fix.lng * 500) / 500 : null;
  const quick = useMemo(
    () => quickPlaces(service, roughLat != null && roughLng != null ? { lat: roughLat, lng: roughLng } : null, allPois),
    [service, roughLat, roughLng, allPois],
  );
  const [favourites, setFavourites] = useState<Favourite[]>(() => loadFavourites());
  const toggleFavourite = (f: Favourite) => {
    const next = toggled(favourites, f);
    setFavourites(next);
    saveFavourites(next);
  };
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
    <View style={styles.screen}>
      {/* No app header: the map fills the screen and the search box floats on it. */}
      <Tabs.Screen options={{ headerShown: false }} />
      <View style={styles.body}>
        <LiveMap
          onWhereAmI={() => {
            Keyboard.dismiss();
            setWhereOpen(true);
          }}
          overlayTop={topSpace}
          overlayBottom={destination ? 18 : 0}
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
          <View style={[styles.belowBar, { top: topSpace - 4 }]} pointerEvents="box-none">
            <PlacesControl
              groups={markerGroups}
              onChange={setMarkerGroups}
              shownCount={places.status === "ready" ? (markers?.features.length ?? 0) : null}
            />
          </View>
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
        {typing && !destination && !showResults && !tapped && (quick.length > 0 || favourites.length > 0 || recent.length > 0) && (
          <View style={[styles.recent, { top: topSpace + 6 }]}>
            {quick.map((q) => (
              <Pressable
                key={q.label}
                accessibilityRole="button"
                accessibilityLabel={`${q.label}: ${q.place.name}, ${formatDistance(q.metres)}`}
                onPress={() => {
                  setQuery(q.place.name);
                  choose({ point: [q.place.lng, q.place.lat], title: q.place.name }, "", q.place.borough);
                }}
                style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.recentText} numberOfLines={1}>
                  ➜ {q.label}: {q.place.name}
                </Text>
                <Text style={styles.recentMeta}>{formatDistance(q.metres)}</Text>
              </Pressable>
            ))}
            {favourites.length > 0 && <Text style={styles.recentLabel}>Favourites</Text>}
            {favourites.slice(0, 5).map((f) => (
              <Pressable
                key={`${f.lat},${f.lng}`}
                accessibilityRole="button"
                accessibilityLabel={`Route to ${f.name}`}
                onPress={() => {
                  setQuery(f.name);
                  choose({ point: [f.lng, f.lat], title: f.name }, "", (f.borough as Borough | null) ?? null);
                }}
                style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.recentText} numberOfLines={1}>
                  ★ {f.name}
                </Text>
                {f.borough && <Text style={styles.recentMeta}>{f.borough}</Text>}
              </Pressable>
            ))}
            {recent.length > 0 && <Text style={styles.recentLabel}>Recent</Text>}
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
          <View style={[styles.results, { paddingTop: topSpace }]}>
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

      <View
        style={[styles.floating, { top: insets.top + 8 }]}
        onLayout={(e) => setTopSpace(insets.top + 8 + e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
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
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setTyping(true);
            }}
            // A moment's grace, so a tap on a recent place lands before the list goes.
            onBlur={() => {
              blurTimer.current = setTimeout(() => setTyping(false), 250);
            }}
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

      </View>
      {destination && shown && (
        <RoutePanel
          state={shown}
          destination={{ lat: destination.point[1], lng: destination.point[0] }}
          title={destination.title}
          favourite={favourites.some((f) => samePlace(f, { lat: destination.point[1], lng: destination.point[0] }))}
          onToggleFavourite={() =>
            toggleFavourite({
              name: destination.title ?? "Saved place",
              lat: destination.point[1],
              lng: destination.point[0],
              borough: boroughAt(destination.point[1], destination.point[0]),
            })
          }
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
            recorder.event({ type: "go", kind, staleRefresh: stale });
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
      {whereOpen && (
        <WhereAmI
          fix={fix}
          index={data.status === "ready" ? data.index : null}
          onClose={() => setWhereOpen(false)}
          bottomInset={8}
        />
      )}
    </View>
  );
}

/** A route as the field-test recorder keeps it. */
function offered(r: Route | PoliceRoute) {
  return {
    etaS: Math.round(r.durationS),
    distanceM: Math.round(r.distanceM),
    ...("restrictions" in r ? { restrictions: r.restrictions.map((x) => x.description) } : {}),
  };
}

const baseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // The search box floats over the map, as a rounded bar with a shadow.
  floating: { position: "absolute", left: 10, right: 10, gap: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: 28,
    paddingLeft: 18,
    paddingRight: 6,
    minHeight: 56,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  input: {
    flex: 1,
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 18,
    paddingVertical: 14,
    outlineStyle: "none",
  } as object,
  clear: { padding: 12 },
  clearText: { color: colors.muted, fontSize: 20 },
  dataNote: {
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: colors.panel,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: "hidden",
    opacity: 0.95,
  },
  belowBar: { position: "absolute", left: 0, right: 0, bottom: 0 },
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
