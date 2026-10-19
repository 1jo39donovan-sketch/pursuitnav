// The operating area on Session: a one-line summary once chosen, opening
// to the boroughs grouped by Met command area. Tapping an area's name
// selects (or clears) all of its boroughs; each borough can be set alone.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { boroughAt } from "../area/area";
import { useLocation } from "../location/LocationProvider";
import { BOROUGH_GROUPS } from "../search/boroughGroups";
import { BOROUGHS, type Borough } from "../search/boroughs";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

export function BoroughPicker() {
  const { boroughs, toggleBorough, setBoroughs } = useSession();
  const { fix } = useLocation();
  const [open, setOpen] = useState(boroughs.length === 0);
  const chosen = new Set(boroughs);
  const here = fix ? boroughAt(fix.lat, fix.lng) : null;
  // Keep the A–Z order of the full list whatever order they were tapped in.
  const inOrder = BOROUGHS.filter((b) => chosen.has(b));

  const setGroup = (group: Borough[], on: boolean) =>
    setBoroughs(on ? [...new Set([...boroughs, ...group])] : boroughs.filter((b) => !group.includes(b)));

  return (
    <View style={styles.field}>
      <View style={styles.headRow}>
        <Text style={styles.label}>Operating area</Text>
        <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} hitSlop={10} style={styles.toggle}>
          <Text style={styles.toggleText}>{open ? "Done" : "Change"}</Text>
        </Pressable>
      </View>
      <Text style={[styles.summary, !inOrder.length && styles.summaryEmpty]}>
        {inOrder.length ? inOrder.join(" · ") : "None chosen: every search result shows as outside your area."}
      </Text>

      {open && (
        <View style={styles.list}>
          <View style={styles.quickRow}>
            {here && !chosen.has(here) && (
              <Pressable
                accessibilityRole="button"
                onPress={() => toggleBorough(here)}
                style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
              >
                <Text style={styles.quickText}>+ Where I am ({here})</Text>
              </Pressable>
            )}
            {inOrder.length > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setBoroughs([])}
                style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
              >
                <Text style={[styles.quickText, { color: colors.warn }]}>Clear all</Text>
              </Pressable>
            )}
          </View>

          {BOROUGH_GROUPS.map((g) => {
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
                  <Text style={styles.groupName}>{g.name}</Text>
                  {g.boroughs.length > 1 && (
                    <Text style={styles.count}>
                      {count}/{g.boroughs.length}
                    </Text>
                  )}
                </Pressable>
                {g.boroughs.length > 1 && (
                  <View style={styles.chips}>
                    {g.boroughs.map((b) => {
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
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  toggle: { paddingVertical: 4, paddingHorizontal: 8 },
  toggleText: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  summary: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 23 },
  summaryEmpty: { color: colors.amber, fontFamily: fonts.body, fontSize: 15 },
  list: { gap: 8, marginTop: 4 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quick: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  quickText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 14 },
  pressed: { opacity: 0.7 },
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
  groupName: { flex: 1, color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 18 },
  count: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 34 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 14 },
  chipTextOn: { color: "#ffffff", fontFamily: fonts.bodyMedium },
});
