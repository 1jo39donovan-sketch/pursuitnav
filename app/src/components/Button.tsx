// A clearly pressable button: filled or outlined, never bare text, big
// enough to hit without looking twice.
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "../theme";
import { useThemed } from "../textSize";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  label,
  onPress,
  variant = "secondary",
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemed(baseStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, style]}
    >
      <Text style={[styles.text, variant === "primary" ? styles.textPrimary : variant === "danger" ? styles.textDanger : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.amber, borderColor: colors.amber },
  secondary: { backgroundColor: colors.panel, borderColor: colors.blue },
  danger: { backgroundColor: colors.panel, borderColor: colors.warn },
  pressed: { opacity: 0.75 },
  text: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 17, letterSpacing: 0.5 },
  textPrimary: { color: "#1a1200" },
  textDanger: { color: colors.warn },
});
