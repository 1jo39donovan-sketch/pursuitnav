import { ScrollView, StyleSheet, Text } from "react-native";

import { colors, fonts } from "../theme";

/** Holding screen for tabs whose feature lands in a later build step. */
export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  title: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 26 },
  body: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
});
