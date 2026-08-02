import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  createGym,
  getCurrentSession,
  getRoutine,
  listExercisesForGym,
  listGymsByRecentUse,
  listRoutines,
  matchesQuery,
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
import { Button, Chip, Empty, Loading, SearchField, SectionLabel } from "@/components/ui";
import { formatElapsed, relativeDay } from "@/lib/format";
import { colors } from "@/lib/theme";

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
  const [adding, setAdding] = useState(false);
  const [newGym, setNewGym] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await listGymsByRecentUse(store);
    setGyms(list);
    setRoutines(await listRoutines(store));
    // Förvalt: gymmet du tränade på senast. Oftast rätt, alltid ett tryck bort.
    setSelected((cur) => cur ?? list[0]?.id ?? null);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function addGym() {
    const name = newGym.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const id = await createGym(store, name);
      setNewGym("");
      setAdding(false);
      await load();
      setSelected(id);
    } finally {
      setBusy(false);
    }
  }

  async function begin(routineId: string | null) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await setActiveGym(store, selected);
      await startSession(store, selected, routineId);
      onStarted();
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
        <Text className="pb-1 pt-2 text-3xl font-bold tracking-tight text-ink">Gymma</Text>
        <Text className="mb-7 text-[14px] text-muted">Starta ett pass för att börja logga.</Text>

        <SectionLabel>Var tränar du?</SectionLabel>
        <View className="mt-3 gap-2">
          {gyms.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => setSelected(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === g.id }}
              className={`flex-row items-center justify-between rounded-[15px] border px-4 active:opacity-70 ${
                selected === g.id ? "border-accent bg-accent-soft" : "border-line bg-card"
              }`}
              style={{ minHeight: 62 }}
            >
              <View className="flex-1">
                <Text className="text-[17px] font-semibold text-ink">{g.name}</Text>
                <Text className="mt-0.5 text-[12.5px] text-muted">
                  {g.lastUsedAt ? `Senast ${relativeDay(g.lastUsedAt)}` : "Aldrig tränat här"}
                </Text>
              </View>
              {selected === g.id ? <Feather name="check" size={20} color={colors.accent} /> : null}
            </Pressable>
          ))}

          {adding ? (
            <View className="flex-row gap-2">
              <TextInput
                value={newGym}
                onChangeText={setNewGym}
                placeholder="Namn på gymmet"
                placeholderTextColor={colors.muted}
                autoFocus
                onSubmitEditing={addGym}
                returnKeyType="done"
                className="flex-1 rounded-[15px] border border-line bg-card px-4 text-[17px] text-ink"
                style={{ minHeight: 62 }}
              />
              <View style={{ width: 104, justifyContent: "center" }}>
                <Button label="Spara" variant="secondary" onPress={addGym} loading={busy} />
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              className="flex-row items-center gap-2 rounded-[15px] border border-dashed border-line px-4 active:opacity-60"
              style={{ minHeight: 54 }}
            >
              <Feather name="plus" size={17} color={colors.muted} />
              <Text className="text-[15px] text-muted">Nytt gym</Text>
            </Pressable>
          )}
        </View>

        {routines.length > 0 ? (
          <View className="mt-8">
            <SectionLabel>Följ en plan</SectionLabel>
            <View className="mt-3 gap-2">
              {routines.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => begin(r.id)}
                  disabled={!selected || busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Starta passet med planen ${r.name}`}
                  className="flex-row items-center gap-3 rounded-[15px] border border-line bg-card px-4 active:opacity-70"
                  style={{ minHeight: 64, opacity: selected ? 1 : 0.4 }}
                >
                  <Feather name="clipboard" size={18} color={colors.accent} />
                  <View className="flex-1">
                    <Text className="text-[16px] font-semibold text-ink">{r.name}</Text>
                    <Text className="mt-0.5 text-[12.5px] text-muted">
                      {r.itemCount === 0
                        ? "Inga övningar än"
                        : `${r.itemCount} ${r.itemCount === 1 ? "övning" : "övningar"}`}
                    </Text>
                  </View>
                  <Feather name="play" size={17} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-line px-5 pb-1 pt-3">
        <Button
          label="Kör på egen hand"
          icon="play"
          onPress={() => begin(null)}
          disabled={!selected}
          loading={busy}
        />
      </View>
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
