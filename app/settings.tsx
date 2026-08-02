import { useCallback, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { createGym, listGyms, renameGym, useStore, type Gym } from "@/lib/db";
import { Button, Card, SectionLabel } from "@/components/ui";
import { RELEASE } from "@/lib/release";
import { colors } from "@/lib/theme";

/**
 * Inställningar. Avsiktligt tunn — det enda som faktiskt behöver ställas in är
 * gymmens namn. Viktsteg sätts i loggvyn där man ser magasinet.
 */
export default function SettingsScreen() {
  const store = useStore();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [newGym, setNewGym] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setGyms(await listGyms(store));
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function addGym() {
    const name = newGym.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createGym(store, name);
      setNewGym("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel>Gym</SectionLabel>
        <Text className="mt-1.5 text-[13px] leading-[18px] text-muted">
          Progression mäts per maskin och gym — 50 kg på en bröstpress är inte 50 kg på en annan.
        </Text>

        <View className="mt-3 gap-2">
          {gyms.map((g) => (
            <GymNameField key={g.id} gym={g} onSaved={load} />
          ))}
        </View>

        <View className="mt-4 flex-row gap-2">
          <TextInput
            value={newGym}
            onChangeText={setNewGym}
            placeholder="Nytt gym"
            placeholderTextColor={colors.muted}
            onSubmitEditing={addGym}
            returnKeyType="done"
            className="flex-1 rounded-[12px] border border-line bg-card px-4 text-[17px] text-ink"
            style={{ minHeight: 52 }}
          />
          <View style={{ width: 110 }}>
            <Button
              label="Lägg till"
              variant="secondary"
              onPress={addGym}
              disabled={newGym.trim().length === 0}
              loading={busy}
            />
          </View>
        </View>

        <View className="mt-9">
          <SectionLabel>Om</SectionLabel>
          <Card className="mt-2 px-4 py-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] text-muted">Version</Text>
              <Text className="text-[15px] font-semibold text-ink">{RELEASE}</Text>
            </View>
          </Card>
          <Text className="mt-3 text-[13px] leading-[18px] text-muted">
            All data ligger lokalt på den här telefonen. Ingen inloggning, ingen server — appen
            fungerar lika bra i flygplansläge.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Gymnamn sparas när fältet tappar fokus — ingen sparaknapp att glömma. */
function GymNameField({ gym, onSaved }: { gym: Gym; onSaved: () => void }) {
  const store = useStore();
  const [value, setValue] = useState(gym.name);

  async function commit() {
    const name = value.trim();
    if (!name || name === gym.name) {
      setValue(gym.name);
      return;
    }
    await renameGym(store, gym.id, name);
    onSaved();
  }

  return (
    <View className="flex-row items-center rounded-[12px] border border-line bg-card px-4">
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        className="flex-1 text-[17px] text-ink"
        style={{ minHeight: 52 }}
      />
      {gym.isDefault ? (
        <Text className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: colors.accent }}>
          Aktivt
        </Text>
      ) : null}
    </View>
  );
}
