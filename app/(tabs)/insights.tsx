import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getExercise,
  monthlyTotals,
  recentPbs,
  useStore,
  weekSummary,
  type MonthTotals,
} from "@/lib/db";
import { FillBar } from "@/components/FillBar";
import { Card, Empty, Loading, SectionLabel, StatTile } from "@/components/ui";
import { addDaysIso, describeMonth, monthName, monthSpanDays, startOfWeekIso, toMonthKey } from "@/lib/dates";
import { fmtVolume, fmtWeight } from "@/lib/format";
import { colors, radius, tint } from "@/lib/theme";

type Pb = { name: string; weightKg: number; deltaKg: number };

/** Hur många månader bakåt snittet får bygga på. */
const COMPARE_MONTHS = 6;

const EMPTY_MONTH = (month: string): MonthTotals => ({ month, sessions: 0, volumeKg: 0, sets: 0 });

/**
 * "Följ upp" — hur månaden går, och hur veckan ligger till.
 *
 * Månaden är rätt tidsfönster för "blir det gjort": en dålig vecka säger
 * ingenting, en dålig månad säger något. Veckan finns kvar längst ned för att
 * svara på tempot just nu.
 */
export default function InsightsScreen() {
  const store = useStore();

  const [week, setWeek] = useState({ sessions: 0, volumeKg: 0, prevVolumeKg: 0 });
  const [months, setMonths] = useState<MonthTotals[]>([]);
  const [monthKey, setMonthKey] = useState(() => toMonthKey());
  const [pbs, setPbs] = useState<Pb[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusKey, setFocusKey] = useState(0);

  const load = useCallback(async () => {
    setWeek(await weekSummary(store, startOfWeekIso()));

    const now = new Date();
    const span = monthSpanDays(now.getFullYear(), now.getMonth(), COMPARE_MONTHS);
    setMonths(await monthlyTotals(store, span.from, span.to));
    setMonthKey(toMonthKey(now));

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

  const current = months.find((m) => m.month === monthKey) ?? EMPTY_MONTH(monthKey);
  // Bara månader som faktiskt har pass räknas in i snittet. Att dividera med
  // sex när appen funnits i två hade gjort varje jämförelse till en glädjekalkyl.
  const prior = months.filter((m) => m.month !== monthKey);

  const perSession = (m: MonthTotals) => (m.sessions > 0 ? m.volumeKg / m.sessions : 0);
  const avg = (pick: (m: MonthTotals) => number) =>
    prior.length === 0 ? null : prior.reduce((sum, m) => sum + pick(m), 0) / prior.length;

  const basis =
    prior.length === 1 ? describeMonth(prior[0].month) : `snittet av ${prior.length} mån`;

  /** Jämförelsetexten under en bricka — utelämnas när underlaget saknas. */
  function versus(value: number, average: number | null) {
    if (average === null || average <= 0) return {};
    const share = value / average;
    const pct = Math.round(Math.abs(share - 1) * 100);
    if (pct === 0) return { note: `Som ${basis}`, tone: "neutral" as const };
    return {
      note: `${share >= 1 ? "+" : "−"}${pct} % mot ${basis}`,
      tone: share >= 1 ? ("up" as const) : ("down" as const),
    };
  }

  const hasPrev = week.prevVolumeKg > 0;
  const volumeShare = hasPrev ? week.volumeKg / week.prevVolumeKg : week.volumeKg > 0 ? 1 : 0;
  const volumeNote = hasPrev
    ? `${Math.round(volumeShare * 100)} % av förra veckans ${fmtVolume(week.prevVolumeKg)}`
    : "Ingen tidigare vecka att jämföra med än";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 28 }}>
        <Text className="pb-6 pt-2 text-3xl font-bold tracking-tight text-ink">Följ upp</Text>

        <SectionLabel>I {monthName(new Date().getMonth())}</SectionLabel>
        <View className="mt-3 gap-2.5">
          <View className="flex-row gap-2.5">
            <StatTile label="Pass" value={String(current.sessions)} {...versus(current.sessions, avg((m) => m.sessions))} />
            <StatTile
              label="Flyttat"
              value={fmtVolume(current.volumeKg)}
              {...versus(current.volumeKg, avg((m) => m.volumeKg))}
            />
          </View>
          <View className="flex-row gap-2.5">
            <StatTile label="Set" value={String(current.sets)} {...versus(current.sets, avg((m) => m.sets))} />
            <StatTile
              label="Per pass"
              value={current.sessions > 0 ? fmtVolume(perSession(current)) : "—"}
              {...versus(perSession(current), avg(perSession))}
            />
          </View>
        </View>
        <Text style={{ fontSize: 12.5, color: colors.mutedDim, marginTop: 10, lineHeight: 17 }}>
          {prior.length === 0
            ? "Första månaden med data. Jämförelsen dyker upp när det finns en månad att mäta mot."
            : `Jämfört med ${basis} — bara månader du faktiskt tränat räknas in.`}
        </Text>

        <View style={{ marginTop: 32 }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
            <SectionLabel>Den här veckan</SectionLabel>
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
