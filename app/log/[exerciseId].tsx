import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  deleteSet,
  getActiveGym,
  getCurrentSession,
  getExercise,
  getMachine,
  getOrOpenSession,
  lastSets,
  logSet,
  recentPerformances,
  setsInSession,
  setWeightStep,
  useStore,
  weightStepFor,
  type Exercise,
  type Machine,
  type PastPerformance,
  type Session,
  type SetEntry,
} from "@/lib/db";
import { Button, Loading, Stepper } from "@/components/ui";
import { fmtWeight, formatSets, relativeDay, weightUnitLabel } from "@/lib/format";
import { colors } from "@/lib/theme";

/** Viktmagasin går i olika steg. Tre val räcker och slipper tangentbordet. */
const STEP_OPTIONS = [2.5, 5, 10];

type PrevSet = { weightKg: number; reps: number; setIndex: number };

/**
 * Väljer förifyllningen för nästa set.
 *
 * Prioritet enligt specen: förra passets *motsvarande* set (samma set-index).
 * Saknas det behålls det man senast gjorde — antingen i det pågående passet
 * eller sista setet förra gången. Först därefter faller vi tillbaka på ett
 * default, och det händer bara allra första gången en övning körs.
 */
function prefillFor(
  nextIndex: number,
  prev: PrevSet[],
  current: SetEntry[],
  exercise: Exercise,
): { weightKg: number; reps: number } {
  const corresponding = prev.find((s) => s.setIndex === nextIndex);
  if (corresponding) return { weightKg: corresponding.weightKg, reps: corresponding.reps };

  const lastInSession = current[current.length - 1];
  if (lastInSession) return { weightKg: lastInSession.weightKg, reps: lastInSession.reps };

  const lastPrev = prev[prev.length - 1];
  if (lastPrev) return { weightKg: lastPrev.weightKg, reps: lastPrev.reps };

  return { weightKg: exercise.weightUnit === "per_hand" ? 10 : 20, reps: 10 };
}

export default function LogScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const store = useStore();
  const router = useRouter();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);
  const [prev, setPrev] = useState<PrevSet[]>([]);
  const [history, setHistory] = useState<PastPerformance[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(10);
  const [step, setStep] = useState(5);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gym = await getActiveGym(store);
      const ex = await getExercise(store, exerciseId);
      if (!ex || !gym) {
        if (!cancelled) setLoading(false);
        return;
      }
      const m = await getMachine(store, ex.id, gym.id);
      const cur = await getCurrentSession(store, gym.id);
      const previous = await lastSets(store, ex.id, cur?.id ?? null);
      const past = await recentPerformances(store, ex.id, cur?.id ?? null, 3);
      const inSession = cur ? await setsInSession(store, cur.id, ex.id) : [];
      const fill = prefillFor(inSession.length + 1, previous, inSession, ex);

      if (cancelled) return;
      setExercise(ex);
      setMachine(m);
      setGymName(gym.name);
      setPrev(previous);
      setHistory(past);
      setSession(cur);
      setSets(inSession);
      setStep(weightStepFor(ex, m));
      setWeight(fill.weightKg);
      setReps(fill.reps);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [store, exerciseId]);

  const save = useCallback(async () => {
    if (!exercise || busy) return;
    setBusy(true);
    try {
      const gym = await getActiveGym(store);
      if (!gym) return;
      // Passet öppnas här, aldrig från listan — appen skapar inga tomma pass
      // bara för att man tittar in.
      const s = session ?? (await getOrOpenSession(store, gym.id));
      const entry = await logSet(store, {
        sessionId: s.id,
        exerciseId: exercise.id,
        machineId: machine?.id ?? null,
        weightKg: weight,
        reps,
        setIndex: sets.length + 1,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const nextSets = [...sets, entry];
      setSession(s);
      setSets(nextSets);

      // Förifyll nästa set från förra passets motsvarande set om det finns —
      // annars står värdena kvar, vilket är rätt för raka set.
      const fill = prefillFor(nextSets.length + 1, prev, nextSets, exercise);
      setWeight(fill.weightKg);
      setReps(fill.reps);
    } finally {
      setBusy(false);
    }
  }, [exercise, machine, session, sets, prev, weight, reps, store, busy]);

  async function undoLast() {
    const last = sets[sets.length - 1];
    if (!last) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await deleteSet(store, last.id);
    setSets(sets.slice(0, -1));
  }

  async function chooseStep(next: number) {
    if (!exercise) return;
    Haptics.selectionAsync();
    setStep(next);
    await setWeightStep(store, { exerciseId: exercise.id, machineId: machine?.id ?? null }, next);
  }

  if (loading) return <Loading />;

  if (!exercise) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8" edges={["bottom"]}>
        <Text className="text-center text-ink">Övningen hittades inte.</Text>
      </SafeAreaView>
    );
  }

  const perHand = exercise.weightUnit === "per_hand";
  const unit = weightUnitLabel(perHand);
  const meta = [machine?.manufacturer, gymName].filter(Boolean).join(" · ");

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text className="text-[28px] font-bold uppercase tracking-tight text-ink">
          {exercise.name}
        </Text>
        {meta ? <Text className="mt-1 text-[14px] text-muted">{meta}</Text> : null}
        {machine?.seatSettings ? (
          <Text className="mt-0.5 text-[14px] text-muted">{machine.seatSettings}</Text>
        ) : null}

        {history.length > 0 ? (
          <View className="mt-6">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Senaste gångerna
            </Text>
            <View className="mt-2.5 gap-1.5">
              {history.map((h, i) => (
                <View key={h.sessionId} className="flex-row items-baseline gap-3">
                  <Text
                    className="text-[13px] text-muted"
                    style={{ width: 96 }}
                    numberOfLines={1}
                  >
                    {relativeDay(h.performedAt)}
                  </Text>
                  <Text
                    className={`flex-1 text-[15px] ${i === 0 ? "font-semibold text-ink" : "text-muted"}`}
                  >
                    {formatSets(h.sets, perHand)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text className="mt-6 text-[15px] text-muted">Första gången — sätt en startvikt.</Text>
        )}

        {sets.length > 0 ? (
          <View className="mt-5 gap-1.5">
            {sets.map((s, i) => {
              const isLast = i === sets.length - 1;
              return (
                <View
                  key={s.id}
                  className="flex-row items-center gap-3 rounded-[12px] border border-line bg-card px-4 py-3"
                >
                  <Feather name="check" size={17} color={colors.ok} />
                  <Text className="text-[15px] text-muted">Set {s.setIndex}</Text>
                  <Text className="flex-1 text-[15px] font-semibold text-ink">
                    {fmtWeight(s.weightKg)} {unit} × {s.reps}
                  </Text>
                  {isLast ? (
                    <Pressable
                      onPress={undoLast}
                      accessibilityRole="button"
                      accessibilityLabel={`Ångra set ${s.setIndex}`}
                      hitSlop={12}
                      className="active:opacity-60"
                    >
                      <Feather name="x" size={19} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      {/* Tumzonen. Allt man rör under passet ligger här nere, fast förankrat. */}
      <View className="gap-2.5 border-t border-line px-4 pb-1 pt-3">
        {/* Etiketten säger vad knapparna gör, inte vad inställningen heter —
            "Steg" ensamt gick inte att förstå utan att prova. */}
        <View className="flex-row items-center gap-2">
          <Text className="text-[12px] text-muted">
            <Text className="font-semibold text-ink">+/−</Text> ändrar med
          </Text>
          {STEP_OPTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => chooseStep(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: step === s }}
              className={`rounded-full border px-3 py-1.5 active:opacity-70 ${
                step === s ? "border-accent bg-accent-soft" : "border-line"
              }`}
            >
              <Text
                className="text-[13px] font-semibold"
                style={{ color: step === s ? colors.accent : colors.muted }}
              >
                {fmtWeight(s)} kg
              </Text>
            </Pressable>
          ))}
        </View>

        <Stepper
          label="vikt"
          value={weight}
          unit={unit}
          step={step}
          decimals
          onChange={setWeight}
        />
        <Stepper label="reps" value={reps} unit="reps" step={1} min={1} onChange={setReps} />

        <Button
          label={`Logga set ${sets.length + 1}`}
          icon="check"
          onPress={save}
          loading={busy}
        />
        <Button label="Klar" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}
