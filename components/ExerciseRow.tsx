import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ExerciseListItem } from "@/lib/db";
import { formatSets, relativeDay } from "@/lib/format";
import { colors, TAP } from "@/lib/theme";

/**
 * En rad i avbockningslistan.
 *
 * Raden bär allt man behöver för att välja nästa övning utan att öppna den:
 * vad man körde senast och om den redan är avklarad i det pågående passet.
 */
export function ExerciseRow({
  item,
  onPress,
  skipped,
  onToggleSkip,
}: {
  item: ExerciseListItem;
  onPress: () => void;
  /** Överhoppad i det pågående passet. */
  skipped?: boolean;
  /** Sätts bara i planläget — överhoppning hör ihop med en plan att avvika från. */
  onToggleSkip?: () => void;
}) {
  const { exercise, machine, lastSets, lastPerformedAt, doneToday } = item;
  const perHand = exercise.weightUnit === "per_hand";

  const subtitle = lastSets.length > 0 ? formatSets(lastSets, perHand) : "Inte loggad än";

  // En maskinövning som aldrig använts på det här gymmet saknar `machine`-rad.
  // Det är inget fel: raden skapas vid första loggade setet (designprincip 4 —
  // maskiner läggs till när de används). Säg det lugnt, inte i rött.
  const newHere = exercise.type === "machine" && !machine;

  const meta = newHere
    ? "Ny här — läggs till när du loggar"
    : [machine?.manufacturer, lastPerformedAt ? relativeDay(lastPerformedAt) : null]
        .filter(Boolean)
        .join(" · ");

  const dimmed = doneToday || skipped;

  return (
    <View
      className="mb-2 flex-row items-center rounded-[15px] border border-line bg-card pl-4"
      style={{ minHeight: 76, opacity: dimmed ? 0.5 : 1 }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}. ${
          skipped ? "Överhoppad." : doneToday ? "Avklarad." : ""
        } ${subtitle}`}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
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
          {doneToday ? (
            <Feather name="check" size={18} color={colors.bg} />
          ) : skipped ? (
            <Feather name="minus" size={18} color={colors.muted} />
          ) : null}
        </View>

        <View className="flex-1 py-3">
          <Text
            className="text-[17px] font-semibold text-ink"
            numberOfLines={1}
            style={skipped ? { textDecorationLine: "line-through" } : undefined}
          >
            {exercise.name}
          </Text>
          {exercise.nameEn ? (
            <Text className="mt-0.5 text-[12.5px] text-muted" numberOfLines={1}>
              {exercise.nameEn}
            </Text>
          ) : null}
          <Text className="mt-0.5 text-[13.5px] text-muted" numberOfLines={1}>
            {skipped ? "Överhoppad i det här passet" : subtitle}
          </Text>
          {meta && !skipped ? (
            <Text className="mt-0.5 text-[12px] text-muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {onToggleSkip ? (
        <Pressable
          onPress={onToggleSkip}
          accessibilityRole="button"
          accessibilityLabel={
            skipped ? `Ångra överhopp av ${exercise.name}` : `Hoppa över ${exercise.name}`
          }
          className="items-center justify-center active:opacity-60"
          style={{ width: TAP * 0.75, height: TAP }}
        >
          <Feather
            name={skipped ? "rotate-ccw" : "skip-forward"}
            size={19}
            color={colors.muted}
          />
        </Pressable>
      ) : (
        <View style={{ width: 12 }} />
      )}
      <Feather name="chevron-right" size={20} color={colors.muted} style={{ marginRight: 12 }} />
    </View>
  );
}
