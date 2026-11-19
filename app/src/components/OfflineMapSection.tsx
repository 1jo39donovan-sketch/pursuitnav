// Session: the map kept on the phone for when there's no signal. Says whether
// it's here, how big and how old; downloads it (size shown first, then
// progress), on Wi-Fi unless mobile data is allowed; deletes it after an
// in-app confirmation.
import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { API_URL, region } from "../config";
import { useOfflineMap } from "../offline/OfflineMapProvider";
import { readyText, sizeText, staleText } from "../offline/offlinePack";
import { colors, fonts } from "../theme";
import { Button } from "./Button";
import { useTextStyles, useColors } from "../textSize";

export function OfflineMapSection() {
  const palette = useColors();
  const styles = useTextStyles(baseStyles);
  const offline = useOfflineMap();
  const { state, check } = offline;
  const [confirmDelete, setConfirmDelete] = useState(false);
  // For the pack's age; Session is opened often enough for this to be fresh.
  const [now] = useState(() => Date.now());

  // What's on offer (its size), asked once when there's nothing on the phone.
  const needsOffer = offline.supported && !!API_URL && state.status === "none" && !state.offer && !state.checking && !state.error;
  useEffect(() => {
    if (needsOffer) check();
  }, [needsOffer, check]);

  if (!offline.supported) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>Map for offline use</Text>
        <Text style={styles.meta}>Offline maps are in the phone app.</Text>
      </View>
    );
  }

  const mobile = (
    <View style={styles.toggleRow}>
      <Text style={[styles.name, styles.grow]} nativeID="offline-mobile-label">
        Download on mobile data
      </Text>
      <Switch
        accessibilityLabelledBy="offline-mobile-label"
        value={offline.allowMobile}
        onValueChange={offline.setAllowMobile}
        trackColor={{ false: palette.line, true: palette.amber }}
      />
    </View>
  );

  let body: React.ReactNode;
  if (state.status === "ready") {
    const stale = staleText(state.built, now);
    body = (
      <>
        <Text style={styles.name}>Downloaded: works with no signal</Text>
        <Text style={styles.meta}>{readyText(state.built, state.bytes)}</Text>
        {stale && <Text style={styles.warn}>{stale}</Text>}
        {confirmDelete ? (
          <View style={styles.row}>
            <Text style={[styles.meta, styles.grow]}>Delete the offline map?</Text>
            <Button
              label="Delete"
              variant="danger"
              onPress={() => {
                setConfirmDelete(false);
                offline.remove();
              }}
            />
            <Button label="Keep" onPress={() => setConfirmDelete(false)} />
          </View>
        ) : (
          <View style={styles.row}>
            <Button label="Update" onPress={offline.download} style={styles.grow} />
            <Button label="Delete" variant="danger" onPress={() => setConfirmDelete(true)} style={styles.grow} />
          </View>
        )}
        {mobile}
      </>
    );
  } else if (state.status === "downloading" || state.status === "waiting") {
    const total = state.manifest.bytes;
    const pct = total > 0 ? Math.min(100, Math.round((state.doneBytes / total) * 100)) : 0;
    body = (
      <>
        <Text style={styles.name}>
          {state.status === "downloading"
            ? "Downloading…"
            : state.reason === "wifi"
              ? "Waiting for Wi-Fi"
              : "No signal: carries on when it's back"}
        </Text>
        <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.meta}>
          {sizeText(state.doneBytes)} of {sizeText(total)} ({pct}%)
        </Text>
        {state.status === "waiting" && state.reason === "wifi" && (
          <Text style={styles.meta}>Or allow mobile data below.</Text>
        )}
        <Button label="Cancel download" onPress={offline.cancel} />
        {mobile}
      </>
    );
  } else {
    body = (
      <>
        <Text style={styles.meta}>
          The map for {region.name}, kept on this phone, so it still draws in tunnels, estates and dead spots.
          Turn-by-turn carries on without signal anyway; this keeps the map under it.
        </Text>
        {state.error && <Text style={styles.warn}>{state.error}</Text>}
        {state.offer ? (
          <Button
            label={`Download (${sizeText(state.offer.bytes)})`}
            variant="primary"
            onPress={offline.download}
          />
        ) : state.checking ? (
          <Text style={styles.meta}>Checking the size…</Text>
        ) : (
          API_URL && <Button label="Check again" onPress={check} />
        )}
        <Text style={styles.meta}>{offline.allowMobile ? "Will use mobile data if there's no Wi-Fi." : "Downloads on Wi-Fi only."}</Text>
        {mobile}
      </>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Map for offline use</Text>
      {body}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 10 },
  label: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  name: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  warn: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: colors.amber },
});
