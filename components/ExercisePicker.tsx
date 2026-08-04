import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getActiveGym,
  listAllExercises,
  listExercisesForGym,
  matchesQuery,
  useStore,
  type Exercise,
} from "@/lib/db";
import { Button, SearchField, SectionLabel } from "@/components/ui";
import { colors, radius } from "@/lib/theme";

/**
 * Väljare över **hela övningsbiblioteket** — inte bara det aktiva gymmet.
 *
 * Det gymfiltret var en riktig bugg: en maskin du lagt till på ett gym var
 * osynlig på alla andra, och enda vägen in var att skriva namnet på nytt under
 * "Ny övning eller maskin". Här når sökningen allt, och maskinen skapas på det
 * gym du står på när du loggar ditt första set (`getOrCreateMachine`).
 *
 * Används av både det pågående passet och planredigeraren. En plan har med
 * flit ingen gymkoppling, så den ska aldrig ha varit gymfiltrerad heller.
 */
export function ExercisePicker({
  open,
  title = "Lägg till övning",
  exclude = [],
  onPick,
  onClose,
  onCreateNew,
}: {
  open: boolean;
  title?: string;
  /** Övningar som redan är valda och inte ska kunna väljas igen. */
  exclude?: string[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
  /** Visas som sista utväg när det man söker inte finns i biblioteket alls. */
  onCreateNew?: () => void;
}) {
  const store = useStore();

  const [all, setAll] = useState<Exercise[]>([]);
  const [hereIds, setHereIds] = useState<Set<string>>(new Set());
  const [gymName, setGymName] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setAll(await listAllExercises(store));
    const gym = await getActiveGym(store);
    setGymName(gym?.name ?? "");
    if (gym) {
      const here = await listExercisesForGym(store, gym.id, null);
      setHereIds(new Set(here.map((i) => i.exercise.id)));
    }
  }, [store]);

  useEffect(() => {
    if (open) {
      setQuery("");
      load();
    }
  }, [open, load]);

  const excluded = new Set(exclude);
  const visible = all.filter((e) => !excluded.has(e.id) && matchesQuery(e, query));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable
          className="border-t border-line bg-card"
          style={{ borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "88%" }}
        >
          <View className="items-center pb-1 pt-3">
            <View
              style={{ width: 38, height: 4, borderRadius: radius.pill, backgroundColor: colors.cardHi }}
            />
          </View>

          <View style={{ paddingHorizontal: 22, paddingTop: 12 }}>
            <SectionLabel>{title}</SectionLabel>
            <View className="mt-3">
              <SearchField value={query} onChange={setQuery} />
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            {visible.length === 0 ? (
              <Text className="py-6 text-center text-[14px] leading-5 text-muted">
                {query
                  ? `Ingen övning matchar "${query}". Sök funkar på både svenska och engelska namn.`
                  : "Alla övningar i biblioteket är redan valda."}
              </Text>
            ) : (
              <View className="gap-2">
                {visible.map((e) => {
                  // En maskin som aldrig använts här är inget fel — den läggs
                  // till på gymmet när du loggar ditt första set.
                  const newHere = !hereIds.has(e.id);
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => onPick(e.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Lägg till ${e.name}`}
                      className="flex-row items-center gap-3 border border-line px-4 active:opacity-70"
                      style={{ minHeight: 62, borderRadius: radius.md }}
                    >
                      <Feather name="plus" size={18} color={colors.accent} />
                      <View className="flex-1 py-2.5">
                        <Text
                          style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}
                          numberOfLines={1}
                        >
                          {e.name}
                        </Text>
                        <Text
                          style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {[
                            e.nameEn,
                            e.type === "machine" ? "Maskin" : "Fri vikt",
                            newHere && e.type === "machine" && gymName
                              ? `Ny på ${gymName}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {onCreateNew ? (
            <View style={{ paddingHorizontal: 22, paddingBottom: 26, paddingTop: 6 }}>
              <Button
                label="Ny övning eller maskin"
                icon="plus"
                variant="secondary"
                onPress={onCreateNew}
              />
            </View>
          ) : (
            <View style={{ height: 20 }} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
