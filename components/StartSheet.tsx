import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Gym, RoutineSummary } from "@/lib/db";
import { Button, SectionLabel } from "@/components/ui";
import { relativeDay } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

type GymWithUse = Gym & { lastUsedAt: string | null };

/**
 * Bottenarket bakom "Byt plan · Kör på egen hand".
 *
 * Gymvalet försvann inte i poleringen, det flyttade hit. Startvyn svarar på
 * "hur ligger jag till" och startar med ett tryck; det ovanliga valet — annat
 * gym, annan plan — ligger ett tryck bort i stället för att ta halva skärmen.
 */
export function StartSheet({
  open,
  gyms,
  routines,
  selectedGymId,
  onSelectGym,
  onAddGym,
  onStart,
  onClose,
}: {
  open: boolean;
  gyms: GymWithUse[];
  routines: RoutineSummary[];
  selectedGymId: string | null;
  onSelectGym: (id: string) => void;
  onAddGym: (name: string) => Promise<void>;
  onStart: (routineId: string | null) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newGym, setNewGym] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveGym() {
    const name = newGym.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onAddGym(name);
      setNewGym("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable
          className="border-t border-line bg-card"
          style={{ borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "86%" }}
        >
          <View className="items-center pb-1 pt-3">
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: radius.pill,
                backgroundColor: colors.cardHi,
              }}
            />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 14, paddingTop: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <SectionLabel>Var tränar du?</SectionLabel>
            <View className="mt-3 gap-2">
              {gyms.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => onSelectGym(g.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedGymId === g.id }}
                  className={`flex-row items-center justify-between border px-4 active:opacity-70 ${
                    selectedGymId === g.id ? "border-accent bg-accent-soft" : "border-line"
                  }`}
                  style={{ minHeight: 60, borderRadius: radius.md }}
                >
                  <View className="flex-1">
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>
                      {g.name}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
                      {g.lastUsedAt ? `Senast ${relativeDay(g.lastUsedAt)}` : "Aldrig tränat här"}
                    </Text>
                  </View>
                  {selectedGymId === g.id ? (
                    <Feather name="check" size={19} color={colors.accent} />
                  ) : null}
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
                    onSubmitEditing={saveGym}
                    returnKeyType="done"
                    className="flex-1 border border-line px-4 text-[16px] text-ink"
                    style={{ minHeight: 60, borderRadius: radius.md }}
                  />
                  <View style={{ width: 100, justifyContent: "center" }}>
                    <Button label="Spara" variant="secondary" onPress={saveGym} loading={busy} />
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setAdding(true)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 border border-dashed border-line px-4 active:opacity-60"
                  style={{ minHeight: 52, borderRadius: radius.md }}
                >
                  <Feather name="plus" size={16} color={colors.muted} />
                  <Text style={{ fontSize: 14.5, color: colors.muted }}>Nytt gym</Text>
                </Pressable>
              )}
            </View>

            {routines.length > 0 ? (
              <View className="mt-7">
                <SectionLabel>Följ en plan</SectionLabel>
                <View className="mt-3 gap-2">
                  {routines.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => onStart(r.id)}
                      disabled={!selectedGymId}
                      accessibilityRole="button"
                      accessibilityLabel={`Starta passet med planen ${r.name}`}
                      className="flex-row items-center gap-3 border border-line px-4 active:opacity-70"
                      style={{
                        minHeight: 62,
                        borderRadius: radius.md,
                        opacity: selectedGymId ? 1 : 0.4,
                      }}
                    >
                      <Feather name="clipboard" size={17} color={colors.accent} />
                      <View className="flex-1">
                        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>
                          {r.name}
                        </Text>
                        <Text style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
                          {r.itemCount === 0
                            ? "Inga övningar än"
                            : `${r.itemCount} ${r.itemCount === 1 ? "övning" : "övningar"}`}
                        </Text>
                      </View>
                      <Feather name="play" size={16} color={colors.muted} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={{ paddingHorizontal: 22, paddingBottom: 26, paddingTop: 6 }}>
            <Button
              label="Kör på egen hand"
              icon="play"
              onPress={() => onStart(null)}
              disabled={!selectedGymId}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
