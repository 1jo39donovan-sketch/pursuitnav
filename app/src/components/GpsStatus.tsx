import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { DEMO_MODE } from "../config";
import { useLocation } from "../location/LocationProvider";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

const WEB = Platform.OS === "web";
// In a browser there's no Settings screen to open: say where to go instead.
const WEB_DENIED =
  "Location is blocked for this site. On iPhone: Settings → Privacy & Security → Location Services → " +
  "Safari Websites → While Using the App (Precise Location on). Then reload.";
const reload = () => window.location.reload();

/** One line saying whether the GPS position can be trusted, with a fix when it can't. */
export function GpsStatus() {
  const { status, fix, requestPermission, simulated } = useLocation();
  const { setDemoDrive } = useSession();

  // After a while with no position, say what usually helps.
  const waiting = !simulated && status === "granted" && !fix;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [waiting]);

  if (status === "needs-permission") {
    return (
      <Banner tone="warn" text="Location is off for Blue Route. Routes start from your position.">
        <Action label="Allow" onPress={requestPermission} />
      </Banner>
    );
  }
  if (status === "denied") {
    return WEB ? (
      <Banner tone="warn" text={WEB_DENIED}>
        <Action label="Reload" onPress={reload} />
      </Banner>
    ) : (
      <Banner tone="warn" text="Location permission was refused. Turn it on in Settings.">
        <Action label="Settings" onPress={() => Linking.openSettings()} />
      </Banner>
    );
  }
  if (status === "services-off" && WEB) {
    return <Banner tone="warn" text="This browser can’t give a location. Try Safari or Chrome." />;
  }
  if (status === "services-off") {
    return (
      <Banner tone="warn" text="Location services are switched off on this phone.">
        <Action label="Settings" onPress={() => Linking.openSettings()} />
      </Banner>
    );
  }
  if (DEMO_MODE) {
    return <Banner tone="warn" text="DEMO · scripted drive, not real GPS" />;
  }
  if (simulated) {
    return (
      <Banner tone="warn" text="DEMO DRIVE · simulated position in London, not your GPS">
        <Action label="Turn off" onPress={() => setDemoDrive(false)} />
      </Banner>
    );
  }
  if (status === "checking" || !fix) {
    return slow ? (
      <Banner
        tone="warn"
        text={
          WEB
            ? "Still no GPS. Check Location Services is on and Safari Websites is set to While Using the App, with Precise Location on."
            : "Still no GPS. Check Location Services is on; a position comes quicker outdoors."
        }
      >
        {WEB && <Action label="Reload" onPress={reload} />}
      </Banner>
    ) : (
      <Banner tone="muted" text="Waiting for GPS…" />
    );
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
