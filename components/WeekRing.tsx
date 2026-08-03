import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/lib/theme";

const BASE_SIZE = 132;
const BASE_RADIUS = 57;
const BASE_STROKE = 11;

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
export function WeekRing({
  done,
  target,
  size = BASE_SIZE,
}: {
  done: number;
  target: number;
  size?: number;
}) {
  // Allt skalas från 132-designen, så proportionerna håller i alla storlekar.
  const scale = size / BASE_SIZE;
  const RADIUS = BASE_RADIUS * scale;
  const STROKE = BASE_STROKE * scale;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const share = target > 0 ? Math.min(1, done / target) : 0;
  const offset = CIRCUMFERENCE * (1 - share);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          stroke={colors.cardHi}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
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
            fontSize: Math.round(40 * scale),
            fontWeight: "700",
            letterSpacing: -1.5 * scale,
            color: colors.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {done}
        </Text>
        <Text style={{ fontSize: Math.round(13 * scale), fontWeight: "600", color: colors.muted, marginTop: 3 }}>
          av {target} pass
        </Text>
      </View>
    </View>
  );
}
