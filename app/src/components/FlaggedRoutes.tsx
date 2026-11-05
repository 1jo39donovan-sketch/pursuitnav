// After END: routes flagged during navigation, offered as one email the
// crew writes in their own mail app (feedback.ts), or put away. Shown on
// Search, never mid-drive.
import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { flagsUrl } from "../feedback";
import { clearFlags, flaggedRoutes } from "../flags";
import { useNavigation } from "../navigation/NavigationProvider";
import { colors, fonts } from "../theme";
import { useTextStyles } from "../textSize";

export function FlaggedRoutes() {
  const styles = useTextStyles(baseStyles);
  const focused = useIsFocused();
  const { active } = useNavigation();
  const [flags, setFlags] = useState(flaggedRoutes);
  // Read again whenever Search comes back into view (after END).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focused) setFlags(flaggedRoutes());
  }, [focused]);
  if (!flags.length || active) return null;

  const done = () => {
    clearFlags();
    setFlags([]);
  };
  return (
    <View style={styles.card}>
      <Text style={styles.text}>
        {flags.length === 1 ? "You flagged a route." : `You flagged ${flags.length} routes.`} Send a report? It opens
        your mail app, with no addresses in it.
      </Text>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void Linking.openURL(flagsUrl(flags)).catch(() => {});
            done();
          }}
          style={({ pressed }) => [styles.button, styles.send, pressed && { opacity: 0.8 }]}
        >
          <Text style={[styles.buttonText, styles.sendText]}>Send report</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={done}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.buttonText}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  text: { color: colors.fg, fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
  },
  send: { backgroundColor: colors.amber, borderColor: colors.amber },
  buttonText: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 16, textAlign: "center" },
  sendText: { color: "#1a1200" },
});
