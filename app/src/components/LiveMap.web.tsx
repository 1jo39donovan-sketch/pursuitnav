// Browser version of LiveMap, so the app can be previewed without a phone
// build. Same props and behaviour as LiveMap.tsx, using maplibre-gl.
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapControls.web.css";

import { Asset } from "expo-asset";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DEMO_MODE, MAP_STYLES, region } from "../config";
import { useMapStyle } from "./mapLooks";
import { demoBoroughLabels, demoMapStyle } from "../demo/demoMapStyle";
import { useLocation } from "../location/LocationProvider";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";
import { glider, type Pose } from "./glide";
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
  MARKER_CIRCLE_PAINT,
  MARKER_MIN_ZOOM,
  MARKER_LABEL_LAYOUT,
  MARKER_LABEL_PAINT,
  pointGeoJSON,
  pointsGeoJSON,
  RESTRICTION_CIRCLE_PAINT,
  RESTRICTION_LABEL_LAYOUT,
  RESTRICTION_LABEL_PAINT,
  ROUTE_CASING_PAINT,
  ROUTE_LINE_PAINT,
  routesGeoJSON,
  type LiveMapProps,
  type MarkerProperties,
  VEHICLE_IMAGE,
  vehicleFeature,
} from "./mapShared";
import { MapButtons } from "./MapButtons";
import { useThemed } from "../textSize";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

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
  onTeamPress,
  snapTo,
}: LiveMapProps) {
  const styles = useThemed(baseStyles);
  const { fix, facing } = useLocation();
  const { mapTheme, mapLook } = useSession();
  // For layers re-added on each style load: the theme now, not when the map was made.
  const theme = useRef(mapTheme);
  useEffect(() => {
    theme.current = mapTheme;
  }, [mapTheme]);
  const view = viewProp ?? (headingUp ? "heading" : "north");
  // The +/− buttons nudge the following zoom; auto-zoom adds the speed's.
  const [zoomOffset, setZoomOffset] = useState(0);
  const followAt =
    followZoom + zoomOffset + (autoZoom ? speedZoom(fix?.speed ?? null) : 0);
  const rotates = view !== "north";
  // Following the vehicle, unless the map opens on something to frame.
  const [following, setFollowing] = useState(!fitTo?.length);
  // A new view (3D, direction up, north up) is shown at once: back to the
  // vehicle, in that view, even if the map had been moved by hand.
  const [lastView, setLastView] = useState(view);
  if (view !== lastView) {
    setLastView(view);
    setFollowing(true);
  }
  const longPress = useRef(onLongPress);
  const tap = useRef(onPress);
  const markerPress = useRef(onMarkerPress);
  const teamPress = useRef(onTeamPress);
  useEffect(() => {
    longPress.current = onLongPress;
    tap.current = onPress;
    markerPress.current = onMarkerPress;
    teamPress.current = onTeamPress;
  }, [onLongPress, onPress, onMarkerPress, onTeamPress]);

  // New points to show: stop following so the camera can frame them.
  const [lastFitTo, setLastFitTo] = useState(fitTo);
  if (fitTo !== lastFitTo) {
    setLastFitTo(fitTo);
    if (fitTo?.length) setFollowing(false);
  }
  const container = useRef<View>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  // The demo map only has borough outlines, which say nothing at street zoom.
  const zoom = DEMO_MODE ? 12 : followAt;
  // Which way the map is turned, for the compass button.
  const [bearing, setBearing] = useState(0);
  // A new style (day/night) empties the map's own layers: drawn again on this.
  const [styleVersion, setStyleVersion] = useState(0);
  // Opens where the vehicle is, so a new screen doesn't fly in from the middle of London.
  const startAt = useRef({ fix, zoom });
  const looked = useMapStyle(MAP_STYLES[mapTheme], mapLook, mapTheme, MAP_STYLES.day);
  const style = DEMO_MODE ? demoMapStyle : looked;
  const firstStyle = useRef(style);

  useEffect(() => {
    const at = startAt.current;
    const m = new maplibregl.Map({
      container: container.current as unknown as HTMLElement,
      style: firstStyle.current,
      center: at.fix ? [at.fix.lng, at.fix.lat] : region.defaultCentre,
      zoom: at.fix ? at.zoom : region.defaultZoom,
      maxBounds: [
        [region.maxBounds[0], region.maxBounds[1]],
        [region.maxBounds[2], region.maxBounds[3]],
      ],
      // Added below, folded to its ⓘ button.
      attributionControl: false,
    });
    // The map data's credit, which its licence requires, as a small ⓘ that
    // opens on a tap, bottom-left clear of Recentre. maplibre-gl opens a
    // compact credit at first; fold it straight away.
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    const foldCredit = () =>
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    m.once("load", foldCredit);
    m.once("idle", foldCredit);
    if (!compact) m.addControl(new maplibregl.NavigationControl({ showZoom: false }), "top-right");
    m.on("rotate", () => setBearing(m.getBearing()));
    // On the first style and on each change of style (day/night), which
    // keeps the camera where it is but drops what was added to the map.
    m.on("style.load", () => {
      m.addSource("places", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "places-dot", type: "circle", source: "places", minzoom: MARKER_MIN_ZOOM, paint: MARKER_CIRCLE_PAINT });
      // The offline demo style has no glyphs to draw labels with.
      if (!DEMO_MODE) {
        m.addLayer({
          id: "places-label",
          type: "symbol",
          source: "places",
          minzoom: 16,
          layout: MARKER_LABEL_LAYOUT,
          paint: MARKER_LABEL_PAINT,
        });
      }
      m.on("click", "places-dot", (e) => {
        const f = e.features?.[0];
        if (f?.geometry.type === "Point") {
          markerPress.current?.(f.properties as MarkerProperties, f.geometry.coordinates as [number, number]);
        }
      });
      m.on("mouseenter", "places-dot", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "places-dot", () => (m.getCanvas().style.cursor = ""));
      m.addSource("routes", { type: "geojson", data: EMPTY });
      // A white edge, so the line stands out on the day map and the night one.
      m.addLayer({
        id: "route-casing",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: ROUTE_CASING_PAINT,
      });
      m.addLayer({
        id: "route-solid",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "dashed"], false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: ROUTE_LINE_PAINT,
      });
      m.addLayer({
        id: "route-dashed",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "dashed"], true],
        layout: { "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 5, "line-dasharray": [1.5, 1] },
      });
      // House numbers close in, under the road names so a street name always wins the space.
      if (m.getSource(ROAD_NAME_SOURCE)) {
        m.addLayer({
          id: HOUSE_NUMBER_LAYER,
          type: "symbol",
          source: ROAD_NAME_SOURCE,
          "source-layer": HOUSE_NUMBER_SOURCE_LAYER,
          minzoom: HOUSE_NUMBER_MIN_ZOOM,
          layout: houseNumberLayout,
          paint: houseNumberPaint(theme.current),
        });
      }
      if (roadNames && m.getSource(ROAD_NAME_SOURCE)) {
        m.addLayer({
          id: "road-names-bright",
          type: "symbol",
          source: ROAD_NAME_SOURCE,
          "source-layer": ROAD_NAME_SOURCE_LAYER,
          minzoom: 14,
          layout: roadNameLayout,
          paint: roadNamePaint(theme.current),
        });
      }
      m.addSource("labels", { type: "geojson", data: EMPTY });
      if (!DEMO_MODE) {
        m.addLayer({
          id: "block-labels",
          type: "symbol",
          source: "labels",
          minzoom: 15,
          layout: LABEL_LAYOUT,
          paint: labelPaint(theme.current),
        });
      }
      m.addSource("team", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "team-dot", type: "circle", source: "team", paint: TEAM_CIRCLE_PAINT });
      if (!DEMO_MODE) {
        m.addLayer({
          id: "team-label",
          type: "symbol",
          source: "team",
          layout: TEAM_LABEL_LAYOUT,
          paint: teamLabelPaint(theme.current),
        });
      }
      m.addSource("restrictions", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "restriction-dot", type: "circle", source: "restrictions", paint: RESTRICTION_CIRCLE_PAINT });
      if (!DEMO_MODE) {
        m.addLayer({
          id: "restriction-label",
          type: "symbol",
          source: "restrictions",
          layout: RESTRICTION_LABEL_LAYOUT,
          paint: RESTRICTION_LABEL_PAINT,
        });
      }
      m.addSource("destination", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "destination-dot",
        type: "circle",
        source: "destination",
        paint: {
          "circle-radius": 9,
          "circle-color": colors.amber,
          "circle-stroke-color": colors.bg,
          "circle-stroke-width": 3,
        },
      });
      m.addSource("me", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "me-halo",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 16, "circle-color": colors.blue, "circle-opacity": 0.25 },
      });
      m.addLayer({
        id: "me-dot",
        type: "circle",
        source: "me",
        // With a direction of travel and an arrow to show it, the arrow replaces the dot.
        ...(vehicleArrow ? { filter: ["!", ["has", "course"]] } : {}),
        paint: {
          "circle-radius": 7,
          "circle-color": colors.blue,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      if (vehicleArrow) {
        const arrow = new Image();
        arrow.onload = () => {
          if (!m.hasImage(VEHICLE_IMAGE)) m.addImage(VEHICLE_IMAGE, arrow);
          if (!m.getLayer("me-arrow")) {
            m.addLayer({ id: "me-arrow", type: "symbol", source: "me", filter: ["has", "course"], layout: ARROW_LAYOUT });
          }
        };
        arrow.src = Asset.fromModule(require("../../assets/images/vehicle-arrow.png")).uri;
      }
      if (DEMO_MODE) {
        // The offline demo style has no font glyphs, so names are HTML markers.
        for (const { name, lngLat } of demoBoroughLabels) {
          const el = document.createElement("div");
          el.textContent = name;
          Object.assign(el.style, {
            color: colors.muted,
            fontFamily: fonts.mono,
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            textAlign: "center",
            maxWidth: "90px",
            pointerEvents: "none",
          });
          new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(m);
        }
      }
      setLoaded(true);
      setStyleVersion((v) => v + 1);
      setMapFailed(false);
    });
    // An error before the style has loaded means the map itself is unusable.
    m.on("error", () => {
      if (!m.isStyleLoaded()) setMapFailed(true);
    });
    m.on("dragstart", () => setFollowing(false));
    // Right-click stands in for a long press with a mouse.
    let longAt = 0;
    const pressAt = (e: maplibregl.MapMouseEvent) => {
      longAt = Date.now();
      longPress.current?.([e.lngLat.lng, e.lngLat.lat]);
    };
    // A tap on the map, not on a place marker (that has its own card) and not the end of a long press.
    m.on("click", (e) => {
      if (Date.now() - longAt < 800) return;
      if (m.getLayer("places-dot") && m.queryRenderedFeatures(e.point, { layers: ["places-dot"] }).length) return;
      // A colleague's dot (a finger's width around it) opens their card instead.
      const near: [[number, number], [number, number]] = [
        [e.point.x - 14, e.point.y - 14],
        [e.point.x + 14, e.point.y + 14],
      ];
      const mate = m.getLayer("team-dot") ? m.queryRenderedFeatures(near, { layers: ["team-dot"] })[0] : undefined;
      if (mate && typeof mate.properties?.id === "string" && teamPress.current) {
        teamPress.current(mate.properties.id);
        return;
      }
      const at: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const r = HOUSE_NUMBER_TAP_PX;
      const numbers = m.getLayer(HOUSE_NUMBER_LAYER)
        ? m.queryRenderedFeatures(
            [
              [e.point.x - r, e.point.y - r],
              [e.point.x + r, e.point.y + r],
            ],
            { layers: [HOUSE_NUMBER_LAYER] },
          )
        : [];
      tap.current?.(at, nearestHouseNumber(numbers, at));
    });
    m.on("contextmenu", pressAt);
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    m.on("touchstart", (e) => {
      if (e.originalEvent.touches.length !== 1) return;
      pressTimer = setTimeout(() => pressAt(e as unknown as maplibregl.MapMouseEvent), 600);
    });
    for (const cancel of ["touchend", "touchmove", "touchcancel"] as const) {
      m.on(cancel, () => clearTimeout(pressTimer));
    }
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      // A new map (different style or view) has to load before it's drawn on.
      setLoaded(false);
    };
    // Day/night, the view and the labels change the map in place (below):
    // making a new one would jump the camera back to the middle of London.
  }, [compact, roadNames, vehicleArrow]);

  // Day or night: the new style, same camera.
  useEffect(() => {
    const m = map.current;
    if (!m || style === firstStyle.current) return;
    firstStyle.current = style;
    m.setStyle(style);
  }, [style]);

  // Turning by hand only in the north-up view; the others turn with the vehicle.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (rotates) {
      m.dragRotate.disable();
      m.touchZoomRotate.disableRotation();
    } else {
      m.dragRotate.enable();
      m.touchZoomRotate.enableRotation();
    }
  }, [rotates, loaded]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    const set = (id: string, data: GeoJSON.GeoJSON) => (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
    set("routes", routesGeoJSON(routes));
    set("destination", pointGeoJSON(destination));
    set("places", markers ?? EMPTY_COLLECTION);
    set("restrictions", pointsGeoJSON(restrictions));
    set("labels", labels ?? EMPTY_COLLECTION);
    set("team", team ?? EMPTY_COLLECTION);
  }, [routes, destination, markers, restrictions, labels, team, loaded, styleVersion]);

  // The credit's corner sits above a sheet over the bottom of the map.
  useEffect(() => {
    const corner = map.current?.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-bottom-left");
    if (corner) corner.style.bottom = `${overlayBottom}px`;
  }, [overlayBottom, loaded]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || !fitTo?.length) return;
    const [w, s, e, n] = boundsOf(fitTo);
    // Wait for the layout to settle (the route panel opening shrinks the map).
    const timer = setTimeout(() => {
      m.resize();
      m.fitBounds([[w, s], [e, n]], { padding: { ...FIT_PADDING, top: FIT_PADDING.top + overlayTop, bottom: FIT_PADDING.bottom + overlayBottom }, duration: 600 });
    }, FIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [fitTo, loaded, overlayTop, overlayBottom]);

  // Where the vehicle is drawn: on the route while navigating (snapTo), else the GPS fix.
  const target: Pose | null = snapTo ?? (fix ? { lng: fix.lng, lat: fix.lat, course: facing } : null);
  // The camera settings now, for the glide's frames.
  const cam = useRef({ following, zoom, view, lookAhead, rotates, overlayTop, overlayBottom });
  useEffect(() => {
    cam.current = { following, zoom, view, lookAhead, rotates, overlayTop, overlayBottom };
  });
  const paddingFor = (m: maplibregl.Map, c: typeof cam.current) => {
    // Navigating with the map turned: the vehicle sits low on the screen,
    // so most of what shows is the road ahead.
    const ahead = c.lookAhead && c.rotates ? Math.round(m.getContainer().clientHeight * LOOK_AHEAD) : 0;
    return { top: ahead + c.overlayTop / 2, bottom: c.overlayBottom / 2, left: 0, right: 0 };
  };
  // The vehicle glides from fix to fix, the map moving with it every frame, so
  // the arrow stays still on screen and the streets slide past (not a jump a second).
  const shown = useRef<Pose | null>(null);
  const glide = useRef<ReturnType<typeof glider> | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    const g = glider((p) => {
      shown.current = p;
      (m.getSource("me") as maplibregl.GeoJSONSource | undefined)?.setData(vehicleFeature(p.lng, p.lat, p.course));
      const c = cam.current;
      if (!c.following) return;
      // Zoom eases towards the speed's zoom a little each frame, rather than stepping.
      const z = m.getZoom();
      m.jumpTo({
        center: [p.lng, p.lat],
        zoom: Math.abs(c.zoom - z) < 0.01 ? c.zoom : z + (c.zoom - z) * 0.08,
        ...cameraFor(c.view, p.course),
        padding: paddingFor(m, c),
      });
    });
    glide.current = g;
    if (shown.current) g.to(shown.current);
    return () => g.stop();
  }, [loaded, styleVersion]);
  const tLng = target?.lng;
  const tLat = target?.lat;
  const tCourse = target?.course ?? null;
  useEffect(() => {
    if (tLng == null || tLat == null) return;
    glide.current?.to({ lng: tLng, lat: tLat, course: tCourse });
  }, [tLng, tLat, tCourse, loaded, styleVersion]);
  // A change of view, zoom or following with no new fix (the car stopped): move the camera there.
  useEffect(() => {
    const m = map.current;
    const p = shown.current;
    if (!m || !loaded || !p || !following) return;
    m.easeTo({
      center: [p.lng, p.lat],
      zoom,
      ...cameraFor(view, p.course),
      padding: paddingFor(m, cam.current),
      duration: 600,
    });
  }, [following, zoom, view, lookAhead, rotates, overlayTop, overlayBottom, loaded]);

  return (
    <View style={styles.container}>
      {/* flex rather than absoluteFill: maplibre-gl's CSS sets position: relative on this element. */}
      <View ref={container} style={styles.map} />
      {mapFailed && (
        // Below whatever floats over the top of the map (Search's box), not hidden under it.
        <View style={[styles.failed, { top: 16 + overlayTop }]} pointerEvents="none">
          <Text style={styles.failedTitle}>Map couldn’t load</Text>
          <Text style={styles.failedBody}>No connection to the map server. GPS is still running.</Text>
        </View>
      )}
      {!DEMO_MODE && (
        <MapButtons
          showView={viewControl}
          top={overlayTop + (compact ? 12 : 56)}
          bearing={bearing}
          onWhereAmI={onWhereAmI}
          onNorth={() => map.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 })}
          onZoom={zoomControl ? (step) => setZoomOffset((z) => Math.max(-3, Math.min(3, z + step))) : undefined}
        />
      )}
      {!following && fix && (
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

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  map: { flex: 1 },
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
