import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { API_URL, DEMO_MODE } from "../../config";

import { BoroughPicker } from "../../components/BoroughPicker";
import { useSearch } from "../../search/SearchProvider";
import { useSession } from "../../session/SessionProvider";
import { colors, fonts } from "../../theme";
import { VEHICLES } from "../../vehicles";

// Once a shift is set up, the app opens on Search: the job is usually to type
// an address straight away. Only on the first screen shown after launch.
let openedThisLaunch = false;

export default function SessionScreen() {
  const {
    callsign,
    setCallsign,
    boroughs,
    demoDrive,
    setDemoDrive,
    policeRoutes,
    setPoliceRoutes,
    vehicle,
    setVehicle,
    voice,
    setVoice,
    mapTheme,
    setMapTheme,
    roads,
    setRoads,
  } = useSession();
  useEffect(() => {
    if (openedThisLaunch) return;
    openedThisLaunch = true;
    if (callsign && boroughs.length > 0) router.navigate("/search");
    // Only on launch: later edits to the session shouldn't jump screens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [confirmingPolice, setConfirmingPolice] = useState(false);
  const { savedPlaces, deletePlace, places } = useSearch();

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

      <BoroughPicker />

      <View style={styles.field}>
        <Text style={styles.label}>Vehicle</Text>
        <Text style={styles.placeMeta}>Routes avoid low bridges and weight limits it can’t take.</Text>
        <View style={styles.chips}>
          {VEHICLES.map((v) => {
            const on = vehicle === v.id;
            return (
              <Pressable
                key={v.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityHint={v.detail}
                onPress={() => setVehicle(v.id)}
                style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{v.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Roads</Text>
        <View style={styles.chips}>
          {(
            [
              ["main", "Prefer main roads"],
              ["any", "Any roads"],
            ] as const
          ).map(([value, label]) => {
            const on = roads === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setRoads(value)}
                style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.placeMeta}>
          {roads === "main"
            ? "Main roads usually have room to overtake and bus lanes to use; side streets have humps and parked cars."
            : "Takes the shortest sensible way, side streets included, unless a main road is much quicker."}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Map and voice</Text>
        <View style={styles.toggleRow}>
          <Text style={[styles.placeName, styles.placeText]} nativeID="voice-label">
            Spoken directions
          </Text>
          <Switch
            accessibilityLabelledBy="voice-label"
            value={voice}
            onValueChange={setVoice}
            trackColor={{ false: colors.line, true: colors.amber }}
          />
        </View>
        <View style={styles.chips}>
          {(["night", "day"] as const).map((t) => {
            const on = mapTheme === t;
            return (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setMapTheme(t)}
                style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {t === "night" ? "☾ Night map" : "☀ Day map"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Blue-light routes · {policeRoutes ? "on" : "off"}</Text>
        {policeRoutes ? (
          <View style={styles.toggleRow}>
            <Text style={[styles.placeMeta, styles.placeText]}>
              Shown beside the standard route when meaningfully faster, with every bus lane, bus gate and turn
              restriction it uses listed.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setPoliceRoutes(false)} hitSlop={8}>
              <Text style={styles.remove}>Turn off</Text>
            </Pressable>
          </View>
        ) : confirmingPolice ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>
              Blue-light routes use bus lanes, bus gates and bus-only roads, and ignore turn restrictions such as no
              right turn. They never go the wrong way down a one-way street. Only a police, fire or ambulance driver
              using the emergency exemptions may follow them; anyone else would be breaking the law.
            </Text>
            <Text style={styles.confirmText}>
              I drive for the police, fire or ambulance service, and I’ll only follow a blue-light route when the
              exemptions apply and it’s safe to.
            </Text>
            <View style={styles.confirmButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPoliceRoutes(true);
                  setConfirmingPolice(false);
                }}
                style={[styles.smallButton, { backgroundColor: colors.amber }]}
              >
                <Text style={styles.smallButtonText}>I confirm</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingPolice(false)}
                style={[styles.smallButton, styles.smallButtonOutline]}
              >
                <Text style={[styles.smallButtonText, { color: colors.fg }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.toggleRow}>
            <Text style={[styles.placeMeta, styles.placeText]}>
              Off: you’ll get standard, fully legal routes only.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setConfirmingPolice(true)} hitSlop={8}>
              <Text style={[styles.remove, { color: colors.amber }]}>Turn on</Text>
            </Pressable>
          </View>
        )}
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

      {!DEMO_MODE && (
        <View style={styles.toggleRow}>
          <View style={styles.placeText}>
            <Text style={styles.placeName} nativeID="demo-drive-label">
              Demo drive
            </Text>
            <Text style={styles.placeMeta}>
              Simulates a drive from Holloway Road to Whitechapel, so you can try routes, navigation and pursuit mode
              away from London. Your real GPS is ignored while it’s on.
            </Text>
          </View>
          <Switch
            accessibilityLabelledBy="demo-drive-label"
            value={demoDrive}
            onValueChange={setDemoDrive}
            trackColor={{ false: colors.line, true: colors.amber }}
          />
        </View>
      )}

      {API_URL !== "" && (
        <View style={styles.confirmButtons}>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/privacy`)} hitSlop={8}>
            <Text style={styles.link}>Privacy</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/support`)} hitSlop={8}>
            <Text style={styles.link}>Help and support</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.attribution}>
        {places.status === "ready"
          ? `Places: ${places.count.toLocaleString("en-GB")} shops, cafés, schools, parks and more, from ${places.builtOn}.`
          : "Places (shops, cafés, schools, parks…) download from the Blue Route server when it’s connected."}
      </Text>
      <Text style={styles.attribution}>
        Search data: contains OS data © Crown copyright and database right; Royal Mail data © Royal Mail copyright and
        database right; National Statistics data © Crown copyright and database right. Map data © OpenStreetMap
        contributors (places and map).
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
  vehicleChip: { paddingHorizontal: 16, paddingVertical: 12 },
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
  confirm: { gap: 10, borderColor: colors.amber, borderWidth: 1, borderRadius: 10, padding: 12 },
  confirmText: { color: colors.fg, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  confirmButtons: { flexDirection: "row", gap: 10 },
  smallButton: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  smallButtonOutline: { borderColor: colors.line, borderWidth: 1 },
  smallButtonText: { color: "#1a1200", fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.5 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  placeName: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  placeMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  remove: { color: colors.warn, fontFamily: fonts.bodyMedium, fontSize: 14 },
  link: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 14, textDecorationLine: "underline" },
  attribution: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, opacity: 0.8 },
});
