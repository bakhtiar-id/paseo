import { useMemo, type ReactNode } from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type StatusBadgeVariant = "success" | "error" | "warning" | "info" | "muted";

interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  style?: StyleProp<ViewStyle>;
  leading?: ReactNode;
}

export function StatusBadge({ label, variant = "muted", style, leading }: StatusBadgeProps) {
  const pillStyle = useMemo(
    () => [
      styles.pill,
      variant === "success" && styles.pillSuccess,
      variant === "error" && styles.pillError,
      variant === "warning" && styles.pillWarning,
      variant === "info" && styles.pillInfo,
      style,
    ],
    [variant, style],
  );
  const textStyle = useMemo(
    () => [
      styles.pillText,
      variant === "success" && styles.pillTextSuccess,
      variant === "error" && styles.pillTextError,
      variant === "warning" && styles.pillTextWarning,
      variant === "info" && styles.pillTextInfo,
    ],
    [variant],
  );

  return (
    <View style={pillStyle}>
      {leading}
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
  },
  pillSuccess: {
    backgroundColor: `${theme.colors.statusSuccess}1a`,
    borderColor: `${theme.colors.statusSuccess}33`,
  },
  pillError: {
    backgroundColor: `${theme.colors.statusDanger}1a`,
    borderColor: `${theme.colors.statusDanger}33`,
  },
  pillWarning: {
    backgroundColor: `${theme.colors.palette.amber[500]}26`,
    borderColor: theme.colors.palette.amber[700],
  },
  pillInfo: {
    backgroundColor: `${theme.colors.palette.blue[500]}26`,
    borderColor: theme.colors.palette.blue[800],
  },
  pillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  pillTextSuccess: {
    color: theme.colors.statusSuccess,
  },
  pillTextError: {
    color: theme.colors.statusDanger,
  },
  pillTextWarning: {
    color: theme.colors.palette.amber[500],
  },
  pillTextInfo: {
    color: theme.colors.palette.blue[400],
  },
}));
