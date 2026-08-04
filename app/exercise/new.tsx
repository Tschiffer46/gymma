import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  createExercise,
  createMachine,
  findExerciseByName,
  getActiveGym,
  getMachine,
  useStore,
  type ExerciseType,
  type Gym,
  type WeightUnit,
} from "@/lib/db";
import { Button, Chip, SectionLabel } from "@/components/ui";
import { fmtWeight } from "@/lib/format";
import { colors } from "@/lib/theme";

const STEP_OPTIONS = [1, 2.5, 5, 10];

/**
 * Lägg till en övning eller maskin.
 *
 * Medvetet minimal: namn, typ och viktsteg. Programmet ska växa fram, inte
 * konfigureras (designprincip 4) — muskelgrupper och foton fylls i av
 * kamera-/AI-flödet i senare sprintar, inte för hand här.
 *
 * Sparning går ALLTID via findExerciseByName först. Skapar två vägar in olika
 * poster för samma övning splittras månadstrenden i två halva serier.
 */
export default function NewExerciseScreen() {
  const store = useStore();
  const router = useRouter();

  const [gym, setGym] = useState<Gym | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [type, setType] = useState<ExerciseType>("machine");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("total");
  const [step, setStep] = useState(1);
  const [manufacturer, setManufacturer] = useState("");
  const [seatSettings, setSeatSettings] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  useEffect(() => {
    getActiveGym(store).then(setGym);
  }, [store]);

  // Visar direkt om namnet redan finns, så man förstår varför appen kopplar
  // ihop den nya maskinen med en befintlig övning i stället för att skapa ny.
  useEffect(() => {
    let cancelled = false;
    if (name.trim().length < 2) {
      setDuplicate(null);
      return;
    }
    findExerciseByName(store, name).then((hit) => {
      if (!cancelled) setDuplicate(hit ? hit.name : null);
    });
    return () => {
      cancelled = true;
    };
  }, [name, store]);

  function pickType(next: ExerciseType) {
    setType(next);
    // Maskiner har alltid ett viktmagasin med totalvikt, fria vikter är oftast
    // hantlar. Steget lämnas på 1 kg för båda — grövre steg väljer man när man
    // ser magasinet, och valet sparas per maskin därifrån.
    setWeightUnit(next === "machine" ? "total" : "per_hand");
    setStep(1);
  }

  async function save() {
    if (!gym || saving || name.trim().length === 0) return;
    setSaving(true);
    try {
      const existing = await findExerciseByName(store, name);
      const exerciseId =
        existing?.id ??
        (await createExercise(store, {
          name,
          nameEn: nameEn.trim() || null,
          type,
          weightUnit,
          weightStep: step,
        }));

      if (type === "machine") {
        const already = await getMachine(store, exerciseId, gym.id);
        if (!already) {
          await createMachine(store, {
            gymId: gym.id,
            exerciseId,
            manufacturer: manufacturer.trim() || null,
            seatSettings: seatSettings.trim() || null,
            weightStep: step,
          });
        }
      }

      // Rakt in i loggvyn — man lägger till en maskin för att man står vid den.
      router.replace({ pathname: "/log/[exerciseId]", params: { exerciseId } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel>Namn</SectionLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="t.ex. Bröstpress"
          placeholderTextColor={colors.muted}
          autoFocus
          autoCapitalize="sentences"
          returnKeyType="done"
          className="mt-2 rounded-[12px] border border-line bg-card px-4 text-[17px] text-ink"
          style={{ minHeight: 52 }}
        />
        {duplicate ? (
          <Text className="mt-2 text-[13px]" style={{ color: colors.ok }}>
            Kopplas till befintlig övning "{duplicate}" — historiken hålls ihop.
          </Text>
        ) : null}

        <View className="mt-6">
          <SectionLabel>Engelskt namn (valfritt)</SectionLabel>
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
            Skriv av skyltnamnet. Då hittar sökningen övningen oavsett språk.
          </Text>
        </View>

        <View className="mt-6">
          <SectionLabel>Typ</SectionLabel>
          <View className="mt-2 flex-row gap-2">
            <Chip label="Maskin" active={type === "machine"} onPress={() => pickType("machine")} />
            <Chip
              label="Fri vikt"
              active={type === "freeweight"}
              onPress={() => pickType("freeweight")}
            />
          </View>
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
          <Text className="mt-2 text-[13px] leading-[18px] text-muted">
            {weightUnit === "per_hand"
              ? "Vikten på en hantel. Volymen räknas automatiskt gånger två."
              : "Vikten på stacken eller stången, som den står."}
          </Text>
        </View>

        <View className="mt-6">
          <SectionLabel>Viktsteg</SectionLabel>
          <View className="mt-2 flex-row gap-2">
            {STEP_OPTIONS.map((s) => (
              <Chip key={s} label={`${fmtWeight(s)} kg`} active={step === s} onPress={() => setStep(s)} />
            ))}
          </View>
          <Text className="mt-2 text-[13px] text-muted">
            Går att ändra direkt i loggvyn när du ser magasinet.
          </Text>
        </View>

        {type === "machine" ? (
          <>
            <View className="mt-6">
              <SectionLabel>Tillverkare (valfritt)</SectionLabel>
              <TextInput
                value={manufacturer}
                onChangeText={setManufacturer}
                placeholder="t.ex. Technogym"
                placeholderTextColor={colors.muted}
                className="mt-2 rounded-[12px] border border-line bg-card px-4 text-[17px] text-ink"
                style={{ minHeight: 52 }}
              />
            </View>

            <View className="mt-6">
              <SectionLabel>Inställningar (valfritt)</SectionLabel>
              <TextInput
                value={seatSettings}
                onChangeText={setSeatSettings}
                placeholder="t.ex. Sits 4, rygg 3"
                placeholderTextColor={colors.muted}
                className="mt-2 rounded-[12px] border border-line bg-card px-4 text-[17px] text-ink"
                style={{ minHeight: 52 }}
              />
              <Text className="mt-2 text-[13px] text-muted">
                Visas överst i loggvyn så du slipper leta rätt på dem varje gång.
              </Text>
            </View>
          </>
        ) : null}

        <Text className="mt-6 text-[13px] text-muted">
          {type === "machine"
            ? `Maskinen läggs till på ${gym?.name ?? "aktivt gym"}. Progression mäts per maskin — viktskalor skiljer sig mellan gym.`
            : "Fria vikter finns på alla gym."}
        </Text>
      </ScrollView>

      <View className="border-t border-line px-4 pb-1 pt-3">
        <Button
          label="Spara och börja logga"
          icon="check"
          onPress={save}
          loading={saving}
          disabled={name.trim().length === 0}
        />
      </View>
    </SafeAreaView>
  );
}
