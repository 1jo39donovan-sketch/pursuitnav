import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
  type MapRef,
  type LngLat,
} from "@maplibre/maplibre-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MAP_STYLES, region } from "../config";
import { useMapStyle } from "./mapLooks";
import { useOfflineMap } from "../offline/OfflineMapProvider";
import { useLocation } from "../location/LocationProvider";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";
import {
  ARROW_LAYOUT,
  boundsOf,
  cameraFor,
  LABEL_LAYOUT,
  labelPaint,
  TEAM_CIRCLE_PAINT,
  TEAM_LABEL_LAYOUT,
  teamLabelPaint,
  HOUSE_NUMBER_LAYER,
  HOUSE_NUMBER_MIN_ZOOM,
  HOUSE_NUMBER_TAP_PX,
  nearestHouseNumber,
  HOUSE_NUMBER_SOURCE_LAYER,
  houseNumberLayout,
  houseNumberPaint,
  ROAD_NAME_SOURCE,
  ROAD_NAME_SOURCE_LAYER,
  roadNameLayout,
  roadNamePaint,
  speedZoom,
  EMPTY_COLLECTION,
  FIT_DELAY_MS,
  FIT_PADDING,
  LOOK_AHEAD,
  ROUTE_CASING_PAINT,
  ROUTE_LINE_PAINT,
  MARKER_CIRCLE_PAINT,
  MARKER_MIN_ZOOM,
  MARKER_LABEL_LAYOUT,
  MARKER_LABEL_PAINT,
  pointGeoJSON,
  pointsGeoJSON,
  RESTRICTION_CIRCLE_PAINT,
  RESTRICTION_LABEL_LAYOUT,
  RESTRICTION_LABEL_PAINT,
  routesGeoJSON,
  type LiveMapProps,
  type MarkerProperties,
  VEHICLE_IMAGE,
  vehicleFeature,
} from "./mapShared";
import { MapButtons } from "./MapButtons";

/**
 * Map (night or day style) that follows the phone's GPS position. Panning the map stops
 * following; the Recentre button picks it back up.
 */
export function LiveMap({
  headingUp = false,
  view: viewProp,
  viewControl = false,
  restrictions,
  autoZoom = false,
  zoomControl = false,
  roadNames = false,
  labels,
  team,
  vehicleArrow = false,
  followZoom = 15,
  compact = false,
  overlayTop = 0,
  overlayBottom = 0,
  routes = [],
  lookAhead = false,
  onWhereAmI,
  destination,
  onLongPress,
  onPress,
  fitTo,
  markers,
  onMarkerPress,
}: LiveMapProps) {
  const { fix, facing } = useLocation();
  const { mapTheme, mapLook } = useSession();
  // The map kept on the phone, once downloaded: draws with no signal.
  const offlineStyles = useOfflineMap().styles;
  const mapStyle = useMapStyle(
    offlineStyles?.[mapTheme] ?? MAP_STYLES[mapTheme],
    mapLook,
    mapTheme,
    offlineStyles?.day ?? MAP_STYLES.day,
  );
  const view = viewProp ?? (headingUp ? "heading" : "north");
  // The +/− buttons nudge the following zoom; auto-zoom adds the speed's.
  const [zoomOffset, setZoomOffset] = useState(0);
  const followAt =
    followZoom + zoomOffset + (autoZoom ? speedZoom(fix?.speed ?? null) : 0);
  // Following the vehicle, unless the map opens on something to frame.
  const [following, setFollowing] = useState(!fitTo?.length);
  // A new view (3D, direction up, north up) is shown at once: back to the
  // vehicle, in that view, even if the map had been moved by hand.
  const [lastView, setLastView] = useState(view);
  if (view !== lastView) {
    setLastView(view);
    setFollowing(true);
  }
  const camera = useRef<CameraRef>(null);
  // When a place marker was last tapped, so the map's own tap under it is let go.
  const markerPressedAt = useRef(0);
  const mapRef = useRef<MapRef>(null);

  // New points to show: stop following so the camera can frame them.
  const [lastFitTo, setLastFitTo] = useState(fitTo);
  if (fitTo !== lastFitTo) {
    setLastFitTo(fitTo);
    if (fitTo?.length) setFollowing(false);
  }
  useEffect(() => {
    if (!fitTo?.length) return;
    // Wait for the layout to settle (the route panel opening shrinks the map).
    const timer = setTimeout(
      () => camera.current?.fitBounds(boundsOf(fitTo), { padding: { ...FIT_PADDING, top: FIT_PADDING.top + overlayTop, bottom: FIT_PADDING.bottom + overlayBottom }, duration: 600 }),
      FIT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [fitTo, overlayTop, overlayBottom]);
  const [mapFailed, setMapFailed] = useState(false);

  const position: LngLat | null = fix ? [fix.lng, fix.lat] : null;

  const lng = fix?.lng;
  const lat = fix?.lat;
  const course = facing;
  const puck = useMemo<GeoJSON.Feature | null>(
    () => (lng != null && lat != null ? vehicleFeature(lng, lat, course) : null),
    [lng, lat, course],
  );

  // Which way the map is turned, for the compass button; and its height, for looking ahead.
  const [bearing, setBearing] = useState(0);
  const [height, setHeight] = useState(0);
  const ahead = lookAhead && view !== "north" ? Math.round(height * LOOK_AHEAD) : 0;
  const followCamera =
    following && position
      ? {
          center: position,
          zoom: followAt,
          ...cameraFor(view, facing),
          // Navigating with the map turned: the vehicle sits low, showing the road ahead.
          padding: { top: ahead + overlayTop / 2, bottom: overlayBottom / 2, left: 0, right: 0 },
          duration: 800,
          easing: "ease" as const,
        }
      : {};

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        logo={false}
        compass={!compact}
        attribution
        attributionPosition={{ bottom: 8 + overlayBottom, left: 8 }}
        touchRotate={view === "north"}
        onDidFailLoadingMap={() => setMapFailed(true)}
        onDidFinishLoadingStyle={() => setMapFailed(false)}
        onLongPress={(e) => onLongPress?.(e.nativeEvent.lngLat)}
        onPress={(e) => {
          // A tap on a place marker has its own card: wait a moment to see if it was one.
          const at = e.nativeEvent.lngLat;
          const tappedAt = Date.now();
          const { point } = e.nativeEvent;
          const r = HOUSE_NUMBER_TAP_PX;
          setTimeout(() => {
            if (markerPressedAt.current >= tappedAt - 50 || !onPress) return;
            // The house number drawn nearest the tap: the one the crew can see they tapped.
            void (mapRef.current
              ?.queryRenderedFeatures(
                [
                  [point[0] - r, point[1] - r],
                  [point[0] + r, point[1] + r],
                ],
                {
                  layers: [HOUSE_NUMBER_LAYER],
                },
              )
              .then((fs) => nearestHouseNumber(fs, at))
              .catch(() => null) ?? Promise.resolve(null)
            ).then((n) => onPress(at, n));
          }, 120);
        }}
        onRegionWillChange={(e) => {
          if (e.nativeEvent.userInteraction) setFollowing(false);
        }}
        onRegionIsChanging={(e) => setBearing(e.nativeEvent.bearing)}
        onRegionDidChange={(e) => setBearing(e.nativeEvent.bearing)}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: region.defaultCentre, zoom: region.defaultZoom }}
          maxBounds={region.maxBounds}
          {...followCamera}
        />
        <GeoJSONSource
          id="places"
          data={markers ?? EMPTY_COLLECTION}
          hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}
          onPress={(e) => {
            markerPressedAt.current = Date.now();
            const f = e.nativeEvent.features[0];
            if (f?.geometry.type === "Point" && f.properties) {
              onMarkerPress?.(f.properties as MarkerProperties, f.geometry.coordinates as LngLat);
            }
          }}
        >
          <Layer type="circle" id="places-dot" minzoom={MARKER_MIN_ZOOM} paint={MARKER_CIRCLE_PAINT} />
          <Layer
            type="symbol"
            id="places-label"
            minzoom={16}
            layout={MARKER_LABEL_LAYOUT}
            paint={MARKER_LABEL_PAINT}
          />
        </GeoJSONSource>
        <GeoJSONSource id="routes" data={routesGeoJSON(routes)}>
          {/* A white edge, so the line stands out on the day map and the night one. */}
          <Layer
            type="line"
            id="route-casing"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={ROUTE_CASING_PAINT}
          />
          <Layer
            type="line"
            id="route-solid"
            filter={["==", ["get", "dashed"], false]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={ROUTE_LINE_PAINT}
          />
          <Layer
            type="line"
            id="route-dashed"
            filter={["==", ["get", "dashed"], true]}
            layout={{ "line-join": "round" }}
            paint={{ "line-color": ["get", "color"], "line-width": 5, "line-dasharray": [1.5, 1] }}
          />
        </GeoJSONSource>
        {/* Under the road names, so a street name always wins the space. */}
        <Layer
          type="symbol"
          id={HOUSE_NUMBER_LAYER}
          source={ROAD_NAME_SOURCE}
          source-layer={HOUSE_NUMBER_SOURCE_LAYER}
          minzoom={HOUSE_NUMBER_MIN_ZOOM}
          layout={houseNumberLayout}
          paint={houseNumberPaint(mapTheme)}
        />
        {roadNames && (
          <Layer
            type="symbol"
            id="road-names-bright"
            source={ROAD_NAME_SOURCE}
            source-layer={ROAD_NAME_SOURCE_LAYER}
            minzoom={14}
            layout={roadNameLayout}
            paint={roadNamePaint(mapTheme)}
          />
        )}
        <GeoJSONSource id="labels" data={labels ?? EMPTY_COLLECTION}>
          <Layer type="symbol" id="block-labels" minzoom={15} layout={LABEL_LAYOUT} paint={labelPaint(mapTheme)} />
        </GeoJSONSource>
        <GeoJSONSource id="team" data={team ?? EMPTY_COLLECTION}>
          <Layer type="circle" id="team-dot" paint={TEAM_CIRCLE_PAINT} />
          <Layer type="symbol" id="team-label" layout={TEAM_LABEL_LAYOUT} paint={teamLabelPaint(mapTheme)} />
        </GeoJSONSource>
        <GeoJSONSource id="restrictions" data={pointsGeoJSON(restrictions)}>
          <Layer type="circle" id="restriction-dot" paint={RESTRICTION_CIRCLE_PAINT} />
          <Layer
            type="symbol"
            id="restriction-label"
            layout={RESTRICTION_LABEL_LAYOUT}
            paint={RESTRICTION_LABEL_PAINT}
          />
        </GeoJSONSource>
        <GeoJSONSource id="destination" data={pointGeoJSON(destination)}>
          <Layer
            type="circle"
            id="destination-dot"
            paint={{
              "circle-radius": 9,
              "circle-color": colors.amber,
              "circle-stroke-color": colors.bg,
              "circle-stroke-width": 3,
            }}
          />
        </GeoJSONSource>
        {puck && (
          <GeoJSONSource id="me" data={puck}>
            <Layer
              type="circle"
              id="me-halo"
              paint={{ "circle-radius": 16, "circle-color": colors.blue, "circle-opacity": 0.25 }}
            />
            <Layer
              type="circle"
              id="me-dot"
              // With a direction of travel and an arrow to show it, the arrow replaces the dot.
              {...(vehicleArrow ? { filter: ["!", ["has", "course"]] as const } : {})}
              paint={{
                "circle-radius": 7,
                "circle-color": colors.blue,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
            {vehicleArrow && <Layer type="symbol" id="me-arrow" filter={["has", "course"]} layout={ARROW_LAYOUT} />}
          </GeoJSONSource>
        )}
        {vehicleArrow && <Images images={{ [VEHICLE_IMAGE]: require("../../assets/images/vehicle-arrow.png") }} />}
      </Map>

      {mapFailed && (
        // Below whatever floats over the top of the map (Search's box), not hidden under it.
        <View style={[styles.failed, { top: 16 + overlayTop }]} pointerEvents="none">
          <Text style={styles.failedTitle}>Map couldn’t load</Text>
          <Text style={styles.failedBody}>No connection to the map server. GPS is still running.</Text>
        </View>
      )}
      <MapButtons
        showView={viewControl}
        top={overlayTop + (compact ? 12 : 56)}
        bearing={bearing}
        onWhereAmI={onWhereAmI}
        onNorth={() => void camera.current?.setStop({ bearing: 0, pitch: 0, duration: 400 })}
        onZoom={zoomControl ? (step) => setZoomOffset((z) => Math.max(-3, Math.min(3, z + step))) : undefined}
      />
      {!following && position && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFollowing(true)}
          style={({ pressed }) => [styles.recentre, { bottom: 16 + overlayBottom }, pressed && styles.pressed]}
        >
          <Text style={styles.recentreText}>Recentre</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  recentre: {
    position: "absolute",
    right: 12,
    bottom: 16,
    backgroundColor: colors.amber,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.8 },
  failed: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 16,
    backgroundColor: colors.panel,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  failedTitle: { color: colors.amber, fontFamily: fonts.displaySemiBold, fontSize: 20 },
  failedBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  recentreText: {
    color: "#1a1200",
    fontFamily: fonts.displayBold,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
