import type { BottomTabBarProps } from "expo-router/tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "../session/SessionProvider";
import { colors, fonts } from "../theme";
import { useThemed } from "../textSize";

// Text-only tabs with an amber bar over the active one, as in the prototype.
// Big targets: the operator is tapping this in a moving car.
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useThemed(baseStyles);
  const insets = useSafeAreaInsets();
  // Pursuit can be hidden in Session (crews who never pursue).
  const { showPursuit } = useSession();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      {state.routes.map((route, index) => {
        if (route.name === "pursuit" && !showPursuit) return null;
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.tab, focused && styles.tabFocused]}
          >
            <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 3,
    borderTopColor: "transparent",
  },
  tabFocused: { borderTopColor: colors.amber },
  label: {
    color: colors.muted,
    fontFamily: fonts.displaySemiBold,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  labelFocused: { color: colors.fg },
});
