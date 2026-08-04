import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  deleteSession,
  deleteSet,
  getSessionSummary,
  sessionExerciseGroups,
  updateSession,
  updateSet,
  useStore,
  type Feeling,
  type SessionExerciseGroup,
  type SessionSummary,
  type SetEntry,
} from "@/lib/db";
import {
  Button,
  Card,
  IconButton,
  Loading,
  NumberPrompt,
  SectionLabel,
} from "@/components/ui";
import { describeDay, toDayKey } from "@/lib/dates";
import { fmtVolume, fmtWeight, weightUnitLabel } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

const FEELINGS: { key: Feeling; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "latt", label: "Lätt", icon: "feather" },
  { key: "lagom", label: "Lagom", icon: "check-circle" },
  { key: "tungt", label: "Tungt", icon: "alert-circle" },
];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ett tal som går att rätta. Ramen är hela poängen — den säger "tryck här". */
function NumberChip({
  label,
  a11y,
  onPress,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className="items-center justify-center border border-line bg-card-hi active:opacity-60"
      style={{ minHeight: 38, paddingHorizontal: 11, borderRadius: radius.sm }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: colors.ink,
          fontVariant: ["tabular-nums"],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Ett tidigare pass: läsa kommentaren, rätta ett felloggat set, radera.
 *
 * Allt som loggats var tidigare skrivskyddat — ett set med fel vikt låg kvar
 * och drog med sig både förifyllningen och rekorden. Den här vyn är svaret.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const router = useRouter();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [groups, setGroups] = useState<SessionExerciseGroup[]>([]);
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [editing, setEditing] = useState<{ set: SetEntry; field: "weight" | "reps" } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const s = await getSessionSummary(store, id);
    setSession(s);
    setNotes(s?.notes ?? "");
    setGroups(await sessionExerciseGroups(store, id));
    setLoading(false);
  }, [store, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function pickFeeling(next: Feeling) {
    if (!session) return;
    Haptics.selectionAsync();
    await updateSession(store, session.id, { feeling: session.feeling === next ? null : next });
    await load();
  }

  async function commitNotes() {
    if (!session) return;
    setEditingNotes(false);
    await updateSession(store, session.id, { notes });
    await load();
  }

  async function saveSet(next: number) {
    if (!editing) return;
    const patch =
      editing.field === "weight" ? { weightKg: next } : { reps: Math.max(1, Math.round(next)) };
    setEditing(null);
    await updateSet(store, editing.set.id, patch);
    await load();
  }

  function confirmDeleteSet(set: SetEntry, name: string) {
    Alert.alert(`Radera setet?`, `${name}, set ${set.setIndex}. Det går inte att ångra.`, [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Radera",
        style: "destructive",
        onPress: async () => {
          await deleteSet(store, set.id);
          await load();
        },
      },
    ]);
  }

  function confirmDeleteSession() {
    if (!session) return;
    Alert.alert(
      "Radera hela passet?",
      "Alla set i passet försvinner, och de räknas inte längre i volym, rekord eller förifyllning.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: async () => {
            await deleteSession(store, session.id);
            router.back();
          },
        },
      ],
    );
  }

  if (loading) return <Loading />;

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8" edges={["bottom"]}>
        <Text className="text-center text-ink">Passet hittades inte.</Text>
      </SafeAreaView>
    );
  }

  // toDayKey, INTE slice(0,10): endedAt ligger i UTC och ett pass som avslutas
  // 00:30 svensk sommartid skulle annars visas på gårdagens datum.
  const day = toDayKey(new Date(session.endedAt));
  const editingUnit =
    editing?.field === "reps"
      ? "reps"
      : weightUnitLabel(
          groups.find((g) => g.sets.some((s) => s.id === editing?.set.id))?.exercise.weightUnit ===
            "per_hand",
        );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card className="mb-7 mt-1 px-4 py-4">
          <Text className="text-[17px] font-bold text-ink">
            {capitalize(describeDay(day))}
          </Text>
          <Text className="mt-1 text-[14px] text-muted">
            {[session.gymName, session.routineName].filter(Boolean).join(" · ")}
          </Text>
          <Text
            className="mt-2 text-[13.5px] text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {session.sets} set · {session.exercises}{" "}
            {session.exercises === 1 ? "övning" : "övningar"} · {fmtVolume(session.volumeKg)}
          </Text>
        </Card>

        <SectionLabel>Hur kändes det?</SectionLabel>
        <View className="mt-3 flex-row gap-2">
          {FEELINGS.map((f) => {
            const active = session.feeling === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => pickFeeling(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`flex-1 items-center justify-center gap-1.5 rounded-[15px] border py-3.5 active:opacity-70 ${
                  active ? "border-accent bg-accent-soft" : "border-line bg-card"
                }`}
              >
                <Feather name={f.icon} size={20} color={active ? colors.accent : colors.muted} />
                <Text
                  className="text-[13.5px] font-semibold"
                  style={{ color: active ? colors.accent : colors.ink }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-7">
          <SectionLabel>Anteckning</SectionLabel>
          {editingNotes ? (
            <>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="t.ex. Ont i axeln på sista setet"
                placeholderTextColor={colors.muted}
                multiline
                autoFocus
                textAlignVertical="top"
                className="mt-2 rounded-[15px] border border-line bg-card px-4 py-3 text-[16px] text-ink"
                style={{ minHeight: 100 }}
              />
              <View className="mt-2">
                <Button label="Spara anteckning" icon="check" onPress={commitNotes} />
              </View>
            </>
          ) : (
            <Pressable
              onPress={() => setEditingNotes(true)}
              accessibilityRole="button"
              accessibilityLabel="Ändra anteckningen"
              className="mt-2 flex-row items-start gap-3 rounded-[15px] border border-line bg-card px-4 py-3.5 active:opacity-70"
              style={{ minHeight: 58 }}
            >
              <Text
                className="flex-1 text-[15.5px] leading-[21px]"
                style={{ color: session.notes ? colors.ink : colors.mutedDim }}
              >
                {session.notes ?? "Ingen anteckning. Tryck för att skriva en."}
              </Text>
              <Feather name="edit-2" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <View className="mt-8">
          <SectionLabel>Seten</SectionLabel>
          <Text className="mb-3 mt-1.5 text-[13px] leading-[18px] text-muted">
            Tryck på vikten eller reps för att rätta ett set. Volym och rekord räknas om.
          </Text>

          {groups.length === 0 ? (
            <Text className="py-4 text-[14px] text-muted">
              Inga set kvar i passet. Radera det nedan om det blev fel från början.
            </Text>
          ) : (
            <View className="gap-5">
              {groups.map((g) => {
                const unit = weightUnitLabel(g.exercise.weightUnit === "per_hand");
                return (
                  <View key={g.exercise.id}>
                    <Text className="mb-2 text-[15.5px] font-semibold text-ink">
                      {g.exercise.name}
                    </Text>
                    <View className="gap-2">
                      {g.sets.map((s) => (
                        <View
                          key={s.id}
                          className="flex-row items-center border border-line bg-card pl-4"
                          style={{ minHeight: 58, borderRadius: radius.md }}
                        >
                          <Text style={{ fontSize: 13, color: colors.muted, width: 46 }}>
                            Set {s.setIndex}
                          </Text>

                          {/* Båda siffrorna är egna tryckytor — samma mönster som
                              loggvyn. Ersätter ett dolt långtryck för reps. */}
                          <View className="flex-1 flex-row items-center gap-1.5">
                            <NumberChip
                              label={`${fmtWeight(s.weightKg)} ${unit}`}
                              a11y={`Vikt ${fmtWeight(s.weightKg)} ${unit} i set ${s.setIndex}. Tryck för att rätta.`}
                              onPress={() => setEditing({ set: s, field: "weight" })}
                            />
                            <Text style={{ fontSize: 14, color: colors.mutedDim }}>×</Text>
                            <NumberChip
                              label={String(s.reps)}
                              a11y={`${s.reps} reps i set ${s.setIndex}. Tryck för att rätta.`}
                              onPress={() => setEditing({ set: s, field: "reps" })}
                            />
                          </View>

                          <IconButton
                            icon="trash-2"
                            label={`Radera set ${s.setIndex} i ${g.exercise.name}`}
                            tone="danger"
                            onPress={() => confirmDeleteSet(s, g.exercise.name)}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Pressable
          onPress={confirmDeleteSession}
          accessibilityRole="button"
          className="mt-10 items-center justify-center active:opacity-60"
          style={{ minHeight: 48 }}
        >
          <Text className="text-[15px]" style={{ color: colors.danger }}>
            Radera hela passet
          </Text>
        </Pressable>
      </ScrollView>

      <NumberPrompt
        open={editing !== null}
        title={editing?.field === "reps" ? "Reps" : "Vikt"}
        unit={editingUnit}
        value={
          editing ? (editing.field === "reps" ? editing.set.reps : editing.set.weightKg) : 0
        }
        decimals={editing?.field === "weight"}
        min={editing?.field === "reps" ? 1 : 0}
        onSubmit={saveSet}
        onClose={() => setEditing(null)}
      />
    </SafeAreaView>
  );
}
