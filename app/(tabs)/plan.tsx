import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  createRoutine,
  listPlannedDayPlans,
  listRoutines,
  migrateTrainingDaysToPlannedDays,
  setPlannedDay,
  setPlannedDayRoutine,
  trainedDays,
  useStore,
  type PlannedDayPlan,
  type RoutineSummary,
} from "@/lib/db";
import { MonthCalendar } from "@/components/MonthCalendar";
import { Button, Chip, Empty, Loading, SectionLabel } from "@/components/ui";
import { describeDay, monthName, toDayKey } from "@/lib/dates";
import { colors, radius } from "@/lib/theme";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [plans, setPlans] = useState<PlannedDayPlan[]>([]);
  const [trained, setTrained] = useState<Set<string>>(new Set());
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRoutines(await listRoutines(store));

    // Engångskonvertering av de gamla återkommande veckodagarna, så valet inte
    // bara försvinner vid uppdateringen. Rör ingenting när kalendern används.
    await migrateTrainingDaysToPlannedDays(store, toDayKey());

    // Hämta ett brett intervall så månadsbyte inte kräver ett nytt anrop.
    const from = `${month.year - 1}-01-01`;
    const to = `${month.year + 1}-12-31`;
    setPlans(await listPlannedDayPlans(store, from, to));
    setTrained(new Set(await trainedDays(store, from, to)));
    setLoading(false);
  }, [store, month.year]);

  const planned = new Set(plans.map((p) => p.day));

  async function toggleDay(day: string) {
    const isPlanned = planned.has(day);
    await setPlannedDay(store, day, !isPlanned);
    if (isPlanned && openDay === day) setOpenDay(null);
    await load();
  }

  async function chooseRoutine(day: string, routineId: string | null) {
    await setPlannedDayRoutine(store, day, routineId);
    setOpenDay(null);
    await load();
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

  const today = toDayKey();
  const nextPlanned = plans.map((p) => p.day).filter((d) => d >= today)[0] ?? null;

  // Bara dagar man fortfarande kan påverka, i den månad kalendern visar. Att
  // välja pass för en dag som redan varit säger ingenting om vad man ska göra.
  const monthPrefix = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
  const upcoming = plans.filter((p) => p.day.startsWith(monthPrefix) && p.day >= today);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="pb-1 pt-2 text-3xl font-bold tracking-tight text-ink">Planera</Text>

        {/* Träningsdagarna först: de svarar på NÄR, rutinerna på VAD. */}
        <View className="mb-9 mt-4">
          <SectionLabel>Vilka dagar tänker du träna?</SectionLabel>
          <Text className="mb-4 mt-1.5 text-[13px] leading-[18px] text-muted">
            Tryck på dagarna i kalendern. Passerade dagar går inte att planera — grönt är dagar
            du faktiskt tränat.
          </Text>
          <MonthCalendar
            year={month.year}
            month={month.month}
            planned={planned}
            trained={trained}
            onToggle={toggleDay}
            onChangeMonth={(year, m) => setMonth({ year, month: m })}
          />
          <Text className="mt-4 text-[13px] leading-[18px] text-muted">
            {nextPlanned
              ? `Nästa planerade pass: ${describeDay(nextPlanned)}.`
              : "Inget planerat framåt än. Startskärmen visar nästa dag när du valt någon."}
          </Text>
        </View>

        {/* Vilket pass du tänkt köra en viss dag. Frivilligt: en planerad dag
            utan pass är ett fullgott läge, och startskärmen faller då tillbaka
            på snabbstarten. */}
        <View className="mb-9">
          <SectionLabel>Vilket pass, vilken dag?</SectionLabel>
          <Text className="mb-4 mt-1.5 text-[13px] leading-[18px] text-muted">
            {upcoming.length === 0
              ? `Inga kommande dagar valda i ${monthName(month.month)}. Välj dagar i kalendern ovan först.`
              : "Tryck på en dag för att välja plan. Hoppar du över valet startar du med snabbstarten i stället."}
          </Text>

          <View className="gap-2">
            {upcoming.map((p) => (
              <View key={p.day}>
                <Pressable
                  onPress={() => setOpenDay(openDay === p.day ? null : p.day)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openDay === p.day }}
                  accessibilityLabel={`${describeDay(p.day)}, ${p.routineName ?? "inget pass valt"}`}
                  className="flex-row items-center gap-3 border border-line bg-card px-4 active:opacity-70"
                  style={{ minHeight: 62, borderRadius: radius.md }}
                >
                  <View className="flex-1">
                    <Text style={{ fontSize: 15.5, fontWeight: "600", color: colors.ink }}>
                      {capitalize(describeDay(p.day))}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        marginTop: 2,
                        color: p.routineName ? colors.accent : colors.mutedDim,
                      }}
                    >
                      {p.routineName ?? "Inget pass valt"}
                    </Text>
                  </View>
                  <Feather
                    name={openDay === p.day ? "chevron-up" : "chevron-down"}
                    size={19}
                    color={colors.muted}
                  />
                </Pressable>

                {openDay === p.day ? (
                  <View className="mt-2 flex-row flex-wrap gap-2 px-1">
                    {routines.map((r) => (
                      <Chip
                        key={r.id}
                        label={r.name}
                        active={p.routineId === r.id}
                        onPress={() => chooseRoutine(p.day, p.routineId === r.id ? null : r.id)}
                      />
                    ))}
                    {routines.length === 0 ? (
                      <Text className="py-2 text-[13px] text-muted">
                        Du har inga planer än. Skapa en nedan, så går den att välja här.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
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
