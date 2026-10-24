import { useLayoutEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { NoPoliceReason, Route, RoutePlan } from "../api/routes";
import type { PointOfInterest } from "../search/places";
import { formatDistance, formatDuration } from "../format";
import { recorder, useRecorder } from "../fieldtest/instance";
import { RETRYING_WHEN_BACK } from "../navigation/connectivity";
import { planningText } from "../navigation/planning";
import {
  cardSlots,
  createTapGuard,
  planAgeText,
  slotKey,
  type PlanOrigin,
  type PoliceSlot,
} from "../navigation/routeChoice";
import { colors, fonts } from "../theme";
import { ROUTE_ALT } from "./mapShared";
import { useElapsed } from "./useElapsed";

export type PlanState =
  | { status: "loading" }
  /** waitingForFix: refused for want of a GPS position; routes when the first fix arrives. */
  /** noSignal: the network failed; the card offers the hand-offs and retries when signal is back. */
  /** serverDown: the server is down or didn't answer; the hand-offs come first, big. */
  | { status: "error"; message: string; waitingForFix?: boolean; noSignal?: boolean; serverDown?: boolean }
  /**
   * checking: the standard route is here, the blue-light one is still being worked out.
   * origin: where and when the plan was made, to refresh an old one before it's followed.
   */
  | { status: "ready"; plan: RoutePlan; checking?: boolean; origin?: PlanOrigin };

interface Props {
  state: PlanState;
  destination: { lat: number; lng: number };
  /** What was picked, e.g. "54 Caledonian Road". */
  title?: string;
  /** A caution about the destination, e.g. that it's a postcode, not the door. */
  note?: string;
  onClose: () => void;
  /** Try again after an error, to the same destination. */
  onRetry?: () => void;
  /** Start turn-by-turn on the chosen route. */
  onGo: (kind: "standard" | "police") => void;
  /** Named blocks and estates on the road, when the destination is a whole road. */
  blocks?: PointOfInterest[];
  onPickBlock?: (block: PointOfInterest) => void;
  /** Handing over to another app (logged as the route picked). */
  onOpenExternal?: (app: "google-maps" | "waze") => void;
}

// Why there's no blue-light route, in one short line under the standard route.
const NO_POLICE: Record<NoPoliceReason, string> = {
  "not-faster": "No faster blue-light route.",
  "no-restrictions-found": "No blue-light route: a faster one's restrictions couldn't be listed.",
  "wrong-way-unavoidable": "No blue-light route: the faster one goes the wrong way down a one-way street.",
  "vehicle-limit-unavoidable": "No blue-light route: the faster one has a limit your vehicle can't take.",
  "not-checked": "Blue-light routes are off (Session).",
  "check-failed": "Couldn’t check for a blue-light route (no signal?).",
  "not-declared": "A faster blue-light route exists: turn blue-light routes on in Session.",
};

/** The two routes side by side, for the operator to choose between. */
export function RoutePanel({
  state,
  destination,
  title,
  note,
  blocks,
  onPickBlock,
  onClose,
  onRetry,
  onGo,
  onOpenExternal,
}: Props) {
  const { lat, lng } = destination;
  // A slow answer reads as "still planning", never as a fault.
  const waiting = state.status === "loading" || (state.status === "ready" && !!state.checking);
  const waited = useElapsed(waiting, `${lat},${lng}`);
  // How old the plan is: said once it's old enough that Go will refresh it.
  const madeAt = state.status === "ready" ? state.origin?.madeAt : undefined;
  const age = useElapsed(madeAt !== undefined, madeAt);
  const ageText = madeAt !== undefined ? planAgeText(0, age) : null;

  // Blue light always left, standard always right, whatever has arrived.
  const slots = state.status === "ready" ? cardSlots(state.plan, !!state.checking) : null;
  // A Go tap just after a card changes is ignored: it was aimed at what was there before.
  const [guard] = useState(() => createTapGuard());
  const shownKey = slots ? slots.map(slotKey).join("|") : state.status;
  useLayoutEffect(() => guard.see(shownKey, Date.now()), [guard, shownKey]);
  const go = (kind: "standard" | "police") => {
    if (guard.allows(Date.now())) onGo(kind);
    else recorder.event({ type: "tap-ignored" });
  };
  const { recording } = useRecorder();
  const [showRestrictions, setShowRestrictions] = useState(false);
  // No route from Blue Route: Google Maps and Waze become the main buttons, so a crew is never stuck.
  const handOff = state.status === "error" && (!!state.noSignal || !!state.serverDown);
  return (
    <View style={styles.panel}>
      {/* One line: where to, how fresh the plan is, and Clear. */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          {title && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear destination" onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>Clear</Text>
        </Pressable>
      </View>
      {(note || ageText) && (
        <Text style={styles.note} numberOfLines={2}>
          {[note, ageText && `${ageText}: Go works them out again`].filter(Boolean).join(" · ")}
        </Text>
      )}
      {state.status === "loading" && <Text style={styles.status}>{planningText("routes", waited)}</Text>}
      {state.status === "error" && (
        <View style={styles.errorBox}>
          <Text style={[styles.status, styles.error]}>{state.message}</Text>
          {state.noSignal && <Text style={styles.status}>{RETRYING_WHEN_BACK}</Text>}
          {handOff && <ExternalLinks lat={lat} lng={lng} onOpen={onOpenExternal} prominent />}
          {onRetry && !state.waitingForFix && (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={({ pressed }) => [handOff ? styles.retryQuiet : styles.retry, pressed && { opacity: 0.85 }]}
            >
              <Text style={handOff ? styles.retryQuietText : styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}
      {slots && state.status === "ready" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Blue light on top while it's being worked out or when there is one; otherwise one line under standard. */}
          {(slots[0].state === "route" || slots[0].state === "checking") && (
            <PoliceRow
              slot={slots[0]}
              checkingText={planningText("blue-light", waited)}
              onGo={() => go("police")}
              expanded={showRestrictions}
              onToggle={() => setShowRestrictions((v) => !v)}
            />
          )}
          <StandardRow
            route={slots[1].route}
            // "Fastest" only means something beside a blue-light route.
            fastest={slots[1].fastest && slots[0].state === "route"}
            // Matches the map: grey under a blue-light route, blue on its own.
            swatch={slots[0].state === "route" ? ROUTE_ALT : colors.blue}
            onGo={() => go("standard")}
          />
          {slots[0].state === "none" && <Text style={styles.closures}>{NO_POLICE[slots[0].reason]}</Text>}
          <ClosuresLine closures={state.plan.closures} />
          {recording && <OtherEtas />}
          {blocks && blocks.length > 0 && (
            <View style={styles.blocks}>
              <Text style={styles.blocksLabel}>Blocks and estates on this road</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.blockRow}>
                {blocks.map((b) => (
                  <Pressable
                    key={`${b.name}|${b.lat}|${b.lng}`}
                    accessibilityRole="button"
                    onPress={() => onPickBlock?.(b)}
                    style={({ pressed }) => [styles.block, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.blockText}>{b.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      )}

      {!handOff && <ExternalLinks lat={lat} lng={lng} onOpen={onOpenExternal} />}
    </View>
  );
}

/**
 * Field-test recording: what other apps say for the same trip, in minutes,
 * typed before Go or later on the Log. Skippable.
 */
function OtherEtas() {
  const [blm, setBlm] = useState("");
  const [google, setGoogle] = useState("");
  const minutes = (v: string) => (/^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : null);
  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <View style={styles.otherField}>
      <Text style={styles.otherLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={3}
        placeholder="min"
        placeholderTextColor={colors.muted}
        style={styles.otherInput}
        accessibilityLabel={`${label} ETA in minutes`}
      />
    </View>
  );
  return (
    <View style={styles.others}>
      <Text style={styles.otherTitle}>Other apps’ ETA (optional)</Text>
      <View style={styles.otherRow}>
        {field("Blue Light Maps", blm, (v) => {
          setBlm(v);
          recorder.setOthers({ blueLightMaps: minutes(v), googleApple: minutes(google) });
        })}
        {field("Google/Apple", google, (v) => {
          setGoogle(v);
          recorder.setOthers({ blueLightMaps: minutes(blm), googleApple: minutes(v) });
        })}
      </View>
    </View>
  );
}

function GoButton({ onPress, color, label }: { onPress: () => void; color: string; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.go, { backgroundColor: color }, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.goText}>Go</Text>
    </Pressable>
  );
}

function StandardRow({
  route,
  fastest,
  swatch,
  onGo,
}: {
  route: Route;
  fastest: boolean;
  swatch: string;
  onGo: () => void;
}) {
  return (
    <View style={[styles.row, fastest && styles.rowFastest]}>
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          Standard{fastest ? <Text style={styles.fastest}> · fastest</Text> : null}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatDistance(route.distanceM)}
        </Text>
        <TrafficLine route={route} />
      </View>
      <Text style={styles.eta}>{formatDuration(route.durationS)}</Text>
      <GoButton onPress={onGo} color={colors.blue} label="Go on the standard route" />
    </View>
  );
}

/**
 * Live TfL holdups: one the route still goes through (amber, with TfL's
 * update), or that it was routed round. Nothing when there are none.
 */
function TrafficLine({ route }: { route: Route }) {
  const on = route.delays ?? [];
  const avoided = route.delaysAvoided ?? [];
  if (on.length) {
    const d = on[0]!;
    return (
      <Text style={styles.traffic} numberOfLines={2}>
        ⚠ {d.severity} holdup: {titleCase(d.street)}
        {on.length > 1 ? ` (+${on.length - 1})` : ""}. {d.update}
      </Text>
    );
  }
  if (avoided.length) {
    return (
      <Text style={styles.trafficAvoided} numberOfLines={1}>
        ↪ Round a TfL holdup: {titleCase(avoided[0]!.street)}
        {avoided.length > 1 ? ` (+${avoided.length - 1})` : ""}
      </Text>
    );
  }
  return null;
}

/** TfL writes street names in capitals: "[A23] PURLEY WAY (CR0)" → "[A23] Purley Way (CR0)". */
function titleCase(street: string): string {
  return street.replace(/\b([A-Z])([A-Z']+)\b/g, (m, a: string, b: string) =>
    /\d/.test(m) ? m : a + b.toLowerCase(),
  );
}

function PoliceRow({
  slot,
  checkingText,
  onGo,
  expanded,
  onToggle,
}: {
  slot: PoliceSlot;
  checkingText: string;
  onGo: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (slot.state !== "route") {
    return (
      <View style={[styles.row, styles.rowMuted]}>
        <View style={[styles.swatch, styles.swatchMuted]} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Blue light</Text>
          <Text style={styles.meta} numberOfLines={2}>
            {slot.state === "checking" ? checkingText : NO_POLICE[slot.reason]}
          </Text>
        </View>
      </View>
    );
  }
  const route = slot.route;
  const count = route.restrictions.length;
  const countText = `${route.restrictionsComplete ? "" : "at least "}${count} restriction${count === 1 ? "" : "s"}`;
  return (
    <View style={[styles.rowWrap, styles.rowPolice]}>
      <View style={styles.rowInner}>
        <View style={[styles.swatch, { backgroundColor: colors.blue }]} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Blue light</Text>
          <Text style={[styles.meta, styles.saving]} numberOfLines={1}>
            Saves {formatDuration(route.savingS)}
          </Text>
          <TrafficLine route={route} />
        </View>
        <Text style={styles.eta}>{formatDuration(route.durationS)}</Text>
        <GoButton onPress={onGo} color={colors.amber} label="Go on the blue-light route" />
      </View>
      {/* Always says how many it relies on; tap for the list (they're on the map too). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${countText}. ${expanded ? "Hide" : "Show"} the list`}
        onPress={onToggle}
        hitSlop={6}
      >
        <Text style={styles.relies}>
          {formatDistance(route.distanceM)} · relies on {countText} {expanded ? "▴" : "▾"}
        </Text>
      </Pressable>
      {expanded &&
        route.restrictions.map((r, i) => (
          <Text key={i} style={styles.restriction}>
            • {r.description}
          </Text>
        ))}
    </View>
  );
}

/** Hand the destination to Google Maps or Waze. Also on the navigation screen. */
export function ExternalLinks({
  lat,
  lng,
  onOpen,
  prominent = false,
}: {
  lat: number;
  lng: number;
  onOpen?: (app: "google-maps" | "waze") => void;
  /** Big, as the main way on: when Blue Route can't give a route. */
  prominent?: boolean;
}) {
  return (
    <View style={styles.links}>
      <LinkButton
        label="Google Maps"
        url={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`}
        onPress={() => onOpen?.("google-maps")}
        prominent={prominent}
      />
      <LinkButton
        label="Waze"
        url={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`}
        onPress={() => onOpen?.("waze")}
        prominent={prominent}
      />
    </View>
  );
}

function LinkButton({
  label,
  url,
  onPress,
  prominent,
}: {
  label: string;
  url: string;
  onPress?: () => void;
  prominent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open in ${label}`}
      onPress={() => {
        onPress?.();
        Linking.openURL(url);
      }}
      style={({ pressed }) => [styles.link, prominent && styles.linkProminent, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.linkText, prominent && styles.linkTextProminent]} numberOfLines={1} adjustsFontSizeToFit>
        {label} ↗
      </Text>
    </Pressable>
  );
}

/** Live closures: said only when the route may go through one, or they couldn't be checked. */
function ClosuresLine({ closures }: { closures: RoutePlan["closures"] }) {
  if (!closures) return null;
  if (closures.ignored) {
    return (
      <Text style={[styles.closures, styles.closuresWarn]}>
        ⚠ No way round a TfL road closure: this route may go through one.
      </Text>
    );
  }
  if (!closures.updatedAt) return <Text style={styles.closures}>Live TfL closures unavailable right now.</Text>;
  return null;
}

const styles = StyleSheet.create({
  // A sheet over the bottom of the map, rounded and lifted, as in Google Maps.
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginTop: -18,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 6,
    maxHeight: "50%",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 21, lineHeight: 24 },
  note: { color: colors.amber, fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  closures: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 15 },
  closuresWarn: { color: colors.amber, fontFamily: fonts.bodySemiBold },
  close: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16, paddingVertical: 4 },
  status: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, paddingVertical: 10 },
  error: { color: colors.amber },
  errorBox: { gap: 4 },
  retry: {
    borderRadius: 10,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.blue,
  },
  retryQuiet: {
    borderRadius: 999,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.panel,
  },
  retryQuietText: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 15 },
  retryText: {
    color: "#0c1220",
    fontFamily: fonts.displayBold,
    fontSize: 22,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 6 },
  // A row: colour swatch, name, time, Go. The same height whatever it says.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
  },
  rowWrap: {
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 2,
  },
  rowInner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56 },
  rowPolice: { borderColor: colors.amber },
  rowFastest: { borderColor: colors.blue },
  rowMuted: { opacity: 0.85 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  others: { gap: 6, paddingVertical: 4 },
  otherTitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  otherRow: { flexDirection: "row", gap: 10 },
  otherField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  otherLabel: { color: colors.fg, fontFamily: fonts.body, fontSize: 13, flexShrink: 1 },
  otherInput: {
    width: 56,
    minHeight: 40,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fg,
    fontFamily: fonts.mono,
    fontSize: 16,
    textAlign: "center",
  },
  swatch: { width: 6, alignSelf: "stretch", borderRadius: 3, marginVertical: 4 },
  swatchMuted: { backgroundColor: colors.line },
  eta: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 28,
    fontVariant: ["tabular-nums"],
  },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 17 },
  saving: { color: colors.amber, fontFamily: fonts.bodySemiBold },
  traffic: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 12, lineHeight: 16, marginTop: 2 },
  trafficAvoided: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 16, marginTop: 2 },
  relies: { color: colors.amber, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, paddingVertical: 4 },
  restriction: { color: colors.fg, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  go: {
    borderRadius: 10,
    width: 76,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  goText: {
    color: "#0c1220",
    fontFamily: fonts.displayBold,
    fontSize: 24,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  fastest: { color: colors.ok, fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 1 },
  blocks: { gap: 6 },
  blocksLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  blockRow: { gap: 8 },
  block: {
    borderColor: "#60a5fa",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  blockText: { color: "#93c5fd", fontFamily: fonts.bodySemiBold, fontSize: 15 },
  links: { flexDirection: "row", gap: 8 },
  // Quiet: a hand-off to another app, not the main choice.
  link: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  linkText: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 15 },
  linkProminent: { backgroundColor: colors.blue, borderRadius: 12, minHeight: 60 },
  linkTextProminent: { color: "#0c1220", fontFamily: fonts.displayBold, fontSize: 20 },
});
