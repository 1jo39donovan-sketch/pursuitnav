// A small red REC while field-test recording is on, over every screen.
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRecorder, useRecorderFlush } from "../fieldtest/instance";
import { fonts } from "../theme";

export function RecIndicator() {
  useRecorderFlush();
  const { enabled } = useRecorder();
  const insets = useSafeAreaInsets();
  if (!enabled) return null;
  return (
    <View style={[styles.wrap, { top: insets.top }]} pointerEvents="none">
      <View accessibilityLabel="Field-test recording is on" style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.text}>REC</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 50 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#e5484d" },
  text: { color: "#ffffff", fontFamily: fonts.displayBold, fontSize: 11, letterSpacing: 1 },
});
