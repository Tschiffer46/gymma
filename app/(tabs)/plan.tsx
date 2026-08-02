import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { createRoutine, listRoutines, useStore, type RoutineSummary } from "@/lib/db";
import { Button, Empty, Loading } from "@/components/ui";
import { colors } from "@/lib/theme";

/**
 * "Planera" — sparade ordningar av övningar.
 *
 * En plan är aldrig ett krav. Designprincip 4 säger att programmet ska växa
 * fram, så planen är en genväg till det man brukar göra: under passet går det
 * alltid att växla till hela biblioteket och logga något som inte står i den.
 */
export default function PlanScreen() {
  const store = useStore();
  const router = useRouter();

  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRoutines(await listRoutines(store));
    setLoading(false);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const id = await createRoutine(store, trimmed);
      setName("");
      setAdding(false);
      router.push({ pathname: "/routine/[id]", params: { id } });
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
        <Text className="pb-1 pt-2 text-3xl font-bold tracking-tight text-ink">Planera</Text>
        <Text className="mb-6 text-[14px] leading-5 text-muted">
          En plan är en sparad ordning, inte ett schema. Du kan alltid logga något som inte står
          i den.
        </Text>

        {loading ? (
          <Loading />
        ) : routines.length === 0 && !adding ? (
          <Empty
            icon="clipboard"
            title="Inga planer än"
            body="Skapa en plan för ett pass du brukar köra, till exempel Överkropp eller Ben."
          />
        ) : (
          <View className="gap-2">
            {routines.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: "/routine/[id]", params: { id: r.id } })}
                accessibilityRole="button"
                className="flex-row items-center gap-3 rounded-[15px] border border-line bg-card px-4 active:opacity-70"
                style={{ minHeight: 68 }}
              >
                <View className="flex-1">
                  <Text className="text-[17px] font-semibold text-ink">{r.name}</Text>
                  <Text className="mt-0.5 text-[13px] text-muted">
                    {r.itemCount === 0
                      ? "Inga övningar än"
                      : `${r.itemCount} ${r.itemCount === 1 ? "övning" : "övningar"}`}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}

        {adding ? (
          <View className="mt-3 flex-row gap-2">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="t.ex. Överkropp"
              placeholderTextColor={colors.muted}
              autoFocus
              onSubmitEditing={create}
              returnKeyType="done"
              className="flex-1 rounded-[15px] border border-line bg-card px-4 text-[17px] text-ink"
              style={{ minHeight: 58 }}
            />
            <View style={{ width: 104, justifyContent: "center" }}>
              <Button label="Skapa" variant="secondary" onPress={create} loading={busy} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {!adding ? (
        <View className="border-t border-line px-4 pb-2 pt-3">
          <Button label="Ny plan" icon="plus" variant="secondary" onPress={() => setAdding(true)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
