import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getExercise,
  listPlannedDays,
  recentPbs,
  trainedDays,
  useStore,
  weekSummary,
} from "@/lib/db";
import { FillBar } from "@/components/FillBar";
import { Card, Empty, Loading, SectionLabel } from "@/components/ui";
import { WEEKDAYS_MONDAY_FIRST, addDaysIso, startOfWeekIso, toDayKey } from "@/lib/dates";
import { fmtVolume, fmtWeight } from "@/lib/format";
import { colors, radius, tint } from "@/lib/theme";

type Pb = { name: string; weightKg: number; deltaKg: number };

/**
 * "Följ upp" — hur veckan gick.
 *
 * Volymen och rekorden låg tidigare på startskärmen, där de konkurrerade med
 * det man faktiskt kom för att göra. De hör hemma här: startskärmen är till för
 * att komma igång, den här fliken för att se tillbaka.
 */
export default function InsightsScreen() {
  const store = useStore();

  const [week, setWeek] = useState({ sessions: 0, volumeKg: 0, prevVolumeKg: 0 });
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [trained, setTrained] = useState<Set<string>>(new Set());
  const [planned, setPlanned] = useState<Set<string>>(new Set());
  const [pbs, setPbs] = useState<Pb[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusKey, setFocusKey] = useState(0);

  const load = useCallback(async () => {
    const weekStart = startOfWeekIso();
    setWeek(await weekSummary(store, weekStart));
    // Veckans sju datum, så raden kan visa både planerat och utfört per dag.
    const keys = Array.from({ length: 7 }, (_, i) =>
      toDayKey(new Date(Date.parse(addDaysIso(weekStart, i)))),
    );
    setWeekDays(keys);
    setTrained(new Set(await trainedDays(store, keys[0], keys[6])));
    setPlanned(new Set(await listPlannedDays(store, keys[0], keys[6])));

    const found = await recentPbs(store, addDaysIso(new Date().toISOString(), -14));
    const named: Pb[] = [];
    for (const p of found.slice(0, 5)) {
      const ex = await getExercise(store, p.exerciseId);
      if (ex) named.push({ name: ex.name, weightKg: p.weightKg, deltaKg: p.deltaKg });
    }
    setPbs(named);

    setLoading(false);
    // Nytt värde ⇒ fyllnadsstaven spelas om varje gång vyn får fokus.
    setFocusKey((k) => k + 1);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loading />;

  const today = toDayKey();
  const hasPrev = week.prevVolumeKg > 0;
  const volumeShare = hasPrev ? week.volumeKg / week.prevVolumeKg : week.volumeKg > 0 ? 1 : 0;
  const volumeNote = hasPrev
    ? `${Math.round(volumeShare * 100)} % av förra veckans ${fmtVolume(week.prevVolumeKg)}`
    : "Ingen tidigare vecka att jämföra med än";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 28 }}>
        <Text className="pb-6 pt-2 text-3xl font-bold tracking-tight text-ink">Följ upp</Text>

        <SectionLabel>Den här veckan</SectionLabel>
        <View className="mt-3 flex-row" style={{ gap: 6 }}>
          {WEEKDAYS_MONDAY_FIRST.map(({ dow, short }, i) => {
            const day = weekDays[i] ?? "";
            const didTrain = trained.has(day);
            const isPlanned = planned.has(day);
            const isToday = day === today;
            return (
              <View key={dow} className="flex-1 items-center">
                <View
                  className="w-full items-center justify-center"
                  style={{
                    height: 46,
                    borderRadius: radius.sm,
                    backgroundColor: didTrain ? colors.ok : isToday ? colors.accentSoft : colors.card,
                    borderWidth: isToday && !didTrain ? 2 : isPlanned && !didTrain ? 1 : 0,
                    borderColor: isToday ? colors.accent : colors.line,
                  }}
                >
                  {didTrain ? <Feather name="check" size={17} color={colors.bg} /> : null}
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    marginTop: 6,
                    color: isToday ? colors.accent : didTrain ? colors.muted : colors.mutedDim,
                  }}
                >
                  {short}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={{ fontSize: 12.5, color: colors.mutedDim, marginTop: 10 }}>
          {planned.size > 0
            ? `${trained.size} av ${planned.size} planerade pass avklarade.`
            : `${week.sessions} pass den här veckan. Planera dagar i Planera-fliken.`}
        </Text>

        <View style={{ marginTop: 32 }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
            <SectionLabel>Volym</SectionLabel>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "600",
                color: colors.ink,
                fontVariant: ["tabular-nums"],
              }}
            >
              {fmtVolume(week.volumeKg)}
            </Text>
          </View>
          <FillBar share={volumeShare} replayKey={focusKey} />
          <Text style={{ fontSize: 12.5, color: colors.mutedDim, marginTop: 8 }}>{volumeNote}</Text>
        </View>

        <View style={{ marginTop: 32 }}>
          <SectionLabel>Senaste rekorden</SectionLabel>
          {pbs.length === 0 ? (
            <Empty
              icon="trending-up"
              title="Inga nya rekord"
              body="Rekord de senaste två veckorna dyker upp här. De räknas per maskin — 50 kg på en bröstpress är inte 50 kg på en annan."
            />
          ) : (
            <View className="mt-3 gap-2">
              {pbs.map((p) => (
                <Card key={`${p.name}-${p.weightKg}`} className="flex-row items-center gap-3 px-4 py-3.5">
                  <View
                    className="items-center justify-center"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.pill,
                      backgroundColor: tint.ok,
                    }}
                  >
                    <Feather name="trending-up" size={18} color={colors.ok} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ fontSize: 15.5, fontWeight: "600", color: colors.ink }}>
                      {p.name} {fmtWeight(p.weightKg)} kg
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                      {p.deltaKg > 0
                        ? `Nytt bästa på den maskinen · +${fmtWeight(p.deltaKg)} kg`
                        : "Första gången på den maskinen"}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 32 }}>
          Progression per maskin och träningsfrekvens över tid kommer härnäst. All data du
          loggat räknas — kurvorna får historik från första passet när de kopplas på.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
