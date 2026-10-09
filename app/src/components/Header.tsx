import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts } from "../theme";

export function Header() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + 12, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 },
      ]}
    >
      <Text style={styles.brand}>
        Blue<Text style={styles.brandAccent}>Route</Text>
      </Text>
      {/* The callsign and boroughs land here once the Session tab saves them. */}
      <Text style={styles.callsign}>No session</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  brand: {
    color: colors.fg,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  brandAccent: { color: colors.blue },
  callsign: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
});
