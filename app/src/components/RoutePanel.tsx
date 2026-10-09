import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { NoPoliceReason, PoliceRoute, Route, RoutePlan } from "../api/routes";
import { formatDistance, formatDuration } from "../format";
import { colors, fonts } from "../theme";

export type PlanState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; plan: RoutePlan };

interface Props {
  state: PlanState;
  destination: { lat: number; lng: number };
  /** What was picked, e.g. "54 Caledonian Road". */
  title?: string;
  /** A caution about the destination, e.g. that it's the road, not the door. */
  note?: string;
  onClose: () => void;
  /** Start turn-by-turn on the chosen route. */
  onGo: (kind: "standard" | "police") => void;
}

const NO_POLICE: Record<NoPoliceReason, string> = {
  "not-faster": "No meaningfully faster route using bus lanes or restricted turns.",
  "no-restrictions-found": "A faster route exists but its restrictions couldn't be identified, so it isn't offered.",
  "wrong-way-unavoidable": "The only faster route goes against a one-way street, so it isn't offered.",
};

/** The two routes side by side, for the operator to choose between. */
export function RoutePanel({ state, destination, title, note, onClose, onGo }: Props) {
  const { lat, lng } = destination;
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.label}>Routes from your position</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear destination" onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>Clear</Text>
        </Pressable>
      </View>

      {title && (
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      )}
      {note && <Text style={styles.note}>{note}</Text>}
      {state.status === "loading" && <Text style={styles.status}>Working out routes…</Text>}
      {state.status === "error" && <Text style={[styles.status, styles.error]}>{state.message}</Text>}
      {state.status === "ready" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.cards}>
          <StandardCard route={state.plan.standard} onGo={() => onGo("standard")} />
          <PoliceCard route={state.plan.police} reason={state.plan.noPoliceReason} onGo={() => onGo("police")} />
        </ScrollView>
      )}

      <View style={styles.links}>
        <LinkButton
          label="Open in Google Maps"
          url={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`}
        />
        <LinkButton label="Open in Waze" url={`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`} />
      </View>
    </View>
  );
}

function GoButton({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.go, { backgroundColor: color }, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.goText}>Go</Text>
    </Pressable>
  );
}

function StandardCard({ route, onGo }: { route: Route; onGo: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Standard</Text>
        <Text style={[styles.tag, { color: colors.ok, borderColor: colors.ok }]}>LEGAL</Text>
      </View>
      <Text style={styles.eta}>{formatDuration(route.durationS)}</Text>
      <Text style={styles.meta}>{formatDistance(route.distanceM)} · follows all restrictions</Text>
      <View style={[styles.swatch, { backgroundColor: colors.blue }]} />
      <GoButton onPress={onGo} color={colors.blue} />
    </View>
  );
}

function PoliceCard({
  route,
  reason,
  onGo,
}: {
  route: PoliceRoute | null;
  reason?: NoPoliceReason;
  onGo: () => void;
}) {
  if (!route) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.cardTitle}>Police</Text>
        <Text style={styles.meta}>{NO_POLICE[reason ?? "not-faster"]}</Text>
      </View>
    );
  }
  const count = route.restrictions.length;
  const countText = `${route.restrictionsComplete ? "" : "at least "}${count} restriction${count === 1 ? "" : "s"}`;
  return (
    <View style={[styles.card, styles.cardPolice]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Police</Text>
        <Text style={styles.tag}>{countText.toUpperCase()}</Text>
      </View>
      <Text style={styles.eta}>{formatDuration(route.durationS)}</Text>
      <Text style={[styles.meta, styles.saving]}>Saves {formatDuration(route.savingS)}</Text>
      <Text style={styles.meta}>{formatDistance(route.distanceM)} · relies on {countText}:</Text>
      {route.restrictions.map((r, i) => (
        <Text key={i} style={styles.restriction}>
          • {r.description}
        </Text>
      ))}
      <View style={[styles.swatch, styles.swatchDashed]} />
      <GoButton onPress={onGo} color={colors.amber} />
    </View>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
    maxHeight: "55%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 24, lineHeight: 26 },
  note: { color: colors.amber, fontFamily: fonts.body, fontSize: 13 },
  close: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
  status: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, paddingVertical: 12 },
  error: { color: colors.amber },
  scroll: { flexGrow: 0 },
  cards: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  cardPolice: { borderColor: colors.amber },
  cardMuted: { gap: 6 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 },
  cardTitle: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tag: {
    color: colors.amber,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontFamily: fonts.mono,
    fontSize: 10,
    flexShrink: 1,
  },
  eta: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 32,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  saving: { color: colors.amber, fontFamily: fonts.bodySemiBold },
  restriction: { color: colors.fg, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 4 },
  swatch: { height: 4, borderRadius: 2, marginTop: 10 },
  swatchDashed: { borderTopWidth: 4, borderStyle: "dashed", borderColor: colors.amber, height: 0 },
  go: { borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 10 },
  goText: { color: "#0c1220", fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 1.5, textTransform: "uppercase" },
  links: { flexDirection: "row", gap: 10 },
  link: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  linkText: {
    color: colors.fg,
    fontFamily: fonts.displaySemiBold,
    fontSize: 15,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
