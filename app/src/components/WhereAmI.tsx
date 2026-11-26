// "Where am I": exactly where the officer is, to read out on the radio or
// send: the address (nearest mapped house number), postcode, borough, OS
// grid reference, latitude and longitude, and how accurate the fix is.
// Worked out on the phone where it can be (grid reference, borough, nearest
// postcode), so it still says something with no signal.
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { fetchWhere, type WhereAnswer } from "../api/where";
import type { Fix } from "../location/LocationProvider";
import { SAVED_SPOTS_MAX, addSpot, loadSpots, saveSpots, savedWhen, spotText, type SavedSpot } from "../location/savedSpots";
import { shareText, shouldLookUp, whereDetails } from "../location/whereDetails";
import type { SearchIndex } from "../search/engine";
import { store } from "../storage/store";
import { colors, fonts } from "../theme";
import { useThemed } from "../textSize";

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
  const styles = useThemed(baseStyles);
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
  // Saved spots (an arrest, say): the last five, on this phone only.
  const [spots, setSpots] = useState<SavedSpot[]>(() => loadSpots(store));
  const [showSpots, setShowSpots] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const shareResult = (r: "shared" | "copied" | "failed") =>
    setShared(r === "copied" ? "Copied: paste it into a message." : r === "failed" ? "Couldn’t share." : null);

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
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save this spot, with the time"
              onPress={() => {
                // What's on screen now, address and all (or what the phone knows without signal).
                const spot: SavedSpot = { ...d, address: answer === "loading" ? null : d.address, savedAt: Date.now() };
                const next = addSpot(spots, spot);
                setSpots(next);
                saveSpots(store, next);
                setSaved(`Saved at ${new Date(spot.savedAt).toLocaleTimeString("en-GB")}`);
                setShowSpots(true);
              }}
              style={({ pressed }) => [styles.share, styles.save, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.shareText, styles.saveText]}>Save spot</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void share(shareText(d)).then(shareResult)}
              style={({ pressed }) => [styles.share, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.shareText}>Share</Text>
            </Pressable>
          </View>
          {(saved || shared) && <Text style={styles.note}>{[saved, shared].filter(Boolean).join(" · ")}</Text>}
        </>
      )}
      {spots.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showSpots }}
          onPress={() => setShowSpots((v) => !v)}
          hitSlop={8}
          style={styles.spotsToggle}
        >
          <Text style={styles.spotsToggleText}>
            {showSpots ? "▾" : "▸"} Saved spots ({spots.length} of {SAVED_SPOTS_MAX}, newest first)
          </Text>
        </Pressable>
      )}
      {showSpots && (
        // Scrolls rather than pushing the details off a small screen.
        <ScrollView style={styles.spots} nestedScrollEnabled>
          {spots.map((s) => (
            <View key={s.savedAt} style={styles.spot}>
              <View style={styles.valueBox}>
                <Text style={styles.spotWhen}>{savedWhen(s)}</Text>
                <Text style={styles.value} selectable numberOfLines={2}>
                  {[s.address, s.postcode].filter(Boolean).join(", ") || s.grid || s.latLng}
                </Text>
                <Text style={styles.note} selectable>
                  {[s.grid && `OS ${s.grid}`, s.latLng, s.accuracyM != null && `±${s.accuracyM} m`]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Share the spot saved ${savedWhen(s)}`}
                onPress={() => void share(spotText(s)).then(shareResult)}
                hitSlop={8}
              >
                <Text style={styles.close}>Share</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
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
    flex: 1,
    marginTop: 8,
    backgroundColor: colors.blue,
    borderRadius: 12,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  shareText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 1, textTransform: "uppercase" },
  buttons: { flexDirection: "row", gap: 10 },
  save: { backgroundColor: colors.amber },
  saveText: { color: "#1a1200" },
  spotsToggle: { paddingVertical: 8 },
  spotsToggleText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  spots: { maxHeight: 240 },
  spot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  spotWhen: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
