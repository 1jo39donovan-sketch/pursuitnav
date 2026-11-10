// What a screen shows instead of crashing the app (each route exports one as
// its ErrorBoundary). Plain colours and no app state, so it still draws when
// the thing that failed was the app's own settings or providers.
import type { ErrorBoundaryProps } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

export function ScreenError({ error, retry, children }: ErrorBoundaryProps & { children?: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.text}>
        BlueRoute hit a problem on this screen. Your log, settings and saved places are safe.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      {children}
      {/* Short, for a report: never an address (errors don't carry them). */}
      <Text style={styles.detail} selectable>
        {error.name}: {error.message.slice(0, 200)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c1220" },
  content: { padding: 24, paddingTop: 80, gap: 16 },
  title: { color: "#ffffff", fontSize: 26, fontWeight: "700" },
  text: { color: "#c7cfdd", fontSize: 17, lineHeight: 24 },
  button: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: "#ffb627",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#1a1200", fontSize: 20, fontWeight: "700" },
  detail: { color: "#7d8799", fontSize: 12, marginTop: 24 },
});
