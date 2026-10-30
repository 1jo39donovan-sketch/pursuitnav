import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { API_URL, DEMO_MODE } from "../../config";

import { BoroughPicker } from "../../components/BoroughPicker";
import { Button } from "../../components/Button";
import { looksOffered, MAP_LOOK_NAMES, type MapLook } from "../../components/mapLooks";
import { OfflineMapSection } from "../../components/OfflineMapSection";
import { FavouritesSection } from "../../components/FavouritesSection";
import { TeamSection } from "../../components/TeamSection";
import { VoiceSettings } from "../../components/VoiceSettings";
import { timingsText, useRouteTimings } from "../../navigation/timings";
import { voiceSettings } from "../../navigation/speaker";
import { useFavourites } from "../../search/favourites";
import { store } from "../../storage/store";
import { useTeam } from "../../team/TeamProvider";
import { setRecording, useRecorder } from "../../fieldtest/instance";
import { serverLearns } from "../../learning/queue";
import { useLog } from "../../log/LogProvider";
import { useSearch } from "../../search/SearchProvider";
import { useSession } from "../../session/SessionProvider";
import { currentInstallId, newInstallId } from "../../usage/usage";
import { APPEARANCES, colors, fonts, type Appearance } from "../../theme";
import { bcuFor } from "../../search/boroughGroups";
import { SERVICES, VEHICLES, vehiclesFor } from "../../vehicles";
import { useTextStyles, useColors } from "../../textSize";

// Once a shift is set up, the app opens on Search: the job is usually to type
// an address straight away. Only on the first screen shown after launch.
let openedThisLaunch = false;

/** The browser version is for testing (the store app is the real one): testing tools start open. */
const TESTING_FIRST = Platform.OS === "web";

type SectionId = "shift" | "favourites" | "team" | "map" | "offline" | "saved" | "testing" | "privacy";

/** A heading with a one-line summary that opens to show its settings, so Session isn't one long page. */
function Section({
  id,
  title,
  summary,
  open,
  toggle,
  children,
}: {
  id: SectionId;
  title: string;
  summary: string;
  open: Set<SectionId>;
  toggle: (id: SectionId) => void;
  children: React.ReactNode;
}) {
  const styles = useTextStyles(baseStyles);
  const isOpen = open.has(id);
  return (
    <View style={[styles.section, isOpen && styles.sectionOpen]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${title}: ${summary}`}
        onPress={() => toggle(id)}
        style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.areaText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {/* Two lines: one cut "Police · Car · DEMO1 · Central South · blue…" (30 Oct). */}
          <Text style={styles.logMeta} numberOfLines={isOpen ? 3 : 2}>
            {summary}
          </Text>
        </View>
        <Text style={styles.chevron}>{isOpen ? "▾" : "▸"}</Text>
      </Pressable>
      {isOpen && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

/** Dark or light screens (the map has its own Day and Night). */
const APPEARANCE_NAMES: Record<Appearance, string> = {
  system: "◐ Match phone",
  dark: "Dark screens",
  light: "Light screens",
};

const MAP_CHOICE_NAMES = { auto: "Map matches screens", night: "☾ Night map", day: "☀ Day map" } as const;

const LOOK_HINTS: Record<MapLook, string> = {
  standard: "The everyday map.",
  clear: "High contrast: wider, brighter roads and bold names, for reading on the move.",
  plain: "Just the streets: no shop and business icons.",
  os: "Ordnance Survey's road map. Needs signal; very close in, it shows larger rather than sharper.",
};

export default function SessionScreen() {
  const palette = useColors();
  const styles = useTextStyles(baseStyles);
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
    service,
    setService,
    voice,
    setVoice,
    showPursuit,
    setShowPursuit,
    mapChoice,
    mapLook,
    setMapLook,
    largeText,
    setLargeText,
    setMapTheme,
    appearance,
    setAppearance,
    roads,
    setRoads,
    learning,
    setLearning,
  } = useSession();
  // Offered only once the server takes it (switched on after the privacy steps).
  const [canLearn, setCanLearn] = useState(false);
  useEffect(() => {
    void serverLearns().then(setCanLearn);
  }, []);
  useEffect(() => {
    if (openedThisLaunch) return;
    openedThisLaunch = true;
    if (callsign && boroughs.length > 0) router.navigate("/search");
    // Only on launch: later edits to the session shouldn't jump screens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { savedPlaces, deletePlace, places } = useSearch();
  const team = useTeam();
  const favourites = useFavourites();
  // Which sections are open, kept for next time. At first: start of shift until it's
  // filled in, the team while in one, and testing in the browser version.
  // The voice and speed live outside the session: re-read for the summary when changed.
  const [, setVoiceTick] = useState(0);
  const [open, setOpen] = useState<Set<SectionId>>(() => {
    try {
      const kept = store.getSetting("sessionOpen");
      if (kept) return new Set(JSON.parse(kept) as SectionId[]);
    } catch {
      // Start afresh.
    }
    const first: SectionId[] = [];
    if (!callsign || boroughs.length === 0) first.push("shift");
    if (team.code) first.push("team");
    if (TESTING_FIRST) first.push("testing");
    return new Set(first);
  });
  const toggle = (id: SectionId) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
    store.setSetting("sessionOpen", JSON.stringify([...next]));
  };
  const logCount = useLog().entries.length;
  const recording = useRecorder();
  // The area being worked, for the stations row: a BCU for police (and
  // installs from before the service choice), else the first borough.
  const police = service === "police" || service === null;
  const bcu = useMemo(() => bcuFor(boroughs), [boroughs]);
  const areaCode = police ? bcu?.code : boroughs[0];
  const areaName = police ? (bcu?.name ?? "BCUs") : (boroughs[0] ?? "Your area");
  const areaWhat = police
    ? "Custody · stations · A&E"
    : service === "ambulance"
      ? "Ambulance stations · A&E"
      : service === "fire"
        ? "Fire stations · A&E"
        : "Stations · A&E";

  const serviceName = SERVICES.find((sv) => sv.id === service)?.label;
  const vehicleName = VEHICLES.find((v) => v.id === vehicle)?.label;
  const shiftSummary = [
    serviceName ?? "No service",
    vehicleName,
    callsign || "No callsign",
    boroughs.length === 0
      ? "No area"
      : (police && bcu?.name) || `${boroughs[0]}${boroughs.length > 1 ? ` +${boroughs.length - 1}` : ""}`,
    policeRoutes ? "blue light on" : "blue light off",
  ]
    .filter(Boolean)
    .join(" · ");
  const others = team.members.filter((m) => !m.me).length;
  const teamSummary = !team.code
    ? "Off · see colleagues on the map"
    : team.status === "live"
      ? `Live · ${others === 0 ? "nobody else yet" : `${others} other${others === 1 ? "" : "s"}`}${team.sharing.share ? "" : " · you're hidden"}`
      : team.status === "offline"
        ? "In a team · no signal"
        : team.status === "ended" || team.status === "notfound"
          ? "In a team · check the code"
          : "In a team · connecting";
  const { voiceName, rate: voiceRate } = voiceSettings();
  const mapSummary = [
    appearance === "system" ? "Screens match phone" : appearance === "dark" ? "Dark screens" : "Light screens",
    mapChoice === "auto" ? null : mapChoice === "night" ? "night map" : "day map",
    MAP_LOOK_NAMES[mapLook],
    voice ? `voice: ${voiceName ?? "best on phone"}${voiceRate === "faster" ? ", faster" : ""}` : "voice off",
    largeText ? "larger text" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const timings = useRouteTimings();
  const testingSummary = [
    DEMO_MODE ? "Demo version" : demoDrive ? "Demo drive on" : "Demo drive off",
    recording.enabled ? "recording trips" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const demoToggle = (
    <View style={styles.toggleRow}>
      <View style={styles.placeText}>
        <Text style={styles.placeName} nativeID="demo-drive-label">
          Demo drive
        </Text>
        <Text style={styles.placeMeta}>
          Simulates a drive from Holloway Road to Whitechapel, so you can try routes, navigation and pursuit mode away
          from London. Your real GPS is ignored while it’s on.
        </Text>
      </View>
      <Switch
        accessibilityLabelledBy="demo-drive-label"
        value={demoDrive}
        onValueChange={setDemoDrive}
        trackColor={{ false: palette.line, true: palette.amber }}
      />
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* The search log lives here, one tap away, rather than taking a tab. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Search log, ${logCount} entries`}
        onPress={() => router.push("/log")}
        style={({ pressed }) => [styles.logRow, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.logText}>Search log</Text>
        <Text style={styles.logMeta}>
          {logCount === 0 ? "empty" : `${logCount} entr${logCount === 1 ? "y" : "ies"}`} ›
        </Text>
      </Pressable>

      <Section id="shift" title="Start of shift" summary={shiftSummary} open={open} toggle={toggle}>
        <View style={styles.intro}>
          <Text style={styles.hint}>
            Your service and vehicle, then the area you’re working. Address searches show matches in it first, so you
            get the right Church Street first time. All are kept for next time.
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Service</Text>
          <View style={styles.chips}>
            {SERVICES.map((sv) => {
              const on = service === sv.id;
              return (
                <Pressable
                  key={sv.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setService(sv.id)}
                  style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{sv.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Vehicle</Text>
          <Text style={styles.placeMeta}>Routes avoid low bridges and weight limits it can’t take.</Text>
          <View style={styles.chips}>
            {VEHICLES.filter((v) => vehiclesFor(service).includes(v.id)).map((v) => {
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
          <Text style={styles.label} nativeID="callsign-label">
            Callsign
          </Text>
          <TextInput
            accessibilityLabelledBy="callsign-label"
            value={callsign}
            onChangeText={setCallsign}
            placeholder="e.g. NI-31"
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <BoroughPicker />

        {/* The area being worked: stations, A&Es (and custody, for police), one tap from a route. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${areaName}: ${areaWhat}`}
          onPress={() =>
            router.push({
              pathname: "/area",
              params: areaCode ? { code: areaCode } : {},
            })
          }
          style={({ pressed }) => [styles.logRow, pressed && { opacity: 0.7 }]}
        >
          {/* Name above what's in it, so a long BCU name doesn't squeeze either on a narrow phone. */}
          <View style={styles.areaText}>
            <Text style={styles.logText} numberOfLines={1}>
              {areaName} {police && bcu && <Text style={styles.logMeta}>{bcu.code}</Text>}
            </Text>
            <Text style={styles.logMeta} numberOfLines={1}>
              {areaWhat}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

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
          <View style={styles.toggleRow}>
            <Text style={[styles.label, styles.placeText]} nativeID="bluelight-label">
              Blue-light routes
            </Text>
            <Switch
              accessibilityLabelledBy="bluelight-label"
              value={policeRoutes}
              onValueChange={setPoliceRoutes}
              trackColor={{ false: palette.line, true: palette.amber }}
            />
          </View>
          <Text style={styles.placeMeta}>
            {policeRoutes
              ? "Shown beside the standard route when meaningfully faster. They use bus lanes, bus gates and bus-only roads and ignore turn restrictions (never the wrong way down a one-way street), and list every restriction used. Only for police, fire and ambulance drivers using the emergency exemptions: you choose each time."
              : "Off: standard, fully legal routes only."}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/search")}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>Go to search</Text>
        </Pressable>
      </Section>

      <Section
        id="favourites"
        title="Favourites"
        summary={favourites.length ? `${favourites.length} saved: tap one to route there` : "None yet: star a place in Search"}
        open={open}
        toggle={toggle}
      >
        <FavouritesSection />
      </Section>

      <Section id="team" title="Team" summary={teamSummary} open={open} toggle={toggle}>
        <TeamSection />
      </Section>

      <Section id="map" title="Map and voice" summary={mapSummary} open={open} toggle={toggle}>
        <View style={styles.field}>
          <Text style={styles.label}>Map, voice and tabs</Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.placeName, styles.placeText]} nativeID="voice-label">
              Spoken directions
            </Text>
            <Switch
              accessibilityLabelledBy="voice-label"
              value={voice}
              onValueChange={setVoice}
              trackColor={{ false: palette.line, true: palette.amber }}
            />
          </View>
          {voice && <VoiceSettings onChange={() => setVoiceTick((n) => n + 1)} />}
          <View style={styles.toggleRow}>
            <Text style={[styles.placeName, styles.placeText]} nativeID="pursuit-label">
              Pursuit tab
            </Text>
            <Switch
              accessibilityLabelledBy="pursuit-label"
              value={showPursuit}
              onValueChange={setShowPursuit}
              trackColor={{ false: palette.line, true: palette.amber }}
            />
          </View>
          <View style={styles.chips} accessibilityLabel="Screens">
            {APPEARANCES.map((a) => {
              const on = appearance === a;
              return (
                <Pressable
                  key={a}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setAppearance(a)}
                  style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{APPEARANCE_NAMES[a]}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chips}>
            {(["auto", "night", "day"] as const).map((t) => {
              const on = mapChoice === t;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setMapTheme(t)}
                  style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{MAP_CHOICE_NAMES[t]}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chips} accessibilityLabel="Map style">
            {looksOffered().map((l) => {
              const on = mapLook === l;
              return (
                <Pressable
                  key={l}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityHint={LOOK_HINTS[l]}
                  onPress={() => setMapLook(l)}
                  style={[styles.chip, styles.vehicleChip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{MAP_LOOK_NAMES[l]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.placeMeta}>{LOOK_HINTS[mapLook]}</Text>
          <View style={styles.toggleRow}>
            <Text style={[styles.placeName, styles.placeText]} nativeID="large-text-label">
              Larger text
            </Text>
            <Switch
              accessibilityLabelledBy="large-text-label"
              value={largeText}
              onValueChange={setLargeText}
              trackColor={{ false: palette.line, true: palette.amber }}
            />
          </View>
        </View>
      </Section>

      <Section
        id="offline"
        title="Offline map"
        summary="For no signal: download on Wi-Fi"
        open={open}
        toggle={toggle}
      >
        <OfflineMapSection />
      </Section>

      {savedPlaces.length > 0 && (
        <Section
          id="saved"
          title="Saved blocks and estates"
          summary={`${savedPlaces.length} saved on this phone`}
          open={open}
          toggle={toggle}
        >
          <View style={styles.field}>
            {savedPlaces.map((p) => (
              <View key={p.id} style={styles.placeRow}>
                <View style={styles.placeText}>
                  <Text style={styles.placeName}>{p.name}</Text>
                  <Text style={styles.placeMeta}>
                    {p.borough} · off {p.road}
                  </Text>
                </View>
                <Button label="Remove" variant="danger" onPress={() => deletePlace(p.id)} />
              </View>
            ))}
          </View>
        </Section>
      )}

      <Section id="testing" title="Testing" summary={testingSummary} open={open} toggle={toggle}>
        {!DEMO_MODE && demoToggle}
        <View style={styles.field}>
          <View style={styles.toggleRow}>
            <Text style={[styles.label, styles.placeText]} nativeID="fieldtest-label">
              Field-test recording
            </Text>
            <Switch
              accessibilityLabelledBy="fieldtest-label"
              value={recording.enabled}
              onValueChange={setRecording}
              trackColor={{ false: palette.line, true: palette.amber }}
            />
          </View>
          <Text style={styles.placeMeta}>
            Records your trips on this phone only, for testing. Nothing is sent anywhere. Export or delete from the Log.
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Last route timings</Text>
          <Text style={styles.placeMeta}>{timingsText(timings) ?? "Plan a route to see how long each step takes."}</Text>
        </View>
      </Section>

      <Section
        id="privacy"
        title="Privacy and data"
        summary="What’s sent, usage counts, terms"
        open={open}
        toggle={toggle}
      >
        {(canLearn || learning) && (
          <View style={styles.field}>
            <View style={styles.toggleRow}>
              <Text style={[styles.label, styles.placeText]} nativeID="learning-label">
                Help improve journey times
              </Text>
              <Switch
                accessibilityLabelledBy="learning-label"
                value={learning}
                onValueChange={setLearning}
                trackColor={{ false: palette.line, true: palette.amber }}
              />
            </View>
            <Text style={styles.placeMeta}>
              Off unless you turn it on. While you navigate, your phone times each road it drives along and later sends
              only “this road took this long”: never your position, your route, where you started or stopped (the first
              and last 500 m are left out), your callsign or anything about you. Times wait on your phone for at least 6
              hours and go mixed with other drives. Turning this off deletes anything not yet sent.
            </Text>
          </View>
        )}
        <UsageNote />

        {API_URL !== "" && (
          <View style={styles.linkRow}>
            <Button label="Privacy" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
            <Button label="Help and support" onPress={() => Linking.openURL(`${API_URL}/support`)} />
            <Button label="Terms" onPress={() => Linking.openURL(`${API_URL}/terms`)} />
          </View>
        )}

        <Text style={styles.attribution}>
          {places.status === "ready"
            ? `Places: ${places.count.toLocaleString("en-GB")} shops, cafés, schools, parks and more, from ${places.builtOn}.`
            : "Places (shops, cafés, schools, parks…) download from the BlueRoute server when it’s connected."}
        </Text>
        <Text style={styles.attribution}>
          Search data: contains OS data © Crown copyright and database right; Royal Mail data © Royal Mail copyright and
          database right; National Statistics data © Crown copyright and database right. Map data © OpenStreetMap
          contributors (places and map).
        </Text>
      </Section>
    </ScrollView>
  );
}

/** Exactly what usage counting sends, and a way to start again as a new install. */
function UsageNote() {
  const styles = useTextStyles(baseStyles);
  const [id, setId] = useState(() => currentInstallId());
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Usage data</Text>
      <Text style={styles.placeMeta}>
        To see how many crews use BlueRoute, each request to the server carries a random install ID made on this phone
        and the app version. The server counts, per day: installs, routes planned, navigation and pursuit sessions, and
        requests that timed out or failed. Nothing else: no positions, addresses, searches or callsign. It keeps only a
        scrambled form of the ID, scrambled differently each day and each week so days can&apos;t be linked, and deletes
        it once the day (or week) is over, keeping just the totals.
      </Text>
      <View style={styles.toggleRow}>
        <Text style={[styles.placeMeta, styles.placeText]} selectable>
          Install ID: {id.slice(0, 8)}…
        </Text>
        <Button label="Reset ID" onPress={() => setId(newInstallId())} />
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  section: {
    borderRadius: 12,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
  },
  sectionOpen: { backgroundColor: colors.bg },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: colors.fg,
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
  },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 16, gap: 20 },
  intro: { gap: 6 },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
  },
  logText: {
    color: colors.fg,
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
  },
  logMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 15 },
  areaText: { flex: 1, minWidth: 0, paddingVertical: 8 },
  chevron: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 24,
    paddingLeft: 8,
  },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26 },
  hint: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
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
  chip: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 14 },
  chipTextOn: { color: "#ffffff", fontFamily: fonts.bodyMedium },
  vehicleChip: { paddingHorizontal: 16, paddingVertical: 12 },
  button: {
    backgroundColor: colors.amber,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
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
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  placeName: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  placeMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  attribution: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
});
