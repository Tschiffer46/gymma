import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  averageSessionMinutes,
  createGym,
  getCurrentSession,
  getExercise,
  getRoutine,
  lastUsedRoutine,
  listExercisesForGym,
  listGymsByRecentUse,
  listRoutines,
  matchesQuery,
  recentPbs,
  sessionSetCount,
  setActiveGym,
  skipExercise,
  skippedInSession,
  startSession,
  unskipExercise,
  usualWeekdays,
  useStore,
  weeklyTarget,
  weekSummary,
  type ExerciseListItem,
  type Gym,
  type RoutineSummary,
  type Session,
} from "@/lib/db";
import { ExerciseRow } from "@/components/ExerciseRow";
import { FillBar } from "@/components/FillBar";
import { StartSheet } from "@/components/StartSheet";
import { WeekRing } from "@/components/WeekRing";
import { Button, Chip, Empty, Loading, SearchField } from "@/components/ui";
import { addDaysIso, startOfWeekIso, weekdayName } from "@/lib/dates";
import { fmtVolume, fmtWeight, formatElapsed, numberWord } from "@/lib/format";
import { colors, radius, tint } from "@/lib/theme";

type GymWithUse = Gym & { lastUsedAt: string | null };

/**
 * "Gymma" — allt man gör i gymmet.
 *
 * Två lägen: utan pågående pass visas startvyn (var är du, hur vill du köra),
 * med pågående pass visas avbockningslistan och en passrad som räknar uppåt.
 */
export default function GymmaScreen() {
  const store = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const gyms = await listGymsByRecentUse(store);
    // Ett pass kan bara vara öppet på ett gym i taget, men vi vet inte vilket
    // förrän vi frågat — leta igenom dem alla.
    let open: Session | null = null;
    for (const g of gyms) {
      const s = await getCurrentSession(store, g.id);
      if (s) {
        open = s;
        break;
      }
    }
    setSession(open);
    setLoading(false);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, reloadKey]),
  );

  if (loading) return <Loading />;

  // Avslutas passet i /session/end navigerar den tillbaka hit, useFocusEffect
  // kör om load() och vyn faller tillbaka till StartSession av sig själv.
  return session ? (
    <ActiveSession session={session} />
  ) : (
    <StartSession onStarted={() => setReloadKey((k) => k + 1)} />
  );
}

// ---------------------------------------------------------------------------
// Utan pågående pass
// ---------------------------------------------------------------------------

function StartSession({ onStarted }: { onStarted: () => void }) {
  const store = useStore();

  const [gyms, setGyms] = useState<GymWithUse[]>([]);
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [week, setWeek] = useState({ sessions: 0, volumeKg: 0, prevVolumeKg: 0 });
  const [target, setTarget] = useState(2);
  const [usual, setUsual] = useState<number[]>([]);
  const [pb, setPb] = useState<{ name: string; weightKg: number; deltaKg: number } | null>(null);
  const [suggested, setSuggested] = useState<RoutineSummary | null>(null);
  const [suggestedMinutes, setSuggestedMinutes] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  const load = useCallback(async () => {
    const list = await listGymsByRecentUse(store);
    setGyms(list);
    setRoutines(await listRoutines(store));
    // Förvalt: gymmet du tränade på senast. Oftast rätt, alltid ett tryck bort.
    setSelected((cur) => cur ?? list[0]?.id ?? null);

    const nowIso = new Date().toISOString();
    const weekStart = startOfWeekIso();
    setWeek(await weekSummary(store, weekStart));
    setTarget(await weeklyTarget(store, weekStart));
    setUsual(await usualWeekdays(store, nowIso));

    // PB-raden visas bara för de senaste sju dagarna — ett rekord från i mars
    // är historia, inte nyhet.
    const pbs = await recentPbs(store, addDaysIso(nowIso, -7));
    const top = pbs[0];
    if (top) {
      const ex = await getExercise(store, top.exerciseId);
      setPb(ex ? { name: ex.name, weightKg: top.weightKg, deltaKg: top.deltaKg } : null);
    } else {
      setPb(null);
    }

    const last = await lastUsedRoutine(store);
    setSuggested(last);
    setSuggestedMinutes(last ? await averageSessionMinutes(store, last.id) : null);

    // Nytt värde ⇒ fyllnadsstaven spelas om varje gång vyn får fokus.
    setFocusKey((k) => k + 1);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function addGym(name: string) {
    const id = await createGym(store, name);
    await load();
    setSelected(id);
  }

  async function begin(routineId: string | null) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      setSheetOpen(false);
      await setActiveGym(store, selected);
      await startSession(store, selected, routineId);
      onStarted();
    } finally {
      setBusy(false);
    }
  }

  const gymName = gyms.find((g) => g.id === selected)?.name ?? "";
  const remaining = Math.max(0, target - week.sessions);
  const headline =
    remaining === 0
      ? "Målet är nått\nden här veckan"
      : `${numberWord(remaining)} pass kvar\nden här veckan`;

  const usualLine =
    usual.length === 2
      ? `${weekdayName(usual[0])} och ${weekdayName(usual[1]).toLowerCase()} är dina vanliga dagar.`
      : null;

  const hasPrev = week.prevVolumeKg > 0;
  const volumeShare = hasPrev ? week.volumeKg / week.prevVolumeKg : week.volumeKg > 0 ? 1 : 0;
  const volumeNote = hasPrev
    ? `${Math.round(volumeShare * 100)} % av förra veckans ${fmtVolume(week.prevVolumeKg)}`
    : "Ingen tidigare vecka att jämföra med än";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16 }}>
        <View className="flex-row items-center justify-between" style={{ paddingTop: 6 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              letterSpacing: 2.34,
              color: colors.accent,
              textTransform: "uppercase",
            }}
          >
            Gymma
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
            {gymName}
          </Text>
        </View>

        <View className="flex-row items-center" style={{ marginTop: 30, gap: 22 }}>
          <WeekRing done={week.sessions} target={target} />
          <View className="flex-1">
            <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.6, color: colors.ink }}>
              {headline}
            </Text>
            {usualLine ? (
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20 }}>
                {usualLine}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 34 }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 1.76,
                color: colors.muted,
                textTransform: "uppercase",
              }}
            >
              Volym den här veckan
            </Text>
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

        {pb ? (
          <View
            className="flex-row items-center"
            style={{
              marginTop: 20,
              paddingTop: 18,
              borderTopWidth: 1,
              borderTopColor: colors.cardHi,
              gap: 12,
            }}
          >
            <View
              className="items-center justify-center"
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.pill,
                backgroundColor: tint.ok,
              }}
            >
              <Feather name="trending-up" size={19} color={colors.ok} />
            </View>
            <View className="flex-1">
              <Text style={{ fontSize: 15.5, fontWeight: "600", color: colors.ink }}>
                {pb.name} {fmtWeight(pb.weightKg)} kg
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                {pb.deltaKg > 0
                  ? `Nytt bästa på den maskinen · +${fmtWeight(pb.deltaKg)} kg`
                  : "Första gången på den maskinen"}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingBottom: 4, gap: 10 }}>
        <Pressable
          onPress={() => begin(suggested?.id ?? null)}
          disabled={!selected || busy}
          accessibilityRole="button"
          accessibilityLabel={suggested ? `Starta ${suggested.name}` : "Starta pass"}
          className="flex-row items-center bg-accent active:opacity-80"
          style={{
            height: 64,
            borderRadius: radius.lg,
            paddingHorizontal: 20,
            gap: 14,
            opacity: selected ? 1 : 0.4,
          }}
        >
          <Feather name="play" size={19} color={colors.white} />
          <View className="flex-1">
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.white }}>
              {suggested ? `Starta ${suggested.name}` : "Starta pass"}
            </Text>
            <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>
              {suggested
                ? [
                    `${suggested.itemCount} ${suggested.itemCount === 1 ? "övning" : "övningar"}`,
                    suggestedMinutes ? `ca ${suggestedMinutes} min` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Kör på egen hand"}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-60"
          style={{ minHeight: 44 }}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>
            {suggested ? "Byt plan · Kör på egen hand" : "Välj gym eller plan"}
          </Text>
        </Pressable>
      </View>

      <StartSheet
        open={sheetOpen}
        gyms={gyms}
        routines={routines}
        selectedGymId={selected}
        onSelectGym={setSelected}
        onAddGym={addGym}
        onStart={begin}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}


// ---------------------------------------------------------------------------
// Med pågående pass
// ---------------------------------------------------------------------------

function ActiveSession({ session }: { session: Session }) {
  const store = useStore();
  const router = useRouter();

  const [items, setItems] = useState<ExerciseListItem[]>([]);
  const [gymName, setGymName] = useState("");
  const [routineName, setRoutineName] = useState<string | null>(null);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [sets, setSets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(Date.now());

  // Passraden räknar uppåt. En gång i halvminuten räcker — vi visar inte sekunder.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const gyms = await listGymsByRecentUse(store);
    setGymName(gyms.find((g) => g.id === session.gymId)?.name ?? "");

    let ids: string[] = [];
    if (session.routineId) {
      const r = await getRoutine(store, session.routineId);
      setRoutineName(r?.name ?? null);
      ids = r?.items.map((i) => i.exercise.id) ?? [];
      setPlanIds(ids);
    }

    // Planens övningar skickas med så de syns även om maskinen inte står på
    // just det här gymmet — annars ser planen ut att ha tappat rader.
    setItems(await listExercisesForGym(store, session.gymId, session.id, ids));
    setSkipped(await skippedInSession(store, session.id));
    setSets(await sessionSetCount(store, session.id));
    setLoading(false);
  }, [store, session.gymId, session.id, session.routineId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const done = items.filter((i) => i.doneToday).length;

  // I planläget styr planens ordning; annars listans egen sortering
  // (ej körda först, därefter senast använd).
  const hasPlan = planIds.length > 0;
  const inPlanMode = hasPlan && !showAll;
  const byId = new Map(items.map((i) => [i.exercise.id, i]));
  const skippedSet = new Set(skipped);

  const ordered = inPlanMode
    ? planIds.map((pid) => byId.get(pid)).filter((i): i is ExerciseListItem => !!i)
    : items;

  // Överhoppade sjunker till botten i stället för att försvinna, så det går att
  // ångra sig när maskinen blir ledig.
  const visible = [...ordered]
    .filter((i) => matchesQuery(i.exercise, query))
    .sort((a, b) => Number(skippedSet.has(a.exercise.id)) - Number(skippedSet.has(b.exercise.id)));

  // Överhoppade räknas som avklarade i "3/5 i planen" — annars ser planen
  // aldrig färdig ut trots att man är klar för dagen.
  const planDone = planIds.filter(
    (pid) => byId.get(pid)?.doneToday || skippedSet.has(pid),
  ).length;

  async function toggleSkip(exerciseId: string) {
    Haptics.selectionAsync();
    if (skippedSet.has(exerciseId)) await unskipExercise(store, session.id, exerciseId);
    else await skipExercise(store, session.id, exerciseId);
    await load();
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-3 border-b border-line px-4 pb-3 pt-1">
        <View className="flex-1">
          <Text className="text-[17px] font-bold text-ink" numberOfLines={1}>
            {routineName ? `${gymName} · ${routineName}` : gymName}
          </Text>
          <Text className="mt-0.5 text-[13px] text-muted">
            {formatElapsed(session.startedAt, tick)} · {sets} set ·{" "}
            {hasPlan ? `${planDone}/${planIds.length} i planen` : `${done} övningar`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/session/end")}
          accessibilityRole="button"
          accessibilityLabel="Avsluta passet"
          className="rounded-full border border-accent px-4 active:opacity-70"
          style={{ minHeight: 42, justifyContent: "center" }}
        >
          <Text className="text-[14px] font-semibold" style={{ color: colors.accent }}>
            Avsluta
          </Text>
        </Pressable>
      </View>

      {/* Designprincip 4: planen är en genväg, aldrig en grind. Man ska alltid
          kunna gå ur den och logga något som inte står med. */}
      {hasPlan ? (
        <View className="flex-row gap-2 px-4 pt-3">
          <Chip label="Planen" active={!showAll} onPress={() => setShowAll(false)} />
          <Chip label="Alla övningar" active={showAll} onPress={() => setShowAll(true)} />
        </View>
      ) : null}

      {/* Sök visas bara i den långa listan. I planläget är raderna få och
          ordningen är hela poängen. */}
      {!inPlanMode ? (
        <View className="px-4 pt-3">
          <SearchField value={query} onChange={setQuery} />
        </View>
      ) : null}

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => i.exercise.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <ExerciseRow
              item={item}
              skipped={skippedSet.has(item.exercise.id)}
              onToggleSkip={inPlanMode ? () => toggleSkip(item.exercise.id) : undefined}
              onPress={() =>
                router.push({
                  pathname: "/log/[exerciseId]",
                  params: { exerciseId: item.exercise.id },
                })
              }
            />
          )}
          ListEmptyComponent={
            query ? (
              <Empty
                icon="search"
                title="Ingen träff"
                body={`Ingen övning matchar "${query}". Sök funkar på både svenska och engelska namn.`}
              />
            ) : (
              <Empty
                icon="list"
                title="Inga övningar här än"
                body="Lägg till den första maskinen eller övningen så börjar biblioteket byggas."
              />
            )
          }
        />
      )}

      {/* Tumzonen: den enda knappen som inte är en övning ligger längst ned. */}
      <View className="border-t border-line px-4 pb-2 pt-3">
        <Button
          label="Ny övning eller maskin"
          icon="plus"
          variant="secondary"
          onPress={() => router.push("/exercise/new")}
        />
      </View>
    </SafeAreaView>
  );
}
