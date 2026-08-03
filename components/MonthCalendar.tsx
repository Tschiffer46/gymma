import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { WEEKDAYS_MONDAY_FIRST, dayKeyToDate, monthGrid, monthName, toDayKey } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";

/**
 * Månadskalender för att planera träningsdagar.
 *
 * Byggd med vanliga `View` — ingen kalenderberoende. Ett rutnät på sju kolumner
 * är inte svårare än ett bibliotek att underhålla, och vi slipper ännu en
 * dependency i en app som redan brännts av beroendedrift.
 *
 * Dagar som passerat går inte att planera. Att planera bakåt säger ingenting
 * om vad du tänker göra, och skulle bara göra "nästa pass" tvetydigt.
 */
export function MonthCalendar({
  year,
  month,
  planned,
  trained,
  onToggle,
  onChangeMonth,
}: {
  year: number;
  month: number;
  /** 'YYYY-MM-DD' som är planerade. */
  planned: Set<string>;
  /** 'YYYY-MM-DD' där ett pass faktiskt avslutades. */
  trained: Set<string>;
  onToggle: (day: string) => void;
  onChangeMonth: (year: number, month: number) => void;
}) {
  const cells = monthGrid(year, month);
  const todayKey = toDayKey();

  function step(delta: number) {
    const d = new Date(year, month + delta, 1);
    onChangeMonth(d.getFullYear(), d.getMonth());
  }

  return (
    <View>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <MonthArrow icon="chevron-left" label="Föregående månad" onPress={() => step(-1)} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
          {monthName(month)} {year}
        </Text>
        <MonthArrow icon="chevron-right" label="Nästa månad" onPress={() => step(1)} />
      </View>

      <View className="flex-row" style={{ marginBottom: 6 }}>
        {WEEKDAYS_MONDAY_FIRST.map(({ dow, short }) => (
          <Text
            key={dow}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 11,
              fontWeight: "600",
              color: colors.mutedDim,
            }}
          >
            {short.slice(0, 2)}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((day, i) => {
          if (!day) return <View key={`x${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;

          const isPlanned = planned.has(day);
          const didTrain = trained.has(day);
          const isToday = day === todayKey;
          const isPast = day < todayKey;

          return (
            <View key={day} style={{ width: `${100 / 7}%`, height: 46, padding: 2 }}>
              <Pressable
                onPress={() => onToggle(day)}
                disabled={isPast}
                accessibilityRole="button"
                accessibilityState={{ selected: isPlanned, disabled: isPast }}
                accessibilityLabel={`${dayKeyToDate(day).getDate()} ${monthName(month)}${
                  isPlanned ? ", planerad" : ""
                }${didTrain ? ", tränad" : ""}`}
                className="flex-1 items-center justify-center active:opacity-70"
                style={{
                  borderRadius: radius.sm,
                  backgroundColor: didTrain
                    ? colors.ok
                    : isPlanned
                      ? colors.accentSoft
                      : "transparent",
                  borderWidth: isPlanned && !didTrain ? 1 : isToday ? 1 : 0,
                  borderColor: isPlanned ? colors.accent : colors.line,
                  opacity: isPast && !didTrain ? 0.35 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 14.5,
                    fontWeight: isPlanned || didTrain || isToday ? "700" : "400",
                    color: didTrain
                      ? colors.bg
                      : isPlanned
                        ? colors.accent
                        : isToday
                          ? colors.ink
                          : colors.mutedDim,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {dayKeyToDate(day).getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MonthArrow({
  icon,
  label,
  onPress,
}: {
  icon: "chevron-left" | "chevron-right";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      className="items-center justify-center active:opacity-60"
      style={{ width: 44, height: 44 }}
    >
      <Feather name={icon} size={22} color={colors.muted} />
    </Pressable>
  );
}
