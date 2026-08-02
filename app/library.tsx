import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { listAllExercises, matchesQuery, useStore, type Exercise } from "@/lib/db";
import { Button, Empty, Loading, SearchField } from "@/components/ui";
import { fmtWeight } from "@/lib/format";
import { muscleNames } from "@/lib/muscles";
import { colors } from "@/lib/theme";

/**
 * Övningsbiblioteket — alla övningar oavsett gym.
 *
 * Skild från listan under ett pass: här handlar det om att städa och rätta
 * biblioteket, inte om att välja nästa övning. Därför visas viktenhet och
 * viktsteg direkt på raden.
 */
export default function LibraryScreen() {
  const store = useStore();
  const router = useRouter();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setExercises(await listAllExercises(store));
    setLoading(false);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Samma matchning som överallt annars: normaliserad, så "knabo" hittar
  // "Knäböj" och "squat" också gör det.
  const visible = exercises.filter((e) => matchesQuery(e, query));

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <View className="px-4 pt-3">
        <SearchField value={query} onChange={setQuery} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
          ListHeaderComponent={
            <Text className="mb-3 px-1 text-[13px] leading-[18px] text-muted">
              {exercises.length} övningar. Tryck för att ändra namn, viktenhet eller viktsteg.
              Raderar du en övning behålls set du redan loggat.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({ pathname: "/exercise/[id]", params: { id: item.id } })
              }
              accessibilityRole="button"
              className="mb-2 flex-row items-center gap-3 rounded-[15px] border border-line bg-card px-4 active:opacity-70"
              style={{ minHeight: 72 }}
            >
              <View className="flex-1 py-3">
                <Text className="text-[16.5px] font-semibold text-ink" numberOfLines={1}>
                  {item.name}
                </Text>
                {item.nameEn ? (
                  <Text className="mt-0.5 text-[12.5px] text-muted" numberOfLines={1}>
                    {item.nameEn}
                  </Text>
                ) : null}
                <Text className="mt-0.5 text-[12px] text-muted" numberOfLines={1}>
                  {item.type === "machine" ? "Maskin" : "Fri vikt"} ·{" "}
                  {item.weightUnit === "per_hand" ? "per hantel" : "totalvikt"} ·{" "}
                  {fmtWeight(item.weightStep)} kg steg
                  {item.primaryMuscles.length > 0
                    ? ` · ${muscleNames(item.primaryMuscles)}`
                    : ""}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Empty
              icon="search"
              title="Ingen träff"
              body={`Ingen övning matchar "${query}". Sök funkar på både svenska och engelska namn.`}
            />
          }
        />
      )}

      <View className="border-t border-line px-4 pb-1 pt-3">
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
