import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteExercise,
  findExerciseByName,
  getExercise,
  updateExercise,
  useStore,
  type Exercise,
  type WeightUnit,
} from "@/lib/db";
import { Button, Chip, Loading, SectionLabel } from "@/components/ui";
import { fmtWeight } from "@/lib/format";
import { muscleNames } from "@/lib/muscles";
import { colors } from "@/lib/theme";

const STEP_OPTIONS = [2.5, 5, 10];

/**
 * Redigera en övning i biblioteket.
 *
 * Namnbytet skriver om `match_key`, så dubblettskyddet följer med. Därför
 * varnas det om det nya namnet redan är upptaget — annars kan två poster med
 * samma nyckel splittra månadstrenden.
 */
export default function EditExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const router = useRouter();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("total");
  const [step, setStep] = useState(5);
  const [clash, setClash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const e = await getExercise(store, id);
    if (e) {
      setExercise(e);
      setName(e.name);
      setNameEn(e.nameEn ?? "");
      setWeightUnit(e.weightUnit);
      setStep(e.weightStep);
    }
    setLoading(false);
  }, [store, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function checkClash(next: string) {
    setName(next);
    if (!exercise || next.trim().length < 2) {
      setClash(null);
      return;
    }
    const hit = await findExerciseByName(store, next);
    setClash(hit && hit.id !== exercise.id ? hit.name : null);
  }

  async function save() {
    if (!exercise || busy || name.trim().length === 0) return;
    setBusy(true);
    try {
      await updateExercise(store, exercise.id, {
        name,
        nameEn: nameEn.trim() || null,
        weightUnit,
        weightStep: step,
      });
      router.back();
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!exercise) return;
    Alert.alert(
      `Radera ${exercise.name}?`,
      "Set du redan loggat behålls i historiken. Övningen tas bort ur planer och från gym där den står som maskin.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: async () => {
            await deleteExercise(store, exercise.id);
            router.back();
          },
        },
      ],
    );
  }

  if (loading) return <Loading />;

  if (!exercise) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8" edges={["bottom"]}>
        <Text className="text-center text-ink">Övningen hittades inte.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel>Namn</SectionLabel>
        <TextInput
          value={name}
          onChangeText={checkClash}
          placeholder="Svenskt namn"
          placeholderTextColor={colors.muted}
          className="mt-2 rounded-[12px] border border-line bg-card px-4 text-[17px] text-ink"
          style={{ minHeight: 52 }}
        />
        {clash ? (
          <Text className="mt-2 text-[13px]" style={{ color: colors.danger }}>
            "{clash}" har redan det namnet. Två övningar med samma namn splittrar historiken i
            två halva serier.
          </Text>
        ) : null}

        <View className="mt-6">
          <SectionLabel>Engelskt namn</SectionLabel>
          <TextInput
            value={nameEn}
            onChangeText={setNameEn}
            placeholder="t.ex. Chest Press"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            className="mt-2 rounded-[12px] border border-line bg-card px-4 text-[17px] text-ink"
            style={{ minHeight: 52 }}
          />
          <Text className="mt-2 text-[13px] leading-[18px] text-muted">
            Namnet som står på maskinskylten. Gör att sökningen träffar oavsett språk, och blir
            matchningsnyckel när kameran kopplas in.
          </Text>
        </View>

        <View className="mt-6">
          <SectionLabel>Vikten som skrivs in</SectionLabel>
          <View className="mt-2 flex-row gap-2">
            <Chip
              label="Totalvikt"
              active={weightUnit === "total"}
              onPress={() => setWeightUnit("total")}
            />
            <Chip
              label="Per hantel"
              active={weightUnit === "per_hand"}
              onPress={() => setWeightUnit("per_hand")}
            />
          </View>
        </View>

        <View className="mt-6">
          <SectionLabel>Viktsteg</SectionLabel>
          <View className="mt-2 flex-row gap-2">
            {STEP_OPTIONS.map((s) => (
              <Chip
                key={s}
                label={`${fmtWeight(s)} kg`}
                active={step === s}
                onPress={() => setStep(s)}
              />
            ))}
          </View>
          <Text className="mt-2 text-[13px] text-muted">
            Gäller övningen. Står den på en maskin vinner maskinens eget steg.
          </Text>
        </View>

        {exercise.primaryMuscles.length > 0 ? (
          <View className="mt-6">
            <SectionLabel>Muskler</SectionLabel>
            <Text className="mt-2 text-[15px] text-ink">
              {muscleNames(exercise.primaryMuscles)}
            </Text>
            {exercise.secondaryMuscles.length > 0 ? (
              <Text className="mt-0.5 text-[13.5px] text-muted">
                Sekundärt: {muscleNames(exercise.secondaryMuscles)}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          className="mt-10 items-center active:opacity-60"
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text className="text-[15px]" style={{ color: colors.danger }}>
            Radera övningen
          </Text>
        </Pressable>
      </ScrollView>

      <View className="border-t border-line px-4 pb-1 pt-3">
        <Button
          label="Spara"
          icon="check"
          onPress={save}
          loading={busy}
          disabled={name.trim().length === 0}
        />
      </View>
    </SafeAreaView>
  );
}
