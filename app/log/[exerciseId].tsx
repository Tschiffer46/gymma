import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  bestWeightOnMachine,
  deleteSet,
  getActiveGym,
  getCurrentSession,
  getExercise,
  getMachine,
  getOrCreateMachine,
  getOrOpenSession,
  lastSets,
  logSet,
  setsInSession,
  setWeightStep,
  useStore,
  weightStepFor,
  type Exercise,
  type Machine,
  type Session,
  type SetEntry,
} from "@/lib/db";
import { Loading, NumberPrompt } from "@/components/ui";
import { fmtWeight, weightUnitLabel } from "@/lib/format";
import { colors, radius, tint } from "@/lib/theme";

/**
 * Viktmagasin går i olika steg. 1 kg först — det är det finaste steget och
 * fungerar överallt; magasin som bara går i 5 kg väljer man ett tryck bort.
 * Behöver du hoppa långt trycker du i stället på själva siffran och skriver.
 */
const STEP_OPTIONS = [1, 2.5, 5, 10];

/** Antal set att visa pips för när övningen aldrig körts förut. */
const DEFAULT_PLANNED_SETS = 3;

const NUMBER_WORDS = ["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

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

/**
 * Loggvyn — en siffra i fokus (riktning 1d).
 *
 * Vikten äger skärmen. Allt annat är stödinformation eller tryckyta, och
 * ordningen uppifrån och ned är: vad du gör → vad du gjorde → vad du trycker på.
 */
export default function LogScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const store = useStore();
  const router = useRouter();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [prev, setPrev] = useState<PrevSet[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(10);
  const [step, setStep] = useState(5);
  const [flash, setFlash] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [typing, setTyping] = useState<"weight" | "reps" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vikten "poppar" när ett set loggas — kvittot på att trycket gick fram.
  const popScale = useSharedValue(1);
  const popOpacity = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
    opacity: popOpacity.value,
  }));

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
      const inSession = cur ? await setsInSession(store, cur.id, ex.id) : [];
      const record = await bestWeightOnMachine(store, {
        exerciseId: ex.id,
        machineId: m?.id ?? null,
      });
      const fill = prefillFor(inSession.length + 1, previous, inSession, ex);

      if (cancelled) return;
      setExercise(ex);
      setMachine(m);
      setPrev(previous);
      setBest(record);
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

  // Toast-timern måste städas, annars kan den skriva till en avmonterad skärm.
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  function showFlash(text: string) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(text);
    flashTimer.current = setTimeout(() => setFlash(null), 1700);
  }

  const save = useCallback(async () => {
    if (!exercise || busy) return;
    setBusy(true);
    try {
      const gym = await getActiveGym(store);
      if (!gym) return;
      // Passet öppnas här som skyddsnät — normalt finns det redan.
      const s = session ?? (await getOrOpenSession(store, gym.id));

      // Maskiner läggs till NÄR de används, inte i förväg (designprincip 4).
      // Kör du en maskinövning på ett gym där den aldrig använts skapas raden
      // här — det är vad som gör att en övning aldrig kan "saknas" på ett gym.
      const target =
        machine ??
        (exercise.type === "machine"
          ? await getOrCreateMachine(store, exercise.id, gym.id, step)
          : null);
      if (target && !machine) setMachine(target);

      const index = sets.length + 1;
      const entry = await logSet(store, {
        sessionId: s.id,
        exerciseId: exercise.id,
        machineId: target?.id ?? null,
        weightKg: weight,
        reps,
        setIndex: index,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      popScale.value = withSequence(
        withTiming(0.82, { duration: 0 }),
        withTiming(1.06, { duration: 130, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 130, easing: Easing.out(Easing.cubic) }),
      );
      popOpacity.value = withSequence(
        withTiming(0.4, { duration: 0 }),
        withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
      );

      const unit = weightUnitLabel(exercise.weightUnit === "per_hand");
      showFlash(`Set ${index} loggat · ${fmtWeight(weight)} ${unit} × ${reps}`);

      const nextSets = [...sets, entry];
      setSession(s);
      setSets(nextSets);
      if (best === null || weight > best) setBest(weight);

      // Förifyll nästa set från förra passets motsvarande set om det finns —
      // annars står värdena kvar, vilket är rätt för raka set.
      const fill = prefillFor(nextSets.length + 1, prev, nextSets, exercise);
      setWeight(fill.weightKg);
      setReps(fill.reps);
    } finally {
      setBusy(false);
    }
  }, [exercise, machine, session, sets, prev, weight, reps, step, best, store, busy, popScale, popOpacity]);

  async function undoLast() {
    const last = sets[sets.length - 1];
    if (!last) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await deleteSet(store, last.id);
    setSets(sets.slice(0, -1));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
  }

  /** Ett tryck cyklar 2,5 → 5 → 10 och sparar valet där det hör hemma. */
  async function cycleStep() {
    if (!exercise) return;
    Haptics.selectionAsync();
    const next = STEP_OPTIONS[(STEP_OPTIONS.indexOf(step) + 1) % STEP_OPTIONS.length];
    setStep(next);
    await setWeightStep(store, { exerciseId: exercise.id, machineId: machine?.id ?? null }, next);
  }

  function bump(kind: "weight" | "reps", dir: 1 | -1) {
    Haptics.selectionAsync();
    if (kind === "weight") {
      // Flyttalsaddition ger 47.50000000000001 — avrunda till stegets upplösning.
      const next = Math.round((weight + dir * step) * 100) / 100;
      if (next >= 0) setWeight(next);
    } else {
      const next = reps + dir;
      if (next >= 1) setReps(next);
    }
  }

  if (loading) return <Loading />;

  if (!exercise) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center text-ink">Övningen hittades inte.</Text>
      </SafeAreaView>
    );
  }

  const perHand = exercise.weightUnit === "per_hand";
  const unit = weightUnitLabel(perHand);
  const meta = [machine?.manufacturer, machine?.seatSettings].filter(Boolean).join(" · ");

  const planned = prev.length || DEFAULT_PLANNED_SETS;
  const nextIndex = sets.length + 1;
  const pipTotal = Math.max(planned, nextIndex);
  const corresponding = prev.find((s) => s.setIndex === nextIndex);

  const helper =
    prev.length === 0
      ? "Första gången — sätt en startvikt."
      : corresponding
        ? `Förra passet: ${fmtWeight(corresponding.weightKg)} ${unit} × ${corresponding.reps}`
        : `Extraset — förra passet stannade på ${numberWord(prev.length)}`;

  const isPb = best !== null && weight > best;
  const allLogged = sets.length >= planned;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom", "left", "right"]}>
      {/* 1. Topp — vem du är hos, och hur långt du kommit */}
      <View className="flex-row items-center gap-2.5" style={{ paddingHorizontal: 18 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Tillbaka"
          hitSlop={10}
          className="active:opacity-60"
        >
          <Feather name="chevron-left" size={24} color={colors.muted} />
        </Pressable>

        <View className="flex-1">
          <Text
            style={{ fontSize: 17, fontWeight: "700", letterSpacing: -0.2, color: colors.ink }}
            numberOfLines={1}
          >
            {exercise.name}
          </Text>
          {meta ? (
            <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center" style={{ gap: 5 }}>
          {Array.from({ length: pipTotal }).map((_, i) => (
            <Pip key={i} filled={i < sets.length} />
          ))}
        </View>
      </View>

      {/* 2. Mitten — en siffra i fokus */}
      <View className="flex-1 items-center justify-center px-6">
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 1.76,
            color: colors.muted,
            textTransform: "uppercase",
          }}
        >
          Set {nextIndex} av {pipTotal}
        </Text>

        {/* Siffrorna är tryckytor: ett tryck öppnar tangentbordet för dem som
            ska hoppa långt. +/– nedanför är fortfarande huvudvägen. */}
        <Pressable
          onPress={() => setTyping("weight")}
          accessibilityRole="button"
          accessibilityLabel={`Vikt ${fmtWeight(weight)} ${unit}. Tryck för att skriva in.`}
          className="active:opacity-70"
        >
          <Animated.View
            style={[popStyle, { flexDirection: "row", alignItems: "baseline", marginTop: 6 }]}
          >
            <Text
              style={{
                fontSize: 96,
                fontWeight: "700",
                letterSpacing: -4,
                color: colors.ink,
                fontVariant: ["tabular-nums"],
              }}
            >
              {fmtWeight(weight)}
            </Text>
            <Text
              style={{ fontSize: 22, fontWeight: "600", color: colors.muted, marginLeft: 8 }}
            >
              {unit}
            </Text>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={() => setTyping("reps")}
          accessibilityRole="button"
          accessibilityLabel={`${reps} reps. Tryck för att skriva in.`}
          className="flex-row items-baseline active:opacity-70"
          style={{ marginTop: 20 }}
        >
          <Text
            style={{
              fontSize: 42,
              fontWeight: "700",
              letterSpacing: -1.4,
              color: colors.ink,
              fontVariant: ["tabular-nums"],
            }}
          >
            {reps}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.muted, marginLeft: 7 }}>
            reps
          </Text>
        </Pressable>

        <Text
          style={{ fontSize: 13.5, color: colors.muted, marginTop: 26, textAlign: "center" }}
        >
          {helper}
        </Text>

        {isPb ? <PbChip /> : null}
      </View>

      {/* Setlistan konkurrerar inte med vikten — den ligger hopfälld tills man
          faktiskt vill ångra något. */}
      {sets.length > 0 ? (
        <View style={{ paddingHorizontal: 18, marginBottom: 10 }}>
          <Pressable
            onPress={() => setListOpen((o) => !o)}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-1.5 active:opacity-60"
            style={{ minHeight: 34 }}
          >
            <Text style={{ fontSize: 13, color: colors.muted }}>
              {sets.length} {sets.length === 1 ? "set" : "set"} loggade
            </Text>
            <Feather name={listOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
          </Pressable>

          {listOpen ? (
            <ScrollView style={{ maxHeight: 132 }} className="mt-1">
              <View style={{ gap: 6 }}>
                {sets.map((s, i) => (
                  <View
                    key={s.id}
                    className="flex-row items-center gap-3 border border-line bg-card px-4 py-2.5"
                    style={{ borderRadius: radius.sm }}
                  >
                    <Feather name="check" size={15} color={colors.ok} />
                    <Text style={{ fontSize: 14, color: colors.muted }}>Set {s.setIndex}</Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 14.5,
                        fontWeight: "600",
                        color: colors.ink,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {fmtWeight(s.weightKg)} {unit} × {s.reps}
                    </Text>
                    {i === sets.length - 1 ? (
                      <Pressable
                        onPress={undoLast}
                        accessibilityRole="button"
                        accessibilityLabel={`Ångra set ${s.setIndex}`}
                        hitSlop={12}
                        className="active:opacity-60"
                      >
                        <Feather name="x" size={18} color={colors.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {/* 3. Tumzonen — allt man rör under passet */}
      <View style={{ paddingHorizontal: 18, paddingBottom: 6, gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <StepPad
            icon="minus"
            label={`Minska vikten med ${fmtWeight(step)} kilo`}
            height={74}
            onPress={() => bump("weight", -1)}
          />
          <Pressable
            onPress={cycleStep}
            accessibilityRole="button"
            accessibilityLabel={`Viktsteg ${fmtWeight(step)} kilo. Tryck för att byta.`}
            className="items-center justify-center active:opacity-60"
            style={{ width: 76, height: 74 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>
              ±{fmtWeight(step)} kg
            </Text>
          </Pressable>
          <StepPad
            icon="plus"
            label={`Öka vikten med ${fmtWeight(step)} kilo`}
            height={74}
            onPress={() => bump("weight", 1)}
          />
        </View>

        <View className="flex-row items-center" style={{ gap: 10 }}>
          <StepPad
            icon="minus"
            label="Minska reps"
            height={56}
            outlined
            onPress={() => bump("reps", -1)}
          />
          <View className="items-center justify-center" style={{ width: 76, height: 56 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted }}>reps</Text>
          </View>
          <StepPad
            icon="plus"
            label="Öka reps"
            height={56}
            outlined
            onPress={() => bump("reps", 1)}
          />
        </View>

        <Pressable
          onPress={save}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Logga set ${nextIndex}`}
          className="flex-row items-center justify-center gap-2.5 bg-accent active:opacity-80"
          style={{ height: 68, borderRadius: radius.xl, opacity: busy ? 0.6 : 1 }}
        >
          <Feather name="check" size={21} color={colors.white} strokeWidth={2.8} />
          <Text style={{ fontSize: 19, fontWeight: "600", color: colors.white }}>
            Logga set {nextIndex}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="items-center justify-center active:opacity-60"
          style={{ minHeight: 44 }}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>
            {allLogged ? "Nästa övning" : "Klar med övningen"}
          </Text>
        </Pressable>
      </View>

      {flash ? <Toast text={flash} /> : null}

      <NumberPrompt
        open={typing === "weight"}
        title="Vikt"
        unit={unit}
        value={weight}
        decimals
        onSubmit={(next) => {
          setWeight(next);
          setTyping(null);
        }}
        onClose={() => setTyping(null)}
      />
      <NumberPrompt
        open={typing === "reps"}
        title="Reps"
        unit="reps"
        value={reps}
        min={1}
        onSubmit={(next) => {
          setReps(Math.round(next));
          setTyping(null);
        }}
        onClose={() => setTyping(null)}
      />
    </SafeAreaView>
  );
}

/**
 * Setpip. Fylls från `line` till `ok` med en färgövergång i stället för att
 * bara byta färg — rörelsen är det som gör att man ser att något hände.
 */
function Pip({ filled }: { filled: boolean }) {
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, { duration: 200 });
  }, [filled, progress]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.line, colors.ok]),
  }));

  return <Animated.View style={[{ width: 9, height: 9, borderRadius: radius.pill }, style]} />;
}

/** Tryckyta för +/−. Höjden skiljer vikt (74) från reps (56) — vikten är viktigare. */
function StepPad({
  icon,
  label,
  height,
  outlined,
  onPress,
}: {
  icon: "plus" | "minus";
  label: string;
  height: number;
  outlined?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center active:opacity-60"
      style={{
        height,
        borderRadius: outlined ? radius.md : radius.xl,
        backgroundColor: outlined ? "transparent" : colors.cardHi,
        borderWidth: outlined ? 1 : 0,
        borderColor: colors.line,
      }}
    >
      <Feather name={icon} size={outlined ? 22 : 30} color={outlined ? colors.muted : colors.ink} />
    </Pressable>
  );
}

/** "Tyngre än någonsin på den här maskinen" — påstår bara det datan bär. */
function PbChip() {
  const y = useSharedValue(18);
  const opacity = useSharedValue(0);

  useEffect(() => {
    y.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [y, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          marginTop: 18,
          paddingVertical: 7,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: tint.ok,
        },
      ]}
    >
      <Feather name="trending-up" size={14} color={colors.ok} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ok }}>
        Tyngre än någonsin på den här maskinen
      </Text>
    </Animated.View>
  );
}

/** Kvitto på loggat set. Ligger ovanför tumzonen så den aldrig täcker knappen. */
function Toast({ text }: { text: string }) {
  const y = useSharedValue(18);
  const opacity = useSharedValue(0);

  useEffect(() => {
    y.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [y, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: "absolute",
          bottom: 180,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          paddingVertical: 11,
          paddingHorizontal: 18,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.card,
        },
      ]}
    >
      <Feather name="check" size={16} color={colors.ok} />
      <Text
        style={{
          fontSize: 14.5,
          fontWeight: "600",
          color: colors.ink,
          fontVariant: ["tabular-nums"],
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}
