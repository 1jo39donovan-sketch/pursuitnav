// Team on Session: start or join a team, share the code, see who's where, and
// follow a colleague's way in.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { fetchFollow } from "../api/teams";
import { boroughAt } from "../area/area";
import { formatDistance } from "../format";
import { distanceM } from "../geo";
import { routeOrigin, useLocation } from "../location/LocationProvider";
import { useLog } from "../log/LogProvider";
import { useNavigation } from "../navigation/NavigationProvider";
import { useSession } from "../session/SessionProvider";
import { useTeam, type TeamMember } from "../team/TeamProvider";
import { colors, fonts } from "../theme";
import { Button } from "./Button";

const STATUS: Record<string, string> = {
  connecting: "Connecting…",
  live: "Live: sharing every 15 seconds",
  offline: "No signal: will share again when it's back",
  notfound: "Team not found. Check the code with whoever started it: it shows here once they share.",
  ended: "This team has ended. Leave it and start a new one.",
};

/** Ticks every 15 s, for "2 min ago". */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ago(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

export function TeamSection() {
  const team = useTeam();
  const { fix } = useLocation();
  const { vehicle, roads } = useSession();
  const navigation = useNavigation();
  const log = useLog();
  const now = useNow();
  const [joining, setJoining] = useState(false);
  const [typed, setTyped] = useState("");
  const [badCode, setBadCode] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [following, setFollowing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const follow = async (m: TeamMember) => {
    if (!fix) return setError("Waiting for your GPS position.");
    setError(null);
    setFollowing(m.memberId);
    try {
      const plan = await fetchFollow(routeOrigin(fix), m.track, vehicle, roads);
      const borough = boroughAt(m.lat, m.lng);
      const id = log.record({
        query: `Follow ${m.callsign}`,
        chosen: `${m.callsign}'s way in`,
        borough,
        lat: m.lat,
        lng: m.lng,
      });
      log.setRoute(id, "follow");
      navigation.start(
        "follow",
        { standard: plan.route, police: plan.route },
        { lat: m.lat, lng: m.lng, title: `${m.callsign}'s way in` },
        { callsign: m.callsign, track: m.track },
      );
      router.push("/navigate");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFollowing(null);
    }
  };

  if (!team.code) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>Team</Text>
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
              placeholder="Team code"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              style={styles.input}
            />
            <Button label="Join" variant="primary" onPress={() => setBadCode(!team.join(typed))} />
          </View>
        ) : (
          <View style={styles.row}>
            <Button label="Start a team" variant="primary" onPress={team.create} />
            <Button label="Join with a code" onPress={() => setJoining(true)} />
          </View>
        )}
        {badCode && <Text style={styles.error}>That isn’t a team code: it’s 24 letters and numbers.</Text>}
        <Text style={styles.small}>
          Shares only while Blue Route is open. Positions are encrypted on your phone; the server can’t read them. Not a
          force system: follow your force’s policy, and use your radio.
        </Text>
      </View>
    );
  }

  const others = team.members.filter((m) => !m.me);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Team</Text>
      <Text style={styles.code} selectable numberOfLines={1} adjustsFontSizeToFit>
        {team.code}
      </Text>
      <Text style={[styles.meta, (team.status === "ended" || team.status === "notfound") && styles.error]}>
        {STATUS[team.status] ?? ""}
        {team.expiresAt && team.status === "live"
          ? ` · ends ${new Date(team.expiresAt).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
          : ""}
      </Text>
      <View style={styles.row}>
        <Button
          label="Share code"
          variant="primary"
          onPress={() =>
            void Share.share({
              message: `Join my Blue Route team. Code: ${team.code}`,
            })
          }
        />
        {confirmLeave ? (
          <>
            <Button label="Yes, leave" variant="danger" onPress={team.leave} />
            <Button label="Stay" onPress={() => setConfirmLeave(false)} />
          </>
        ) : (
          <Button label="Leave team" variant="danger" onPress={() => setConfirmLeave(true)} />
        )}
      </View>

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
              </View>
              {following === m.memberId ? (
                <ActivityIndicator color={colors.amber} />
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

const styles = StyleSheet.create({
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
  code: {
    color: colors.fg,
    fontFamily: fonts.mono,
    fontSize: 20,
    letterSpacing: 1,
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
  callsign: {
    color: colors.fg,
    fontFamily: fonts.displaySemiBold,
    fontSize: 20,
  },
});
