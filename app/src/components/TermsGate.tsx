// The first time BlueRoute opens (and again whenever the terms change), the
// crew agrees to the terms of use before anything else: an independent aid,
// the driver and operator responsible for how they drive, blue-light routes
// only for those entitled to them, information as is. Covers the whole app.
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "../config";
import { store } from "../storage/store";
import { colors, fonts } from "../theme";

/** The terms' date (server/src/pages.ts, UPDATED): a new date asks again. */
export const TERMS_VERSION = "25 October 2026";
const KEY = "termsAccepted";

const POINTS = [
  "BlueRoute is an independent navigation aid, still being field-tested. It is not made or approved by any police, ambulance or fire service, and doesn’t replace your training, control room, radio or your service’s policies.",
  "You and the driver alone are responsible for how the vehicle is driven, for obeying the law and your service’s policies, and for everyone’s safety. The driver must not use the app while driving.",
  "Blue-light routes are only for drivers legally entitled to use the emergency exemptions, on an authorised call. Whether a route or manoeuvre is lawful and safe is your decision.",
  "Addresses, routes, speed limits, closures and everything else in the app can be wrong or out of date. Confirm the address with control, and follow the road, not the app.",
];

export function TermsGate() {
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState(() => store.getSetting(KEY) === TERMS_VERSION);
  if (accepted) return null;

  const agree = () => {
    store.setSetting(KEY, TERMS_VERSION);
    setAccepted(true);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.lead}>BlueRoute’s terms of use, in short:</Text>
        {POINTS.map((p) => (
          <View key={p} style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{p}</Text>
          </View>
        ))}
        {API_URL !== "" && (
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/terms`)} hitSlop={8}>
              <Text style={styles.link}>Read the full terms</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/privacy`)} hitSlop={8}>
              <Text style={styles.link}>Privacy policy</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="I agree to the terms of use"
        onPress={agree}
        style={({ pressed }) => [styles.agree, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.agreeText}>I agree</Text>
      </Pressable>
      <Text style={styles.small}>By tapping I agree, you accept the full terms of use.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, paddingHorizontal: 20, zIndex: 100 },
  content: { gap: 12, paddingBottom: 16 },
  title: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 28 },
  lead: { color: colors.muted, fontFamily: fonts.body, fontSize: 16 },
  point: { flexDirection: "row", gap: 10 },
  bullet: { color: colors.amber, fontFamily: fonts.bodySemiBold, fontSize: 17, lineHeight: 24 },
  pointText: { flex: 1, color: colors.fg, fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  links: { flexDirection: "row", gap: 24, marginTop: 4 },
  link: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 16 },
  agree: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  agreeText: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 20 },
  small: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: "center", marginTop: 8 },
});
