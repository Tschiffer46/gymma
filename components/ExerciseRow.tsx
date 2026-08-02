import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ExerciseListItem } from "@/lib/db";
import { formatSets, relativeDay } from "@/lib/format";
import { colors } from "@/lib/theme";

/**
 * En rad i avbockningslistan.
 *
 * Raden bär allt man behöver för att välja nästa övning utan att öppna den:
 * vad man körde senast och om den redan är avklarad i det pågående passet.
 */
export function ExerciseRow({ item, onPress }: { item: ExerciseListItem; onPress: () => void }) {
  const { exercise, machine, lastSets, lastPerformedAt, doneToday } = item;
  const perHand = exercise.weightUnit === "per_hand";

  const subtitle =
    lastSets.length > 0
      ? formatSets(lastSets, perHand)
      : machine
        ? "Inte loggad än"
        : "Inte loggad än";

  const meta = [machine?.manufacturer, lastPerformedAt ? relativeDay(lastPerformedAt) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}. ${doneToday ? "Avklarad idag." : ""} ${subtitle}`}
      className="mb-2 flex-row items-center gap-3 rounded-[15px] border border-line bg-card px-4 active:opacity-70"
      style={{ minHeight: 76, opacity: doneToday ? 0.55 : 1 }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 30,
          height: 30,
          backgroundColor: doneToday ? colors.ok : "transparent",
          borderWidth: doneToday ? 0 : 2,
          borderColor: colors.line,
        }}
      >
        {doneToday ? <Feather name="check" size={18} color={colors.bg} /> : null}
      </View>

      <View className="flex-1 py-3">
        <Text className="text-[17px] font-semibold text-ink" numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text className="mt-0.5 text-[13.5px] text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
        {meta ? (
          <Text className="mt-0.5 text-[12px] text-muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      {machine ? <Feather name="settings" size={15} color={colors.muted} /> : null}
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}
