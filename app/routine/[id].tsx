import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  addRoutineItem,
  deleteRoutine,
  getRoutine,
  moveRoutineItem,
  removeRoutineItem,
  renameRoutine,
  useStore,
  type RoutineDetail,
} from "@/lib/db";
import { ExercisePicker } from "@/components/ExercisePicker";
import { Button, Empty, Loading, SectionLabel } from "@/components/ui";
import { muscleNames } from "@/lib/muscles";
import { colors, TAP } from "@/lib/theme";

/**
 * Redigera en plan: döp om, lägg till övningar, ordna dem, ta bort.
 *
 * Omordning sker med upp/ned i stället för drag-and-drop. Det slipper ett nytt
 * beroende ovanpå reanimated, och en knapp är lättare att träffa än ett
 * långtryck-och-dra.
 */
export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const router = useRouter();

  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [name, setName] = useState("");
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await getRoutine(store, id);
    setRoutine(r);
    setName((cur) => (cur.length === 0 ? (r?.name ?? "") : cur));
    setLoading(false);
  }, [store, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function commitName() {
    const trimmed = name.trim();
    if (!routine || !trimmed || trimmed === routine.name) {
      setName(routine?.name ?? "");
      return;
    }
    await renameRoutine(store, routine.id, trimmed);
    await load();
  }

  async function move(itemId: string, direction: "up" | "down") {
    Haptics.selectionAsync();
    await moveRoutineItem(store, itemId, direction);
    await load();
  }

  async function remove(itemId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await removeRoutineItem(store, itemId);
    await load();
  }

  async function add(exerciseId: string) {
    Haptics.selectionAsync();
    await addRoutineItem(store, id, exerciseId);
    await load();
  }

  function confirmDelete() {
    if (!routine) return;
    Alert.alert(
      `Radera ${routine.name}?`,
      "Passen du redan kört med planen påverkas inte.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: async () => {
            await deleteRoutine(store, routine.id);
            router.back();
          },
        },
      ],
    );
  }

  if (loading) return <Loading />;

  if (!routine) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8" edges={["bottom"]}>
        <Text className="text-center text-ink">Planen hittades inte.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={commitName}
          onSubmitEditing={commitName}
          returnKeyType="done"
          placeholder="Namn på planen"
          placeholderTextColor={colors.muted}
          className="rounded-[15px] border border-line bg-card px-4 text-[20px] font-bold text-ink"
          style={{ minHeight: 60 }}
        />

        <View className="mt-7">
          <SectionLabel>Övningar i ordning</SectionLabel>
          {routine.items.length === 0 ? (
            <Empty
              icon="list"
              title="Tom plan"
              body="Lägg till övningarna du brukar köra, i den ordning du kör dem."
            />
          ) : (
            <View className="mt-3 gap-2">
              {routine.items.map((item, index) => (
                <View
                  key={item.id}
                  className="flex-row items-center rounded-[15px] border border-line bg-card pl-4"
                  style={{ minHeight: 68 }}
                >
                  <Text
                    className="text-[15px] font-semibold text-muted"
                    style={{ width: 24 }}
                  >
                    {index + 1}
                  </Text>
                  <View className="flex-1 py-3 pr-2">
                    <Text className="text-[16px] font-semibold text-ink" numberOfLines={1}>
                      {item.exercise.name}
                    </Text>
                    <Text className="mt-0.5 text-[12.5px] text-muted" numberOfLines={1}>
                      {muscleNames(item.exercise.primaryMuscles) || "Ingen muskelgrupp satt"}
                    </Text>
                  </View>

                  <IconButton
                    icon="chevron-up"
                    label={`Flytta ${item.exercise.name} uppåt`}
                    disabled={index === 0}
                    onPress={() => move(item.id, "up")}
                  />
                  <IconButton
                    icon="chevron-down"
                    label={`Flytta ${item.exercise.name} nedåt`}
                    disabled={index === routine.items.length - 1}
                    onPress={() => move(item.id, "down")}
                  />
                  <IconButton
                    icon="x"
                    label={`Ta bort ${item.exercise.name}`}
                    tone="danger"
                    onPress={() => remove(item.id)}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          className="mt-10 items-center active:opacity-60"
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text className="text-[15px]" style={{ color: colors.danger }}>
            Radera planen
          </Text>
        </Pressable>
      </ScrollView>

      <View className="border-t border-line px-4 pb-1 pt-3">
        <Button
          label="Lägg till övningar"
          icon="plus"
          variant="secondary"
          onPress={() => setPicking(true)}
        />
      </View>

      {/* Hela biblioteket, inte bara det aktiva gymmet: en plan har med flit
          ingen gymkoppling — samma "Överkropp" ska gå att köra var som helst. */}
      <ExercisePicker
        open={picking}
        title="Lägg till i planen"
        exclude={routine.items.map((i) => i.exercise.id)}
        onPick={add}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  tone = "normal",
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "normal" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="items-center justify-center active:opacity-60"
      style={{ width: TAP * 0.72, height: TAP, opacity: disabled ? 0.25 : 1 }}
    >
      <Feather name={icon} size={21} color={tone === "danger" ? colors.danger : colors.ink} />
    </Pressable>
  );
}
