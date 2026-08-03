import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  createRoutine,
  getTrainingDays,
  listRoutines,
  setTrainingDays,
  useStore,
  usualWeekdays,
  type RoutineSummary,
} from "@/lib/db";
import { Button, Empty, Loading, SectionLabel } from "@/components/ui";
import { WEEKDAYS_MONDAY_FIRST, weekdayName } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";

/**
 * "Planera" — sparade ordningar av övningar.
 *
 * En plan är aldrig ett krav. Designprincip 4 säger att programmet ska växa
 * fram, så planen är en genväg till det man brukar göra: under passet går det
 * alltid att växla till hela biblioteket och logga något som inte står i den.
 */
export default function PlanScreen() {
  const store = useStore();
  const router = useRouter();

  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRoutines(await listRoutines(store));
    const chosen = await getTrainingDays(store);
    setDays(chosen);

    // Har du inte valt än: föreslå utifrån vad du faktiskt brukar göra. Det
    // gör förstagångsvalet till ett tryck i stället för en fundering.
    if (chosen.length === 0) {
      const usual = await usualWeekdays(store, new Date().toISOString());
      setSuggestion(
        usual.length === 2
          ? `Du brukar träna ${weekdayName(usual[0]).toLowerCase()} och ${weekdayName(usual[1]).toLowerCase()}.`
          : null,
      );
    } else {
      setSuggestion(null);
    }
    setLoading(false);
  }, [store]);

  async function toggleDay(dow: number) {
    const next = days.includes(dow) ? days.filter((d) => d !== dow) : [...days, dow];
    setDays(next);
    await setTrainingDays(store, next);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const id = await createRoutine(store, trimmed);
      setName("");
      setAdding(false);
      router.push({ pathname: "/routine/[id]", params: { id } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="pb-1 pt-2 text-3xl font-bold tracking-tight text-ink">Planera</Text>

        {/* Träningsdagarna först: de svarar på NÄR, rutinerna på VAD. */}
        <View className="mb-8 mt-4">
          <SectionLabel>Vilka dagar tänker du träna?</SectionLabel>
          <View className="mt-3 flex-row" style={{ gap: 6 }}>
            {WEEKDAYS_MONDAY_FIRST.map(({ dow, short }) => {
              const active = days.includes(dow);
              return (
                <Pressable
                  key={dow}
                  onPress={() => toggleDay(dow)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={short}
                  className={`flex-1 items-center justify-center border active:opacity-70 ${
                    active ? "border-accent bg-accent-soft" : "border-line"
                  }`}
                  style={{ height: 52, borderRadius: radius.sm }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: "600",
                      color: active ? colors.accent : colors.mutedDim,
                    }}
                  >
                    {short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="mt-2.5 text-[13px] leading-[18px] text-muted">
            {days.length === 0
              ? suggestion ?? "Välj dagarna du siktar på. Startskärmen visar sedan när nästa pass är."
              : `${days.length} ${days.length === 1 ? "dag" : "dagar"} i veckan. Startskärmen räknar mot det.`}
          </Text>
        </View>

        <SectionLabel>Dina planer</SectionLabel>
        <Text className="mb-4 mt-1.5 text-[13px] leading-[18px] text-muted">
          En plan är en sparad ordning, inte ett schema. Du kan alltid logga något som inte står
          i den.
        </Text>

        {loading ? (
          <Loading />
        ) : routines.length === 0 && !adding ? (
          <Empty
            icon="clipboard"
            title="Inga planer än"
            body="Skapa en plan för ett pass du brukar köra, till exempel Överkropp eller Ben."
          />
        ) : (
          <View className="gap-2">
            {routines.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: "/routine/[id]", params: { id: r.id } })}
                accessibilityRole="button"
                className="flex-row items-center gap-3 rounded-[15px] border border-line bg-card px-4 active:opacity-70"
                style={{ minHeight: 68 }}
              >
                <View className="flex-1">
                  <Text className="text-[17px] font-semibold text-ink">{r.name}</Text>
                  <Text className="mt-0.5 text-[13px] text-muted">
                    {r.itemCount === 0
                      ? "Inga övningar än"
                      : `${r.itemCount} ${r.itemCount === 1 ? "övning" : "övningar"}`}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}

        {adding ? (
          <View className="mt-3 flex-row gap-2">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="t.ex. Överkropp"
              placeholderTextColor={colors.muted}
              autoFocus
              onSubmitEditing={create}
              returnKeyType="done"
              className="flex-1 rounded-[15px] border border-line bg-card px-4 text-[17px] text-ink"
              style={{ minHeight: 58 }}
            />
            <View style={{ width: 104, justifyContent: "center" }}>
              <Button label="Skapa" variant="secondary" onPress={create} loading={busy} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {!adding ? (
        <View className="border-t border-line px-4 pb-2 pt-3">
          <Button label="Ny plan" icon="plus" variant="secondary" onPress={() => setAdding(true)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
