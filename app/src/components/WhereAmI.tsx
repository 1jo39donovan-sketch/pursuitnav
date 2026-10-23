// "Where am I": exactly where the officer is, to read out on the radio or
// send: the address (nearest mapped house number), postcode, borough, OS
// grid reference, latitude and longitude, and how accurate the fix is.
// Worked out on the phone where it can be (grid reference, borough, nearest
// postcode), so it still says something with no signal.
import { useEffect, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { fetchWhere, type WhereAnswer } from "../api/where";
import type { Fix } from "../location/LocationProvider";
import { shareText, whereDetails } from "../location/whereDetails";
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
  // Asked once, for where the officer was when they tapped.
  const [asked] = useState(fix);
  const [answer, setAnswer] = useState<WhereAnswer | null | "loading">("loading");
  const [shared, setShared] = useState<string | null>(null);
  useEffect(() => {
    if (!asked) return;
    let live = true;
    void fetchWhere(asked.lat, asked.lng).then((a) => live && setAnswer(a));
    return () => {
      live = false;
    };
  }, [asked]);

  const near = asked && index ? index.postcodeNear(asked.lat, asked.lng) : null;
  const d = asked
    ? whereDetails(asked, answer === "loading" ? null : answer, near && { postcode: near.point.postcode, distanceM: near.distanceM })
    : null;

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
        <Text style={styles.title}>Where am I</Text>
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
