// "Where am I": exactly where the officer is, to read out on the radio or
// send: the address (nearest mapped house number), postcode, borough, OS
// grid reference, latitude and longitude, and how accurate the fix is.
// Worked out on the phone where it can be (grid reference, borough, nearest
// postcode), so it still says something with no signal.
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { fetchWhere, type WhereAnswer } from "../api/where";
import type { Fix } from "../location/LocationProvider";
import { shareText, shouldLookUp, whereDetails } from "../location/whereDetails";
import type { SearchIndex } from "../search/engine";
import { colors, fonts } from "../theme";

async function share(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (Platform.OS === "web") {
      const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ text });
        return "shared";
      }
      await navigator.clipboard.writeText(text);
      return "copied";
    }
    await Share.share({ message: text });
    return "shared";
  } catch {
    return "failed";
  }
}

export function WhereAmI({
  fix,
  index,
  onClose,
  bottomInset,
}: {
  fix: Fix | null;
  index: SearchIndex | null;
  onClose: () => void;
  bottomInset: number;
}) {
  // Follows the officer while open: grid reference, position and accuracy
  // on every fix; the address looked up again every 15 m or 20 s, keeping
  // the last one on screen meanwhile.
  const [lookup, setLookup] = useState<{ lat: number; lng: number; at: number; answer: WhereAnswer | null } | null>(
    null,
  );
  const inFlight = useRef(false);
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!fix || inFlight.current || !shouldLookUp(lookup, fix, Date.now())) return;
    inFlight.current = true;
    const at = { lat: fix.lat, lng: fix.lng, at: Date.now() };
    void fetchWhere(fix.lat, fix.lng)
      .then((answer) => open.current && setLookup({ ...at, answer }))
      .finally(() => {
        inFlight.current = false;
      });
  }, [fix, lookup]);
  const [shared, setShared] = useState<string | null>(null);

  const near = fix && index ? index.postcodeNear(fix.lat, fix.lng) : null;
  const d = fix
    ? whereDetails(fix, lookup?.answer ?? null, near && { postcode: near.point.postcode, distanceM: near.distanceM })
    : null;
  const answer = lookup ? lookup.answer : "loading";

  const row = (label: string, value: string | null, note?: string | null, big = false) => (
    <View style={styles.row} key={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueBox}>
        <Text style={[styles.value, big && styles.big]} selectable>
          {value ?? "—"}
        </Text>
        {note && <Text style={styles.note}>{note}</Text>}
      </View>
    </View>
  );

  return (
    <View style={[styles.panel, { paddingBottom: bottomInset + 14 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Where am I</Text>
          <Text style={styles.note}>Updates as you move</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
      {!d ? (
        <Text style={styles.note}>Waiting for a GPS position.</Text>
      ) : (
        <>
          {row(
            "Address",
            answer === "loading" ? "Looking up…" : d.address,
            answer === null ? "No answer from the server: what the phone knows is below." : null,
            true,
          )}
          {row("Postcode", d.postcode, d.postcodeNote)}
          {row("Borough", d.borough)}
          {row("OS grid", d.grid)}
          {row("Lat, long", d.latLng)}
          {row(
            "Accuracy",
            d.accuracyM == null ? null : `±${d.accuracyM} m`,
            `at ${new Date(d.at).toLocaleTimeString("en-GB")}${d.accuracyM != null && d.accuracyM > 50 ? " · poor: move into the open if you can" : ""}`,
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => void share(shareText(d)).then((r) => setShared(r === "copied" ? "Copied: paste it into a message." : r === "failed" ? "Couldn’t share." : null))}
            style={({ pressed }) => [styles.share, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.shareText}>Share location</Text>
          </Pressable>
          {shared && <Text style={styles.note}>{shared}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.panel,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 24 },
  close: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 17 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 3 },
  label: { width: 86, color: colors.muted, fontFamily: fonts.body, fontSize: 14, paddingTop: 2 },
  valueBox: { flex: 1 },
  value: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17 },
  big: { fontSize: 21 },
  note: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  share: {
    marginTop: 8,
    backgroundColor: colors.blue,
    borderRadius: 12,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  shareText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 1, textTransform: "uppercase" },
});
