import type { LngLat } from "@maplibre/maplibre-react-native";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { fetchRoutes, RouteError } from "../../api/routes";
import { AddPlaceForm } from "../../components/AddPlaceForm";
import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";
import type { MapRoute } from "../../components/mapShared";
import { RoutePanel, type PlanState } from "../../components/RoutePanel";
import { SearchResultsList } from "../../components/SearchResultsList";
import { useLocation } from "../../location/LocationProvider";
import type { SearchResult } from "../../search/engine";
import { mergeAddresses } from "../../search/merge";
import { useSearch } from "../../search/SearchProvider";
import { useAddressLookup } from "../../search/useAddressLookup";
import { useSession } from "../../session/SessionProvider";
import { colors, fonts } from "../../theme";

interface Destination {
  point: LngLat;
  title?: string;
  note?: string;
}

// Type what the control room gave, pick the match, get both routes from
// where the phone is now. A long press on the map also sets a destination.
export default function SearchScreen() {
  const { fix } = useLocation();
  const { boroughs } = useSession();
  const { data, search } = useSearch();
  const [query, setQuery] = useState("");
  const [showOutside, setShowOutside] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [state, setState] = useState<PlanState | null>(null);
  const request = useRef<AbortController | null>(null);

  // Searching 40,000 roads on every keystroke can lag a little; let typing win.
  const deferredQuery = useDeferredValue(query);
  const showResults = query.trim().length >= 2 && !destination;
  const lookup = useAddressLookup(query, showResults);
  const area = useMemo(() => new Set(boroughs), [boroughs]);
  const results = useMemo(() => {
    const offline = search(deferredQuery);
    return lookup.state.status === "ok" ? mergeAddresses(offline, lookup.state.addresses, area) : offline;
  }, [search, deferredQuery, lookup, area]);
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

  const routeTo = useCallback(
    async (dest: Destination) => {
      request.current?.abort();
      setDestination(dest);
      if (!fix) {
        setState({ status: "error", message: "Waiting for a GPS position to route from." });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setState({ status: "loading" });
      try {
        const to = { lat: dest.point[1], lng: dest.point[0] };
        const plan = await fetchRoutes({ lat: fix.lat, lng: fix.lng }, to, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", plan });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof RouteError ? err.message : "Something went wrong working out routes.";
        setState({ status: "error", message });
      }
    },
    [fix],
  );

  useEffect(() => () => request.current?.abort(), []);

  const pick = (r: SearchResult) => {
    Keyboard.dismiss();
    setQuery(r.label);
    const numbered = /\d/.test(r.label) && r.kind !== "postcode";
    const note =
      r.precision === "road" && numbered
        ? "Routes to a point on the road, not the door. On a long road, check which end the number is."
        : r.precision === "postcode" && r.kind !== "postcode"
          ? "Routes to the postcode, which may cover several doors."
          : undefined;
    routeTo({ point: [r.lng, r.lat], title: r.label, note });
  };

  const clear = () => {
    request.current?.abort();
    setDestination(null);
    setState(null);
    setQuery("");
    setShowOutside(false);
  };

  const plan = state?.status === "ready" ? state.plan : null;
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

  const dataNote =
    data.status === "loading"
      ? "Loading London roads…"
      : data.status === "error"
        ? `Search data didn't load: ${data.message}`
        : boroughs.length === 0
          ? "No boroughs picked: every match shows as outside your area. Pick them on the Session tab."
          : null;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <TextInput
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
          placeholder="54 Caledonian Road, N7 8LA or Bemerton Estate"
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
      <GpsStatus />

      <View style={styles.body}>
        <LiveMap
          routes={routes}
          destination={destination?.point}
          onLongPress={(point) => routeTo({ point, title: "Point on the map" })}
          fitTo={fitTo}
        />
        {!destination && !showResults && (
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

      {destination && state && (
        <RoutePanel
          state={state}
          destination={{ lat: destination.point[1], lng: destination.point[0] }}
          title={destination.title}
          note={destination.note}
          onClose={clear}
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
});
