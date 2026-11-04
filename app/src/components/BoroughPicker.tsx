// The operating area on Session: a one-line summary once chosen, opening
// to the areas, region by region (London's boroughs, Kent's districts).
// For police, London's are grouped by Met BCU (Basic Command Unit) and
// Kent's by North, East and West; tapping a group selects (or clears) all
// of it. Other services see one A–Z list per region. Each area can be set alone.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { boroughAt } from "../area/area";
import { useLocation } from "../location/LocationProvider";
import { BIG_AREAS, BOROUGH_GROUPS, KENT_GROUPS, areaSummary, type BoroughGroup } from "../search/boroughGroups";
import { AREA_REGIONS, BOROUGHS, type Borough } from "../search/boroughs";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";
import { Button } from "./Button";
import { useThemed } from "../textSize";

const GROUPS: Record<"london" | "kent", BoroughGroup[]> = { london: BOROUGH_GROUPS, kent: KENT_GROUPS };

export function BoroughPicker() {
  const styles = useThemed(baseStyles);
  const { boroughs, toggleBorough, setBoroughs, service } = useSession();
  // BCUs are the Met's; other services see plain lists.
  const byGroup = service === "police" || service === null;
  const { fix } = useLocation();
  const [open, setOpen] = useState(boroughs.length === 0);
  const chosen = new Set(boroughs);
  const here = fix ? boroughAt(fix.lat, fix.lng) : null;
  // Keep the order of the full list whatever order they were tapped in.
  const inOrder = BOROUGHS.filter((b) => chosen.has(b));

  const setGroup = (group: Borough[], on: boolean) =>
    setBoroughs(on ? [...new Set([...boroughs, ...group])] : boroughs.filter((b) => !group.includes(b)));

  const chip = (b: Borough) => {
    const on = chosen.has(b);
    return (
      <Pressable
        key={b}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        onPress={() => toggleBorough(b)}
        style={[styles.chip, on && styles.chipOn]}
      >
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{b}</Text>
      </Pressable>
    );
  };

  const group = (g: BoroughGroup) => {
    const count = g.boroughs.filter((b) => chosen.has(b)).length;
    const all = count === g.boroughs.length;
    return (
      <View key={g.name} style={[styles.group, count > 0 && styles.groupOn]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: all ? true : count ? "mixed" : false }}
          accessibilityLabel={`${g.name}: ${g.boroughs.join(", ")}`}
          onPress={() => setGroup(g.boroughs, !all)}
          style={styles.groupHead}
        >
          <View style={[styles.box, all && styles.boxOn, count > 0 && !all && styles.boxSome]}>
            <Text style={styles.tick}>{all ? "✓" : count ? "–" : ""}</Text>
          </View>
          {g.code !== "" && <Text style={styles.code}>{g.code}</Text>}
          <Text style={styles.groupName}>{g.name}</Text>
          {g.boroughs.length > 1 && (
            <Text style={styles.count}>
              {count}/{g.boroughs.length}
            </Text>
          )}
        </Pressable>
        {g.boroughs.length > 1 && <View style={[styles.chips, styles.indent]}>{g.boroughs.map(chip)}</View>}
      </View>
    );
  };

  return (
    <View style={styles.field}>
      <View style={styles.headRow}>
        <Text style={styles.label}>Operating area</Text>
        <Button label={open ? "Done" : "Change"} variant={open ? "primary" : "secondary"} onPress={() => setOpen(!open)} />
      </View>
      <Text style={[styles.summary, !inOrder.length && styles.summaryEmpty]}>{areaSummary(inOrder)}</Text>

      {open && (
        <View style={styles.list}>
          {(here && !chosen.has(here)) || inOrder.length > 0 ? (
            <View style={styles.quickRow}>
              {here && !chosen.has(here) && <Button label={`+ Where I am (${here})`} onPress={() => toggleBorough(here)} />}
              {inOrder.length > 0 && <Button label="Clear all" variant="danger" onPress={() => setBoroughs([])} />}
            </View>
          ) : null}
          {AREA_REGIONS.map((r) => (
            <View key={r.id} style={styles.region}>
              <Text style={styles.regionName}>{r.name}</Text>
              <Text style={styles.subLabel}>Big areas (replace what’s picked)</Text>
              <View style={styles.quickRow}>
                <Button label={`All ${r.name}`} variant="primary" onPress={() => setBoroughs([...r.areas])} />
                {BIG_AREAS[r.id].map((a) => (
                  <Button key={a.name} label={a.name} onPress={() => setBoroughs(a.boroughs)} />
                ))}
              </View>
              <Text style={styles.subLabel}>
                {byGroup && r.id === "london" ? "Or by BCU and borough" : `Or by ${r.unit}`}
              </Text>
              {byGroup ? GROUPS[r.id].map(group) : <View style={styles.chips}>{r.areas.map(chip)}</View>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 8 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  summary: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 23 },
  summaryEmpty: { color: colors.amber, fontFamily: fonts.body, fontSize: 15 },
  list: { gap: 8, marginTop: 4 },
  subLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  group: { borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  groupOn: { borderColor: colors.blue },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  boxSome: { borderColor: colors.blue },
  tick: { color: "#ffffff", fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 17 },
  code: {
    color: colors.amber,
    fontFamily: fonts.mono,
    fontSize: 13,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  groupName: { flex: 1, color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 18 },
  count: { color: colors.muted, fontFamily: fonts.mono, fontSize: 13 },
  region: { gap: 8, marginTop: 8 },
  regionName: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  indent: { paddingLeft: 34 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 14 },
  chipTextOn: { color: "#ffffff", fontFamily: fonts.bodyMedium },
});
