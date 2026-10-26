import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { DEMO_MODE } from "../config";
import { useLocation } from "../location/LocationProvider";
import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";

const WEB = Platform.OS === "web";
// In a browser there's no Settings screen to open: say where to go instead,
// for the device it's on.
export type WebDevice = "iphone" | "android" | "desktop";
export function webDevice(userAgent: string): WebDevice {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}
export function webDeniedText(device: WebDevice): string {
  switch (device) {
    case "iphone":
      return (
        "Location is blocked for this site. On iPhone: Settings → Privacy & Security → Location Services → " +
        "Safari Websites → While Using the App (Precise Location on). Then reload."
      );
    case "android":
      return "Location is blocked for this site. Tap the icon left of the address → Permissions → Location → Allow. Then reload.";
    case "desktop":
      return "Location is blocked for this site. Click the icon left of the address → Site settings → Location → Allow. Then reload.";
  }
}
/** Further off than this, the phone is guessing from Wi-Fi or masts: usually Precise Location is off. */
export const ROUGH_GPS_M = 1000;
/** What to say about a rough position, and how to fix it, for where BlueRoute is running. */
export function roughGpsText(accuracy: number, where: WebDevice | "app"): string {
  const off = accuracy < 10_000 ? `±${(accuracy / 1000).toFixed(1)} km` : `±${Math.round(accuracy / 1000)} km`;
  const start = `GPS ${off}: your position is only a rough guess.`;
  switch (where) {
    case "iphone":
      return `${start} Settings → Privacy & Security → Location Services → Safari Websites → turn on Precise Location. Then reload.`;
    case "android":
      return `${start} Tap the icon left of the address → Permissions → Location → Use precise location. Then reload.`;
    case "desktop":
      return `${start} Computers without GPS place themselves by Wi-Fi. Use a phone for real routes.`;
    case "app":
      return `${start} Turn on Precise Location for BlueRoute in Settings.`;
  }
}
const device = (): WebDevice => webDevice(typeof navigator === "undefined" ? "" : navigator.userAgent);
const reload = () => window.location.reload();

/** A line when the GPS position can't be trusted, with a fix if there is one. Nothing when it's good. */
export function GpsStatus() {
  const { status, fix, requestPermission, simulated } = useLocation();
  const { setDemoDrive } = useSession();
  // In the browser (the test version) the blocked-location line can be put
  // away for this visit; it says so once more after a reload.
  const [dismissed, setDismissed] = useState(false);

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
      <Banner tone="warn" text="Location is off for BlueRoute. Routes start from your position.">
        <Action label="Allow" onPress={requestPermission} />
      </Banner>
    );
  }
  if (status === "denied") {
    if (WEB && dismissed) return null;
    return WEB ? (
      <Banner tone="warn" text={webDeniedText(device())}>
        <Action label="Reload" onPress={reload} />
        {/* The test version: try BlueRoute without location, on a pretend drive in London. */}
        <Action label="Demo drive" onPress={() => setDemoDrive(true)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => setDismissed(true)}
          hitSlop={10}
          style={styles.dismiss}
        >
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
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
          !WEB
            ? "Still no GPS. Check Location Services is on; a position comes quicker outdoors."
            : device() === "iphone"
              ? "Still no GPS. Check Location Services is on and Safari Websites is set to While Using the App, with Precise Location on."
              : "Still no GPS. Check this browser is allowed your location (the icon left of the address)."
        }
      >
        {WEB && <Action label="Reload" onPress={reload} />}
      </Banner>
    ) : (
      <Banner tone="muted" text="Waiting for GPS…" />
    );
  }
  // A good position needs no line on screen: the map's space is worth more.
  if (fix.accuracy != null && fix.accuracy <= 50) return null;
  if (fix.accuracy != null && fix.accuracy > ROUGH_GPS_M) {
    return WEB ? (
      <Banner tone="warn" text={roughGpsText(fix.accuracy, device())}>
        {device() !== "desktop" && <Action label="Reload" onPress={reload} />}
      </Banner>
    ) : (
      <Banner tone="warn" text={roughGpsText(fix.accuracy, "app")}>
        <Action label="Settings" onPress={() => Linking.openSettings()} />
      </Banner>
    );
  }
  const accuracy = fix.accuracy != null ? `±${Math.round(fix.accuracy)} m` : "accuracy unknown";
  return <Banner tone="warn" text={`GPS ${accuracy}: position may be off`} />;
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
      <View style={styles.line}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.text}>{text}</Text>
      </View>
      {children}
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    // Long instructions take the line; the buttons go under them on a phone.
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.bg,
    // Rounded, as it often floats over a map.
    borderRadius: 12,
    overflow: "hidden",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // The words take the whole line: any buttons go underneath, never squeezing them.
  line: { flexBasis: "100%", flexDirection: "row", alignItems: "center", gap: 8 },
  text: { flex: 1, color: colors.fg, fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
  dismiss: { paddingHorizontal: 4 },
  dismissText: { color: colors.muted, fontSize: 18 },
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
