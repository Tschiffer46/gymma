import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, radius } from "@/lib/theme";

/**
 * Fyllnadsstav som växer när vyn får fokus.
 *
 * Rörelsen är hela poängen — en stav som redan står still säger samma sak som
 * en siffra, medan en som fyller sig läses som framdrift. Ren `View`-bredd,
 * så ingen SVG-integration behövs.
 */
export function FillBar({
  share,
  height = 8,
  color = colors.accent,
  /** Byt värde för att spela om animationen (t.ex. vid fokus). */
  replayKey,
}: {
  share: number;
  height?: number;
  color?: string;
  replayKey?: unknown;
}) {
  const progress = useSharedValue(0);
  const target = Math.max(0, Math.min(1, share));

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(target, {
      duration: 550,
      easing: Easing.out(Easing.cubic),
    });
  }, [target, replayKey, progress]);

  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      style={{
        height,
        borderRadius: radius.pill,
        backgroundColor: colors.cardHi,
        overflow: "hidden",
      }}
    >
      <Animated.View style={[{ height, borderRadius: radius.pill, backgroundColor: color }, style]} />
    </View>
  );
}
