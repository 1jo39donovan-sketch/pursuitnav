import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { Road } from "../search/engine";
import { useSearch } from "../search/SearchProvider";
import { normalise } from "../search/text";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

/** Lets an officer add a block or estate and the road it's on. Kept on the phone. */
export function AddPlaceForm({ initialName, onSaved }: { initialName: string; onSaved: (name: string) => void }) {
  const { data, addPlace } = useSearch();
  const { boroughs } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [roadQuery, setRoadQuery] = useState("");
  const [road, setRoad] = useState<Road | null>(null);

  const roads = useMemo(
    () => (data.status === "ready" ? data.index.roadsIn(new Set(boroughs)) : []),
    [data, boroughs],
  );
  const matches = useMemo(() => {
    const q = normalise(roadQuery);
    if (q.length < 2 || road) return [];
    return roads.filter((r) => normalise(r.name).includes(q)).slice(0, 8);
  }, [roads, roadQuery, road]);

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setName(initialName);
          setOpen(true);
        }}
        style={styles.openButton}
      >
        <Text style={styles.openText}>+ Add a block or estate to your list</Text>
      </Pressable>
    );
  }

  const save = () => {
    if (!name.trim() || !road) return;
    addPlace({ name: name.trim(), road: road.name, borough: road.borough, lat: road.lat, lng: road.lng });
    setOpen(false);
    setRoad(null);
    setRoadQuery("");
    onSaved(name.trim());
  };

  return (
    <View style={styles.form}>
      <Text style={styles.title}>Add a block or estate</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name, e.g. Harvist Estate"
        placeholderTextColor={colors.muted}
        style={styles.input}
        accessibilityLabel="Block or estate name"
      />
      <TextInput
        value={road ? `${road.name} — ${road.borough}` : roadQuery}
        onChangeText={(t) => {
          setRoad(null);
          setRoadQuery(t);
        }}
        placeholder="Main road it's on"
        placeholderTextColor={colors.muted}
        style={styles.input}
        accessibilityLabel="Road it's on"
      />
      {matches.map((r) => (
        <Pressable key={`${r.name}|${r.borough}`} onPress={() => setRoad(r)} style={styles.match}>
          <Text style={styles.matchText}>
            {r.name} <Text style={styles.matchBorough}>— {r.borough}</Text>
          </Text>
        </Pressable>
      ))}
      {boroughs.length === 0 && <Text style={styles.note}>Pick your boroughs on the Session tab first.</Text>}
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !name.trim() || !road }}
          onPress={save}
          style={[styles.save, (!name.trim() || !road) && { opacity: 0.5 }]}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>Saved places stay on this phone and show up in searches.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: { paddingVertical: 14 },
  openText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
  form: { borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 14, gap: 10, marginTop: 8 },
  title: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  match: { paddingVertical: 8 },
  matchText: { color: colors.fg, fontFamily: fonts.body, fontSize: 15 },
  matchBorough: { color: colors.muted },
  buttons: { flexDirection: "row", gap: 10 },
  save: { backgroundColor: colors.amber, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  saveText: { color: "#1a1200", fontFamily: fonts.displayBold, fontSize: 16, textTransform: "uppercase" },
  cancel: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 16, textTransform: "uppercase" },
  note: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
});
