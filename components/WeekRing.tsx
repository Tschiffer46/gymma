import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/lib/theme";

const SIZE = 132;
const RADIUS = 57;
const STROKE = 11;
/** Omkretsen: 2πr ≈ 358. Hela strecklängden, som offset räknas ifrån. */
const CIRCUMFERENCE = Math.round(2 * Math.PI * RADIUS);

/**
 * Veckoringen — hur många pass av målet som är avklarade.
 *
 * Ritad med SVG i stället för `View` + `borderRadius`: rundade ändar
 * (`strokeLinecap="round"`) går inte att få med kanter, och en ring som slutar
 * tvärt ser oavsiktlig ut snarare än stram.
 *
 * Avsiktligt **inte** animerad. En animerad `strokeDashoffset` kräver
 * `useAnimatedProps` från Reanimated mot SVG — en integration vi inte kan
 * verifiera härifrån, och rörelsen som specen faktiskt efterfrågar sitter i
 * volymstaven, som är ren `View` och därmed riskfri.
 */
export function WeekRing({ done, target }: { done: number; target: number }) {
  const share = target > 0 ? Math.min(1, done / target) : 0;
  const offset = CIRCUMFERENCE * (1 - share);

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.cardHi}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.accent}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </Svg>

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontSize: 40,
            fontWeight: "700",
            letterSpacing: -1.5,
            color: colors.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {done}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 3 }}>
          av {target} pass
        </Text>
      </View>
    </View>
  );
}
