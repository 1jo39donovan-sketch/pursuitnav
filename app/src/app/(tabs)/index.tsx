import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CHIP_ORDER } from "../../search/boroughs";
import { useSearch } from "../../search/SearchProvider";
import { useSession } from "../../session/SessionProvider";
import { colors, fonts } from "../../theme";

export default function SessionScreen() {
  const { callsign, setCallsign, boroughs, toggleBorough } = useSession();
  const { savedPlaces, deletePlace } = useSearch();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title}>Start of shift</Text>
        <Text style={styles.hint}>
          Pick the boroughs you’re working. Address searches show matches in them first, so you get the right Church
          Street first time. Both are kept for next time.
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label} nativeID="callsign-label">
          Callsign
        </Text>
        <TextInput
          accessibilityLabelledBy="callsign-label"
          value={callsign}
          onChangeText={setCallsign}
          placeholder="e.g. NI-31"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Operating area · {boroughs.length} selected</Text>
        <View style={styles.chips}>
          {CHIP_ORDER.map((b) => {
            const on = boroughs.includes(b);
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
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate("/search")}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.buttonText}>Go to search</Text>
      </Pressable>

      {savedPlaces.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Your saved blocks and estates</Text>
          {savedPlaces.map((p) => (
            <View key={p.id} style={styles.placeRow}>
              <View style={styles.placeText}>
                <Text style={styles.placeName}>{p.name}</Text>
                <Text style={styles.placeMeta}>
                  {p.borough} · off {p.road}
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => deletePlace(p.id)} hitSlop={8}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.attribution}>
        Search data: contains OS data © Crown copyright and database right; Royal Mail data © Royal Mail copyright and
        database right; National Statistics data © Crown copyright and database right. Map data © OpenStreetMap
        contributors.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 20 },
  intro: { gap: 6 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  field: { gap: 10 },
  label: {
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
    fontFamily: fonts.mono,
    fontSize: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 14 },
  chipTextOn: { color: "#ffffff", fontFamily: fonts.bodyMedium },
  button: { backgroundColor: colors.amber, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: {
    color: "#1a1200",
    fontFamily: fonts.displayBold,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeText: { flex: 1, minWidth: 0 },
  placeName: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  placeMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  remove: { color: colors.warn, fontFamily: fonts.bodyMedium, fontSize: 14 },
  attribution: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, opacity: 0.8 },
});
