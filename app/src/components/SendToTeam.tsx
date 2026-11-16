// Sending a team message: a place to go or a caution (from a place picked on
// the map or searched for), or a note. To one callsign or everyone. Says
// plainly who can read it, how long it lasts, and that it's no radio.
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { MAX_TEXT, MESSAGE_KINDS, type MessageKind, type MessagePlace } from "../team/messages";
import { useSession } from "../session/SessionProvider";
import { useTeam, type TeamContact } from "../team/TeamProvider";
import { colors, fonts } from "../theme";
import { useColors, useTextStyles } from "../textSize";

export function SendToTeam({ place, onClose }: { place?: MessagePlace; onClose: () => void }) {
  const styles = useTextStyles(baseStyles);
  const palette = useColors();
  const team = useTeam();
  const { callsign, setCallsign } = useSession();
  const hasCallsign = callsign.trim().length > 0;
  const kinds = MESSAGE_KINDS.filter((k) => (place ? k.needsPlace : !k.needsPlace));
  const [kind, setKind] = useState<MessageKind>(kinds[0]!.id);
  const [to, setTo] = useState<TeamContact | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; error?: string }>({ status: "idle" });
  // Only colleagues with a callsign can be picked: "No callsign" says nothing about who it is.
  const others = team.contacts.filter((m) => !m.me && m.callsign.trim() && m.callsign !== "No callsign");
  const needsText = kind !== "go";
  const canSend = hasCallsign && state.status !== "sending" && (!needsText || text.trim().length > 0);

  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  const send = async () => {
    setState({ status: "sending" });
    try {
      await team.send({ kind, to, text, place });
      setState({ status: "sent" });
      setTimeout(onClose, 900);
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Send to the team</Text>
          {/* It goes out under your callsign, so you must have one. */}
          {hasCallsign ? (
            <Text style={styles.from}>From {callsign.trim()}</Text>
          ) : (
            <>
              <Text style={styles.error}>Put your callsign in first: messages go out under it.</Text>
              <TextInput
                accessibilityLabel="Your callsign"
                value={callsign}
                onChangeText={setCallsign}
                placeholder="Your callsign, e.g. NI-31"
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, styles.callsignInput]}
              />
            </>
          )}
          {place && <Text style={styles.place}>{place.label}</Text>}
          <View style={styles.row}>{kinds.map((k) => chip(k.id, k.label, kind === k.id, () => setKind(k.id)))}</View>
          <Text style={styles.label}>To</Text>
          <View style={styles.row}>
            {chip("all", "Everyone", to === null, () => setTo(null))}
            {others.map((m) => chip(m.memberId, m.callsign, to?.memberId === m.memberId, () => setTo(m)))}
          </View>
          <TextInput
            accessibilityLabel="Message"
            value={text}
            onChangeText={(t) => setText(t.slice(0, MAX_TEXT))}
            placeholder={kind === "caution" ? "What to watch for, e.g. dog loose, side gate" : kind === "go" ? "Note (optional)" : "Note"}
            placeholderTextColor={palette.muted}
            multiline
            style={styles.input}
          />
          <Text style={styles.small}>
            Everyone with the team code can read it. Encrypted on this device: the BlueRoute server can’t read it, and
            deletes it within 12 hours. You’re responsible for what you send: only send what your force allows on this
            app. Not for anything urgent: messages can be late or not arrive. Use your radio.
          </Text>
          {state.status === "error" && <Text style={styles.error}>{state.error}</Text>}
          {state.status === "sent" && <Text style={styles.sent}>Sent.</Text>}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              disabled={!canSend}
              onPress={() => void send()}
              style={({ pressed }) => [styles.send, !canSend && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.sendText}>{state.status === "sending" ? "Sending…" : "Send"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  content: { padding: 20, gap: 12 },
  title: { color: colors.fg, fontFamily: fonts.displayBold, fontSize: 22 },
  place: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 17 },
  from: { color: colors.muted, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  callsignInput: { minHeight: 0, fontFamily: fonts.mono, fontSize: 20 },
  label: { color: colors.muted, fontFamily: fonts.displaySemiBold, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.body, fontSize: 15 },
  chipTextOn: { color: "#ffffff", fontFamily: fonts.bodyMedium },
  input: {
    minHeight: 80,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 16,
    padding: 12,
    textAlignVertical: "top",
  },
  small: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  error: { color: colors.warn, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  sent: { color: colors.ok, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  send: {
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#1a1200", fontFamily: fonts.displayBold, fontSize: 18 },
  cancel: { minHeight: 52, paddingHorizontal: 16, justifyContent: "center" },
  cancelText: { color: colors.muted, fontFamily: fonts.displaySemiBold, fontSize: 16 },
});
