import type { LngLat } from "@maplibre/maplibre-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fetchRoutes, RouteError } from "../../api/routes";
import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";
import type { MapRoute } from "../../components/mapShared";
import { RoutePanel, type PlanState } from "../../components/RoutePanel";
import { useLocation } from "../../location/LocationProvider";
import { colors, fonts } from "../../theme";

// Until address search arrives (build step 3), a long press on the map sets
// the destination. Routes always start from the phone's current position.
export default function SearchScreen() {
  const { fix } = useLocation();
  const [destination, setDestination] = useState<LngLat | null>(null);
  const [state, setState] = useState<PlanState | null>(null);
  const request = useRef<AbortController | null>(null);

  const routeTo = useCallback(
    async (to: LngLat) => {
      request.current?.abort();
      setDestination(to);
      if (!fix) {
        setState({ status: "error", message: "Waiting for a GPS position to route from." });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setState({ status: "loading" });
      try {
        const plan = await fetchRoutes({ lat: fix.lat, lng: fix.lng }, { lat: to[1], lng: to[0] }, controller.signal);
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

  const clear = () => {
    request.current?.abort();
    setDestination(null);
    setState(null);
  };

  const plan = state?.status === "ready" ? state.plan : null;
  const routes = useMemo<MapRoute[]>(() => {
    if (!plan) return [];
    const out: MapRoute[] = [{ id: "standard", shape: plan.standard.shape, color: colors.blue }];
    if (plan.police) out.push({ id: "police", shape: plan.police.shape, color: colors.amber, dashed: true });
    return out;
  }, [plan]);
  const fitTo = useMemo(() => (routes.length ? routes.flatMap((r) => r.shape) : null), [routes]);

  return (
    <View style={styles.screen}>
      <GpsStatus />
      <View style={styles.map}>
        <LiveMap routes={routes} destination={destination} onLongPress={routeTo} fitTo={fitTo} />
        {!destination && (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>Press and hold on the map to get routes there.</Text>
          </View>
        )}
      </View>
      {destination && state && (
        <RoutePanel
          state={state}
          destination={{ lat: destination[1], lng: destination[0] }}
          onClose={clear}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
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
