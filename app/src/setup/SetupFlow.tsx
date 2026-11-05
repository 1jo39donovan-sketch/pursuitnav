// First launch, after the terms: one question per screen (service, where
// you work, vehicle, callsign, blue-light routes). Big targets, a Back on
// every screen, and a way out to the demo drive for anyone just looking.
// Answers go straight into the session, so Session shows and changes them.
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { boroughAt } from "../area/area";
import { DEMO_MODE } from "../config";
import { useLocation } from "../location/LocationProvider";
import { BIG_AREAS, areaSummary } from "../search/boroughGroups";
import { AREA_REGIONS, BOROUGHS, regionOf, type Borough, type RegionId } from "../search/boroughs";
import { useSession } from "../session/SessionProvider";
import { store } from "../storage/store";
import { colors, fonts } from "../theme";
import { useColors, useThemed } from "../textSize";
import { SERVICES, VEHICLES, vehiclesFor } from "../vehicles";
import { SETUP_DONE_KEY, needsSetup, nextStep, previousStep, stepLabel, type SetupStep } from "./steps";

export function SetupFlow() {
  const styles = useThemed(baseStyles);
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { fix } = useLocation();
  const [show, setShow] = useState(() =>
    !DEMO_MODE &&
    needsSetup({ done: store.getSetting(SETUP_DONE_KEY), service: session.service, areas: session.boroughs.length }),
  );
  const [step, setStep] = useState<SetupStep>("service");
  const here = fix ? boroughAt(fix.lat, fix.lng) : null;
  const [region, setRegion] = useState<RegionId>(() => (here ? regionOf(here).id : "london"));
  if (!show) return null;

  const finish = () => {
    store.setSetting(SETUP_DONE_KEY, new Date().toISOString().slice(0, 10));
    setShow(false);
  };
  const forward = () => {
    const next = nextStep(step);
    if (next) setStep(next);
    else finish();
  };
  const back = () => {
    const prev = previousStep(step);
    if (prev) setStep(prev);
  };
  const tryDemo = () => {
    session.setDemoDrive(true);
    finish();
  };

  const regionAreas = AREA_REGIONS.find((r) => r.id === region)!;
  const chosen = new Set(session.boroughs);
  const chosenHere = regionAreas.areas.filter((a) => chosen.has(a));
  const choose = (list: readonly Borough[]) => session.setBoroughs([...list]);

  const big = (label: string, onPress: () => void, opts: { on?: boolean; detail?: string } = {}) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: !!opts.on }}
      onPress={onPress}
      style={({ pressed }) => [styles.big, opts.on && styles.bigOn, pressed && styles.pressed]}
    >
      <Text style={[styles.bigText, opts.on && styles.bigTextOn]}>{label}</Text>
      {opts.detail ? <Text style={[styles.bigDetail, opts.on && styles.bigTextOn]}>{opts.detail}</Text> : null}
    </Pressable>
  );

  let title = "";
  let lead = "";
  let body: React.ReactNode = null;
  let canGoOn = true;
  let nextLabel = "Next";

  switch (step) {
    case "service":
      title = "Which service are you?";
      lead = "It decides the vehicles offered, and whether Pursuit is shown.";
      body = SERVICES.map((s) =>
        big(s.label, () => {
          session.setService(s.id);
          setStep("region");
        }, { on: session.service === s.id }),
      );
      canGoOn = session.service !== null;
      break;
    case "region":
      title = "Where do you work?";
      lead = "You can add more areas later on Session.";
      body = AREA_REGIONS.map((r) =>
        big(r.name, () => {
          setRegion(r.id);
          setStep("areas");
        }, {
          on: region === r.id && chosenHere.length > 0,
          detail: here && regionOf(here).id === r.id ? `You’re in ${here}` : `${r.areas.length} ${r.unit}s`,
        }),
      );
      canGoOn = false;
      break;
    case "areas":
      title = `Which parts of ${regionAreas.name}?`;
      lead = "Searches show matches in your area first.";
      body = (
        <>
          {here && regionOf(here).id === region && !chosen.has(here) && big(`Where I am: ${here}`, () => choose([here]))}
          {big(`All ${regionAreas.name}`, () => choose(regionAreas.areas), {
            on: chosenHere.length === regionAreas.areas.length,
          })}
          {BIG_AREAS[region].map((a) =>
            big(a.name, () => choose(a.boroughs), {
              on: a.boroughs.length === session.boroughs.length && a.boroughs.every((b) => chosen.has(b)),
            }),
          )}
          <Text style={styles.subLabel}>Or one by one</Text>
          <View style={styles.chips}>
            {regionAreas.areas.map((a) => {
              const on = chosen.has(a);
              return (
                <Pressable
                  key={a}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => session.toggleBorough(a)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{a}</Text>
                </Pressable>
              );
            })}
          </View>
          {session.boroughs.length > 0 && (
            <Text style={styles.summary}>Chosen: {areaSummary(BOROUGHS.filter((b) => chosen.has(b)))}</Text>
          )}
        </>
      );
      canGoOn = session.boroughs.length > 0;
      break;
    case "vehicle":
      title = "What are you driving?";
      lead = "Routes avoid low bridges, narrow roads and weight limits it can’t take.";
      body = VEHICLES.filter((v) => vehiclesFor(session.service).includes(v.id)).map((v) =>
        big(v.label, () => {
          session.setVehicle(v.id);
          setStep("callsign");
        }, { on: session.vehicle === v.id, detail: v.detail }),
      );
      break;
    case "callsign":
      title = "Your callsign";
      lead = "Optional. Shown at the top of the app; never sent anywhere.";
      body = (
        <TextInput
          accessibilityLabel="Callsign"
          value={session.callsign}
          onChangeText={session.setCallsign}
          placeholder="e.g. NI-31"
          placeholderTextColor={palette.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={forward}
          style={styles.input}
        />
      );
      nextLabel = session.callsign.trim() ? "Next" : "Skip";
      break;
    case "blueLight":
      title = "Blue-light routes";
      lead =
        "Beside every standard route, a quicker one through bus gates and turn restrictions, when it saves time. Each restriction it uses is listed, and you choose. Only for drivers entitled to use them, on an authorised call.";
      body = (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} nativeID="setup-blue-label">
            {session.policeRoutes ? "On" : "Off"}
          </Text>
          <Switch
            accessibilityLabelledBy="setup-blue-label"
            accessibilityLabel="Blue-light routes"
            value={session.policeRoutes}
            onValueChange={session.setPoliceRoutes}
            trackColor={{ false: palette.line, true: palette.amber }}
          />
        </View>
      );
      nextLabel = "Start";
      break;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        {previousStep(step) ? (
          <Pressable accessibilityRole="button" onPress={back} hitSlop={12} style={styles.backButton}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text style={styles.step}>{stepLabel(step)}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.lead}>{lead}</Text>
        <View style={styles.options}>{body}</View>
      </ScrollView>
      {step !== "service" && step !== "region" && step !== "vehicle" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoOn }}
          disabled={!canGoOn}
          onPress={forward}
          style={({ pressed }) => [styles.next, !canGoOn && styles.nextOff, pressed && styles.pressed]}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={tryDemo} hitSlop={8} style={styles.demo}>
        <Text style={styles.demoText}>Just looking? Try the demo drive</Text>
      </Pressable>
      <Text style={styles.small}>Everything here can be changed later on Session.</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, paddingHorizontal: 20, zIndex: 90 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  backButton: { minHeight: 44, justifyContent: "center" },
  back: { color: colors.blue, fontFamily: fonts.bodySemiBold, fontSize: 18 },
  step: { color: colors.muted, fontFamily: fonts.body, fontSize: 15 },
  content: { gap: 12, paddingVertical: 8 },
  title: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 28 },
  lead: { color: colors.muted, fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  options: { gap: 10, marginTop: 8 },
  big: {
    minHeight: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
  },
  bigOn: { borderColor: colors.amber, backgroundColor: colors.amber },
  bigText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 20 },
  bigDetail: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 2 },
  bigTextOn: { color: "#1a1200" },
  pressed: { opacity: 0.8 },
  subLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 15 },
  chipTextOn: { color: "#ffffff", fontFamily: fonts.bodyMedium },
  summary: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16, marginTop: 4 },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.fg,
    fontFamily: fonts.mono,
    fontSize: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  switchLabel: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 22 },
  next: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  nextOff: { opacity: 0.4 },
  nextText: { color: "#1a1200", fontFamily: fonts.displayBold, fontSize: 20 },
  demo: { alignSelf: "center", paddingVertical: 12 },
  demoText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  small: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
});
