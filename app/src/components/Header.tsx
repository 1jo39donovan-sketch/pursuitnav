import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

export function Header() {
  const insets = useSafeAreaInsets();
  const { callsign, boroughs } = useSession();
  const area =
    boroughs.length === 0 ? "No boroughs" : boroughs.length <= 2 ? boroughs.join(" · ") : `${boroughs[0]} +${boroughs.length - 1}`;
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
      <View style={styles.session}>
        <Text style={styles.callsignStrong} numberOfLines={1}>
          {callsign || "No callsign"}
        </Text>
        <Text style={styles.callsign} numberOfLines={1}>
          {area}
        </Text>
      </View>
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
  session: { alignItems: "flex-end", flexShrink: 1, marginLeft: 12 },
  callsignStrong: { color: colors.amber, fontFamily: fonts.mono, fontSize: 12 },
  callsign: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
});
