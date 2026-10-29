// Team on Session: start or join a team, share the code, see who's where, and
// follow a colleague's way in.
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { boroughAt } from "../area/area";
import { formatDistance } from "../format";
import { distanceM } from "../geo";
import { useLocation } from "../location/LocationProvider";
import { accuracyText, roughFix, useTeam } from "../team/TeamProvider";
import { SHARE_POLICIES } from "../team/sharePolicy";
import { useFollowIn } from "../team/useFollowIn";
import { colors, fonts } from "../theme";
import { Button } from "./Button";
import { useTextStyles, useColors } from "../textSize";

const STATUS: Record<string, string> = {
  connecting: "Connecting…",
  live: "Live: sharing every 15 seconds",
  offline: "No signal: will share again when it's back",
  notfound: "Team not found. Check the code with whoever started it: it shows here once they share.",
  ended: "This team has ended. Leave it and start a new one.",
};

/** The message sent with the code. Pasting all of it into Join works too. */
export const shareMessage = (code: string) =>
  `Join my BlueRoute team: in BlueRoute, go to Session → Team → Join with a code, and paste this message.\n\nCode: ${code}`;

/** Copies to the clipboard in a browser (the phone app copies from the share sheet). */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Ticks every 15 s, for "2 min ago". */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ago(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export function TeamSection() {
  const palette = useColors();
  const styles = useTextStyles(baseStyles);
  const team = useTeam();
  const { fix } = useLocation();
  const { follow, following, error } = useFollowIn();
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const [typed, setTyped] = useState("");
  const [badCode, setBadCode] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 3000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!team.code) {
    return (
      <View style={styles.field}>
        <Text style={styles.meta}>
          On a job with others? See each other on the map, and follow a colleague’s way in to somewhere hard to find.
        </Text>
        {joining ? (
          <View style={styles.joinRow}>
            <TextInput
              value={typed}
              onChangeText={(t) => {
                setTyped(t);
                setBadCode(false);
              }}
              placeholder="Paste the code or the whole message"
              placeholderTextColor={palette.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              style={styles.input}
            />
            <Button label="Join" variant="primary" onPress={() => setBadCode(!team.join(typed))} />
            <Button label="Cancel" onPress={() => setJoining(false)} />
          </View>
        ) : (
          <View style={styles.row}>
            <Button label="Start a team" variant="primary" onPress={team.create} />
            <Button label="Join with a code" onPress={() => setJoining(true)} />
          </View>
        )}
        {badCode && (
          <Text style={styles.error}>No team code found: it’s 24 letters and numbers, in groups of four.</Text>
        )}
        <Text style={styles.small}>
          Shares only while BlueRoute is open. Positions are encrypted on your phone; the server can’t read them. Not a
          force system: follow your force’s policy, and use your radio.
        </Text>
      </View>
    );
  }

  const others = team.members.filter((m) => !m.me);
  // Three groups of four a line, so the whole code shows on a narrow phone.
  const groups = team.code.split("-");
  const lines = [groups.slice(0, 3).join(" "), groups.slice(3).join(" ")];
  const share = async () => {
    const message = shareMessage(team.code!);
    if (Platform.OS !== "web") return void Share.share({ message });
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) {
      try {
        return await nav.share({ text: message });
      } catch (e) {
        // Closing the share sheet isn't a failure.
        if ((e as Error).name === "AbortError") return;
      }
    }
    setCopied((await copy(message)) ? "copied" : "failed");
  };
  return (
    <View style={styles.field}>
      <View style={styles.codeBox} accessible accessibilityLabel={`Team code ${team.code}`}>
        {lines.map((l) => (
          <Text key={l} style={styles.code} selectable>
            {l}
          </Text>
        ))}
      </View>
      <Text style={[styles.meta, (team.status === "ended" || team.status === "notfound") && styles.error]}>
        {STATUS[team.status] ?? ""}
        {team.expiresAt && team.status === "live"
          ? ` · ends ${new Date(team.expiresAt).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
          : ""}
      </Text>
      <View style={styles.row}>
        <Button label="Share code" variant="primary" onPress={() => void share()} />
        {Platform.OS === "web" && (
          <Button
            label={copied === "copied" ? "Copied ✓" : "Copy code"}
            onPress={() => void copy(team.code!).then((ok) => setCopied(ok ? "copied" : "failed"))}
          />
        )}
        {confirmLeave ? (
          <>
            <Button label="Yes, leave" variant="danger" onPress={team.leave} />
            <Button label="Stay" onPress={() => setConfirmLeave(false)} />
          </>
        ) : (
          <Button label="Leave team" variant="danger" onPress={() => setConfirmLeave(true)} />
        )}
      </View>

      <ShareSettings />
      {copied === "copied" && <Text style={styles.meta}>Copied. Paste it in a message to your colleagues.</Text>}
      {copied === "failed" && <Text style={styles.error}>Couldn’t copy: press and hold the code to select it.</Text>}
      {others.length === 0 ? (
        <Text style={styles.meta}>Nobody else yet. Share the code with your colleagues.</Text>
      ) : (
        others.map((m) => {
          const borough = boroughAt(m.lat, m.lng);
          return (
            <View key={m.memberId} style={styles.member}>
              <View style={styles.memberText}>
                <Text style={styles.callsign}>{m.callsign}</Text>
                <Text style={styles.meta}>
                  {[borough, fix ? `${formatDistance(distanceM(fix, m))} away` : null, ago(now - m.at)]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {m.accuracy != null && (
                  <Text style={roughFix(m.accuracy) ? styles.error : styles.meta}>
                    GPS {accuracyText(m.accuracy)}
                    {roughFix(m.accuracy) ? ": their position may be well off" : ""}
                  </Text>
                )}
              </View>
              {following === m.memberId ? (
                <ActivityIndicator color={palette.amber} />
              ) : m.track.length >= 2 ? (
                <Button label="Follow in" variant="primary" onPress={() => void follow(m)} />
              ) : (
                <Text style={styles.small}>No drive yet</Text>
              )}
            </View>
          );
        })
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.small}>
        Follow in drives you to the nearest point of the way they came, then along it. It may use bus lanes or ignore
        turn bans as they did; each one is listed. It won’t follow them the wrong way down a one-way street.
      </Text>
    </View>
  );
}

/** What this phone shares, said plainly, and the crew's choices about it. */
function ShareSettings() {
  const palette = useColors();
  const styles = useTextStyles(baseStyles);
  const team = useTeam();
  const hint = SHARE_POLICIES.find((p) => p.id === team.policy)?.hint;
  return (
    <View style={styles.settings}>
      <View style={[styles.sharing, !team.sharing.share && styles.notSharing]} accessibilityRole="text">
        <Text style={styles.sharingText}>
          {team.sharing.share ? "● " : "○ "}
          {team.sharing.why}
        </Text>
      </View>
      <Text style={styles.label}>Share my position</Text>
      <View style={styles.row}>
        {SHARE_POLICIES.map((p) => {
          const on = team.policy === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityHint={p.hint}
              onPress={() => team.setPolicy(p.id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint && <Text style={styles.meta}>{hint} Only while BlueRoute is open: a locked phone shares nothing.</Text>}
      <View style={styles.toggle}>
        <View style={styles.memberText}>
          <Text style={styles.toggleName} nativeID="battery-label">
            Battery saver
          </Text>
          <Text style={styles.meta}>Shares only while navigating, and once a minute when you’re standing still.</Text>
        </View>
        <Switch
          accessibilityLabelledBy="battery-label"
          value={team.batterySaver}
          onValueChange={team.setBatterySaver}
          trackColor={{ false: palette.line, true: palette.amber }}
        />
      </View>
      <View style={styles.toggle}>
        <View style={styles.memberText}>
          <Text style={styles.toggleName} nativeID="police-share-label">
            Share at police stations
          </Text>
          <Text style={styles.meta}>
            Off: at a police station (public OpenStreetMap locations) you’re hidden from the team, and your drive there
            isn’t kept.
          </Text>
        </View>
        <Switch
          accessibilityLabelledBy="police-share-label"
          value={team.shareAtPolice}
          onValueChange={team.setShareAtPolice}
          trackColor={{ false: palette.line, true: palette.amber }}
        />
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 10 },
  label: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  small: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.9,
  },
  error: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  joinRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fg,
    fontFamily: fonts.mono,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  codeBox: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  code: {
    color: colors.fg,
    fontFamily: fonts.mono,
    fontSize: 22,
    letterSpacing: 2,
  },
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberText: { flex: 1, minWidth: 0 },
  settings: { gap: 10 },
  sharing: { borderRadius: 8, borderWidth: 1, borderColor: colors.ok, paddingHorizontal: 12, paddingVertical: 8 },
  notSharing: { borderColor: colors.line },
  sharingText: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 15 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 16 },
  chipTextOn: { color: "#ffffff" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleName: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  callsign: {
    color: colors.fg,
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
  },
});
