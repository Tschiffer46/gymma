import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getActiveGym,
  getCurrentSession,
  listExercisesForGym,
  listGyms,
  setActiveGym,
  useStore,
  type ExerciseListItem,
  type Gym,
} from "@/lib/db";
import { ExerciseRow } from "@/components/ExerciseRow";
import { Button, Empty, Loading } from "@/components/ui";
import { colors } from "@/lib/theme";

/**
 * Startskärmen — en avbockningslista, inte ett wizard-flöde.
 *
 * Ordningen (ej körda först, därefter senast använd) kommer från
 * listExercisesForGym. Ingen bockar av något manuellt: raden bockas av när
 * det första setet loggas i det pågående passet.
 */
export default function TodayScreen() {
  const store = useStore();
  const router = useRouter();

  const [gym, setGym] = useState<Gym | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [items, setItems] = useState<ExerciseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const load = useCallback(async () => {
    const active = await getActiveGym(store);
    setGym(active);
    setGyms(await listGyms(store));
    if (!active) {
      setItems([]);
      setLoading(false);
      return;
    }
    const session = await getCurrentSession(store, active.id);
    setItems(await listExercisesForGym(store, active.id, session?.id ?? null));
    setLoading(false);
  }, [store]);

  // Laddar om varje gång skärmen får fokus — efter ett loggat set ska bocken
  // och siffrorna på raden vara uppdaterade när man kommer tillbaka.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function switchGym(id: string) {
    setSwitcherOpen(false);
    setLoading(true);
    await setActiveGym(store, id);
    await load();
  }

  const doneCount = items.filter((i) => i.doneToday).length;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
        <Pressable
          onPress={() => setSwitcherOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Aktivt gym: ${gym?.name ?? "inget"}. Tryck för att byta.`}
          className="flex-1 flex-row items-center gap-1.5 active:opacity-70"
          style={{ minHeight: 44 }}
        >
          <View>
            <Text className="text-2xl font-bold tracking-tight text-ink">Idag</Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                {gym?.name ?? "Inget gym"}
              </Text>
              <Feather name="chevron-down" size={13} color={colors.muted} />
            </View>
          </View>
        </Pressable>

        {doneCount > 0 ? (
          <View className="mr-2 rounded-full bg-accent-soft px-3 py-1.5">
            <Text className="text-[13px] font-semibold" style={{ color: colors.accent }}>
              {doneCount} klara
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Inställningar"
          className="items-center justify-center active:opacity-60"
          style={{ width: 44, height: 44 }}
        >
          <Feather name="settings" size={21} color={colors.muted} />
        </Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.exercise.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
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

      <GymSwitcher
        open={switcherOpen}
        gyms={gyms}
        activeId={gym?.id ?? null}
        onSelect={switchGym}
        onClose={() => setSwitcherOpen(false)}
      />
    </SafeAreaView>
  );
}

function GymSwitcher({
  open,
  gyms,
  activeId,
  onSelect,
  onClose,
}: {
  open: boolean;
  gyms: Gym[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-[22px] border-t border-line bg-card px-4 pb-8 pt-4">
          <Text className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-muted">
            Byt gym
          </Text>
          {gyms.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => onSelect(g.id)}
              accessibilityRole="button"
              className="flex-row items-center justify-between rounded-[12px] px-3 active:opacity-60"
              style={{ minHeight: 56 }}
            >
              <Text className="text-[17px] text-ink">{g.name}</Text>
              {g.id === activeId ? <Feather name="check" size={20} color={colors.accent} /> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
