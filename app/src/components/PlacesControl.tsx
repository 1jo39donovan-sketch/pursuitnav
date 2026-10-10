import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PlaceGroup } from "../search/places";
import { MARKER_GROUPS } from "../search/placeGroups";
import { colors, fonts } from "../theme";

interface Props {
  groups: PlaceGroup[];
  onChange: (groups: PlaceGroup[]) => void;
  /** Places shown on the map now, or null if place data isn't on the phone. */
  shownCount: number | null;
}

/** "Places" button on the map, opening a chooser of which kinds to mark. */
export function PlacesControl({ groups, onChange, shownCount }: Props) {
  const [open, setOpen] = useState(false);
  const on = new Set(groups);
  const toggle = (g: PlaceGroup) => onChange(on.has(g) ? groups.filter((x) => x !== g) : [...groups, g]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={[styles.button, groups.length > 0 && styles.buttonOn]}
      >
        <Text style={[styles.buttonText, groups.length > 0 && styles.buttonTextOn]}>
          Places
        </Text>
      </Pressable>
      {open && (
        <View style={styles.sheet}>
          {shownCount === null ? (
            <Text style={styles.note}>Place data hasn’t downloaded yet. It comes from the Blue Route server.</Text>
          ) : (
            <Text style={styles.note}>
              {groups.length ? `${shownCount.toLocaleString("en-GB")} shown in your boroughs` : "Pick what to show"}
            </Text>
          )}
          <View style={styles.chips}>
            {MARKER_GROUPS.map((g) => {
              const selected = on.has(g.key);
              return (
                <Pressable
                  key={g.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggle(g.key)}
                  style={[styles.chip, selected && { borderColor: g.color }]}
                >
                  <View style={[styles.dot, { backgroundColor: g.color, opacity: selected ? 1 : 0.35 }]} />
                  <Text style={[styles.chipText, !selected && { color: colors.muted }]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <Pressable onPress={() => onChange([])} style={styles.link}>
              <Text style={styles.linkText}>Hide all</Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={styles.link}>
              <Text style={styles.linkText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 12, left: 12, right: 64, alignItems: "flex-start", gap: 8 },
  button: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonOn: { borderColor: colors.amber },
  buttonText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 15, letterSpacing: 1, textTransform: "uppercase" },
  buttonTextOn: { color: colors.amber },
  sheet: {
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    alignSelf: "stretch",
  },
  note: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 13 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  link: { paddingVertical: 4 },
  linkText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
});
