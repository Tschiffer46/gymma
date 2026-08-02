import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  createGym,
  getCurrentSession,
  listExercisesForGym,
  listGymsByRecentUse,
  sessionSetCount,
  setActiveGym,
  startSession,
  useStore,
  type ExerciseListItem,
  type Gym,
  type Session,
} from "@/lib/db";
import { ExerciseRow } from "@/components/ExerciseRow";
import { Button, Empty, Loading, SectionLabel } from "@/components/ui";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newGym, setNewGym] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await listGymsByRecentUse(store);
    setGyms(list);
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

  async function begin() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await setActiveGym(store, selected);
      await startSession(store, selected);
      onStarted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <View className="flex-1 px-5">
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
      </View>

      <View className="gap-2 border-t border-line px-5 pb-1 pt-3">
        <Button
          label="Kör på egen hand"
          icon="play"
          onPress={begin}
          disabled={!selected}
          loading={busy}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          className="flex-row items-center justify-center gap-2 rounded-[12px] border border-line"
          style={{ minHeight: 54, opacity: 0.4 }}
        >
          <Feather name="clipboard" size={17} color={colors.muted} />
          <Text className="text-base font-semibold text-muted">Följ en plan — kommer snart</Text>
        </Pressable>
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
    setItems(await listExercisesForGym(store, session.gymId, session.id));
    setSets(await sessionSetCount(store, session.id));
    setLoading(false);
  }, [store, session.gymId, session.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const done = items.filter((i) => i.doneToday).length;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-3 border-b border-line px-4 pb-3 pt-1">
        <View className="flex-1">
          <Text className="text-[17px] font-bold text-ink" numberOfLines={1}>
            {gymName}
          </Text>
          <Text className="mt-0.5 text-[13px] text-muted">
            {formatElapsed(session.startedAt, tick)} · {sets} set · {done} övningar
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

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.exercise.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <ExerciseRow
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/log/[exerciseId]",
                  params: { exerciseId: item.exercise.id },
                })
              }
            />
          )}
          ListEmptyComponent={
            <Empty
              icon="list"
              title="Inga övningar här än"
              body="Lägg till den första maskinen eller övningen så börjar biblioteket byggas."
            />
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
