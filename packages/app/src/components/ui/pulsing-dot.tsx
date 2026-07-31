import { useEffect, useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const PULSE_DURATION = 1200;

// The halo renders at the dot's size and expands from its center, so it is
// anchored to the dot and does not intercept touches.
export function PulsingHalo({
  color,
  size,
  style,
}: {
  color: string;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_DURATION, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.55,
    transform: [{ scale: 1 + progress.value * 1.1 }],
  }));

  const baseStyle = useMemo<ViewStyle>(
    () => ({
      position: "absolute",
      top: 0,
      left: 0,
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
    }),
    [color, size],
  );

  if (reduceMotion) {
    return null;
  }

  return <Animated.View pointerEvents="none" style={[baseStyle, animatedStyle, style]} />;
}

const dotStyles = StyleSheet.create((theme) => ({
  bordered: {
    borderWidth: 1,
    borderColor: theme.colors.surface0,
  },
}));

export function PulsingDot({
  color,
  size,
  bordered,
  style,
}: {
  color: string;
  size: number;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const wrapperStyle = useMemo<ViewStyle>(() => ({ width: size, height: size }), [size]);
  const dotStyle = useMemo<ViewStyle>(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
    }),
    [color, size],
  );

  return (
    <View style={[wrapperStyle, style]}>
      <PulsingHalo color={color} size={size} />
      <View style={[dotStyle, bordered && dotStyles.bordered]} />
    </View>
  );
}
