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
  getRoutine,
  listPlannedDays,
  listTopGyms,
  listTopRoutines,
  nextPlannedDay,
  lastUsedRoutine,
  listExercisesForGym,
  listGymsByRecentUse,
  listRoutines,
  matchesQuery,
  plannedRoutineForDay,
  trainedDays,
  sessionSetCount,
  setActiveGym,
  skipExercise,
  skippedInSession,
  startSession,
  unskipExercise,
  useStore,
  type ExerciseListItem,
  type Gym,
  type RoutineSummary,
  type Session,
} from "@/lib/db";
import { ExerciseRow } from "@/components/ExerciseRow";
import { StartSheet } from "@/components/StartSheet";
import { WeekRing } from "@/components/WeekRing";
import { Button, Chip, Empty, Loading, SearchField, SectionLabel } from "@/components/ui";
import {
  addDaysIso,
  daysBetween,
  describeDay,
  greeting,
  startOfWeekIso,
  toDayKey,
} from "@/lib/dates";
import { formatElapsed } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

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
  const [topGyms, setTopGyms] = useState<Gym[]>([]);
  const [topRoutines, setTopRoutines] = useState<RoutineSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // `undefined` = inte valt än (då styr planen/senast körda), `null` = på egen hand.
  const [routineId, setRoutineId] = useState<string | null | undefined>(undefined);
  const [todayPlan, setTodayPlan] = useState<RoutineSummary | null>(null);
  const [plannedThisWeek, setPlannedThisWeek] = useState<string[]>([]);
  const [trainedThisWeek, setTrainedThisWeek] = useState<string[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await listGymsByRecentUse(store);
    setGyms(list);
    setRoutines(await listRoutines(store));
    setTopGyms(await listTopGyms(store, 3));
    setTopRoutines(await listTopRoutines(store, 3));
    // Förvalt: gymmet du tränade på senast. Oftast rätt, alltid ett tryck bort.
    setSelected((cur) => cur ?? list[0]?.id ?? null);

    // Veckan går måndag–söndag; ringen räknar planerade pass i just den veckan.
    const weekStart = startOfWeekIso();
    const from = toDayKey(new Date(Date.parse(weekStart)));
    const to = toDayKey(new Date(Date.parse(addDaysIso(weekStart, 6))));
    setPlannedThisWeek(await listPlannedDays(store, from, to));
    setTrainedThisWeek(await trainedDays(store, from, to));
    setNext(await nextPlannedDay(store, toDayKey()));

    // Dagens plan vinner över senast körda: har du bestämt vad idag ska vara
    // är det svaret på "vad ska jag köra".
    const forToday = await plannedRoutineForDay(store, toDayKey());
    setTodayPlan(forToday);
    const fallback = forToday ?? (await lastUsedRoutine(store));
    setRoutineId((cur) => (cur === undefined ? (fallback?.id ?? null) : cur));
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const chosen = routineId ? (routines.find((r) => r.id === routineId) ?? null) : null;

  // Snittlängden hör till den valda planen och måste hämtas om när valet byts.
  useEffect(() => {
    let alive = true;
    if (!chosen) {
      setMinutes(null);
      return;
    }
    averageSessionMinutes(store, chosen.id).then((m) => {
      if (alive) setMinutes(m);
    });
    return () => {
      alive = false;
    };
  }, [store, chosen?.id]);

  async function addGym(name: string) {
    const id = await createGym(store, name);
    await load();
    setSelected(id);
  }

  async function begin(id: string | null) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      setSheetOpen(false);
      await setActiveGym(store, selected);
      await startSession(store, selected, id);
      onStarted();
    } finally {
      setBusy(false);
    }
  }

  // Målet är dagarna DU planerat i kalendern, inte ett härlett tal. Det är
  // hela poängen: ett osynligt mål går inte att ifrågasätta.
  const today = toDayKey();
  const doneThisWeek = trainedThisWeek.length;
  const targetThisWeek = plannedThisWeek.length;
  const daysUntilNext = next ? daysBetween(today, next) : null;
  const trainedToday = trainedThisWeek.includes(today);

  const headline =
    next === null
      ? "Inget planerat\nframåt"
      : daysUntilNext === 0
        ? trainedToday
          ? "Klart\nför idag"
          : "Idag är en\nträningsdag"
        : daysUntilNext === 1
          ? "Nästa pass\nimorgon"
          : `Nästa pass\n${describeDay(next).split(" ")[0]}`;

  const sub =
    next === null
      ? "Gå till Planera och välj dagar i kalendern."
      : daysUntilNext === 0
        ? trainedToday
          ? "Ett pass loggat idag. Nästa gång enligt din plan."
          : todayPlan
            ? `Enligt planen: ${todayPlan.name}.`
            : "Enligt din plan i kalendern."
        : `${describeDay(next)} — om ${daysUntilNext} ${daysUntilNext === 1 ? "dag" : "dagar"}.`;

  // Snabbstarten visar de vanligaste valen, men aldrig på bekostnad av det som
  // faktiskt är valt: dagens plan och den aktuella markeringen läggs alltid
  // till om de saknas. Resten når man via bottenarket.
  const gymChips = withSelection(topGyms, gyms.find((g) => g.id === selected));
  const routineChips = withSelection(
    todayPlan ? withSelection(topRoutines, todayPlan) : topRoutines,
    chosen,
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16 }}>
        <View style={{ paddingTop: 6 }}>
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
          <Text style={{ fontSize: 15, color: colors.muted, marginTop: 6 }}>{greeting()}</Text>
        </View>

        <View className="flex-row items-center" style={{ marginTop: 24, gap: 18 }}>
          {targetThisWeek > 0 ? (
            <WeekRing done={doneThisWeek} target={targetThisWeek} size={88} />
          ) : null}
          <View className="flex-1">
            <Text style={{ fontSize: 23, fontWeight: "700", letterSpacing: -0.6, color: colors.ink }}>
              {headline}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 7, lineHeight: 20 }}>
              {sub}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 28 }}>
          <SectionLabel>Var tränar du?</SectionLabel>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {gymChips.map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                active={selected === g.id}
                onPress={() => setSelected(g.id)}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 22 }}>
          <SectionLabel>Vilket pass?</SectionLabel>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {routineChips.map((r) => (
              <Chip
                key={r.id}
                label={todayPlan?.id === r.id ? `${r.name} · idag` : r.name}
                active={routineId === r.id}
                onPress={() => setRoutineId(r.id)}
              />
            ))}
            <Chip
              label="På egen hand"
              active={routineId === null}
              onPress={() => setRoutineId(null)}
            />
          </View>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingBottom: 4, gap: 10 }}>
        <Pressable
          onPress={() => begin(routineId ?? null)}
          disabled={!selected || busy}
          accessibilityRole="button"
          accessibilityLabel={chosen ? `Starta ${chosen.name}` : "Starta pass"}
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
              {chosen ? `Starta ${chosen.name}` : "Starta pass"}
            </Text>
            <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>
              {[
                gyms.find((g) => g.id === selected)?.name,
                chosen
                  ? `${chosen.itemCount} ${chosen.itemCount === 1 ? "övning" : "övningar"}`
                  : "På egen hand",
                chosen && minutes ? `ca ${minutes} min` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
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
            Fler gym och planer
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

/**
 * Lägger till det valda alternativet i snabbstartens lista om det inte redan
 * finns där. Utan det skulle en markering kunna hamna utanför chipsen och se
 * ut att ha försvunnit.
 */
function withSelection<T extends { id: string }>(top: T[], selected: T | null | undefined): T[] {
  if (!selected || top.some((t) => t.id === selected.id)) return top;
  return [selected, ...top];
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
