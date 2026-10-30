// Session → Map and voice: which of the phone's British voices reads the
// directions, how fast, and a button to hear it. Free and offline: these are
// the voices already on the phone (more can be downloaded in the phone's own
// settings: on iPhone, Accessibility → Spoken Content → Voices → English (UK)).
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  availableVoices,
  setVoiceSettings,
  testVoice,
  voiceSettings,
  type TestState,
  type VoiceOption,
  type VoiceRate,
} from "../navigation/speaker";
import { colors, fonts } from "../theme";
import { useTextStyles } from "../textSize";
import { Button } from "./Button";

/** At most this many voices offered: the best ones. */
const SHOWN = 4;

export function VoiceSettings({ onChange }: { onChange?: () => void }) {
  const styles = useTextStyles(baseStyles);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [chosen, setChosen] = useState(() => voiceSettings().voiceId);
  const [rate, setRate] = useState<VoiceRate>(() => voiceSettings().rate);
  const [test, setTest] = useState<TestState | null>(null);
  useEffect(() => {
    let live = true;
    void availableVoices().then((v) => live && setVoices(v));
    return () => {
      live = false;
    };
  }, []);
  const shown = (voices ?? []).slice(0, SHOWN);
  // A chosen voice no longer on the phone falls back to the best.
  const current = shown.some((v) => v.id === chosen) ? chosen : null;
  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Voice</Text>
      {voices && voices.length === 0 ? (
        <Text style={styles.meta}>This phone didn’t list its voices: its default voice is used.</Text>
      ) : (
        <View style={styles.chips}>
          {chip("best", "Best on this phone", current === null, () => {
            setChosen(null);
            setVoiceSettings({ voiceId: null, voiceName: null });
            onChange?.();
          })}
          {shown.map((v) =>
            chip(v.id, v.name, current === v.id, () => {
              setChosen(v.id);
              setVoiceSettings({ voiceId: v.id, voiceName: v.name });
              onChange?.();
            }),
          )}
        </View>
      )}
      <View style={styles.chips}>
        {chip("normal", "Normal speed", rate === "normal", () => {
          setRate("normal");
          setVoiceSettings({ rate: "normal" });
          onChange?.();
        })}
        {chip("faster", "A little faster", rate === "faster", () => {
          setRate("faster");
          setVoiceSettings({ rate: "faster" });
          onChange?.();
        })}
      </View>
      <Button label={test === "speaking" ? "Speaking…" : "Test voice"} onPress={() => testVoice(setTest)} />
      {test === "silent" && (
        <Text style={[styles.meta, styles.warn]} accessibilityLiveRegion="polite">
          No sound started. Turn the volume up and the silent switch off, then try again. In a browser, tap the page
          once first: some browsers only speak after a tap.
        </Text>
      )}
      {test === "done" && <Text style={styles.meta}>Did you hear it? If not, check the volume.</Text>}
      <Text style={styles.meta}>
        {Platform.OS === "ios" || (Platform.OS === "web" && /iPhone|iPad/.test(navigator.userAgent))
          ? "More natural voices are free: iPhone Settings → Accessibility → Spoken Content → Voices → English (UK), and download an Enhanced or Premium one."
          : "More natural voices are free: Android Settings → Text-to-speech output → Speech Services by Google → Install voice data → English (UK)."}
      </Text>
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
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.amber },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    maxWidth: "100%",
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { color: colors.fg, fontFamily: fonts.bodyMedium, fontSize: 15 },
  chipTextOn: { color: "#ffffff" },
});
