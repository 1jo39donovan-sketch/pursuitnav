import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { useLocation } from "../location/LocationProvider";
import { colors, fonts } from "../theme";

/** One line saying whether the GPS position can be trusted, with a fix when it can't. */
export function GpsStatus() {
  const { status, fix, requestPermission } = useLocation();

  if (status === "needs-permission") {
    return (
      <Banner tone="warn" text="Location is off for Blue Route. Routes start from your position.">
        <Action label="Allow" onPress={requestPermission} />
      </Banner>
    );
  }
  if (status === "denied") {
    return (
      <Banner tone="warn" text="Location permission was refused. Turn it on in Settings.">
        <Action label="Settings" onPress={() => Linking.openSettings()} />
      </Banner>
    );
  }
  if (status === "services-off") {
    return (
      <Banner tone="warn" text="Location services are switched off on this phone.">
        <Action label="Settings" onPress={() => Linking.openSettings()} />
      </Banner>
    );
  }
  if (status === "checking" || !fix) {
    return <Banner tone="muted" text="Waiting for GPS…" />;
  }
  const accuracy = fix.accuracy != null ? `±${Math.round(fix.accuracy)} m` : "accuracy unknown";
  return <Banner tone={fix.accuracy != null && fix.accuracy > 50 ? "warn" : "ok"} text={`GPS ${accuracy}`} />;
}

function Banner({
  tone,
  text,
  children,
}: {
  tone: "ok" | "warn" | "muted";
  text: string;
  children?: React.ReactNode;
}) {
  const color = tone === "ok" ? colors.ok : tone === "warn" ? colors.amber : colors.muted;
  return (
    <View style={styles.banner}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.text}>{text}</Text>
      {children}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  action: {
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    color: colors.amber,
    fontFamily: fonts.displaySemiBold,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
