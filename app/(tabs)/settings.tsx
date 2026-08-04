import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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
  const router = useRouter();
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
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="pb-5 pt-2 text-3xl font-bold tracking-tight text-ink">Inställningar</Text>

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
          <SectionLabel>Övningar</SectionLabel>
          <SettingsRow
            icon="list"
            title="Övningsbibliotek"
            body="Ändra namn, viktenhet och viktsteg. Radera det du aldrig kör."
            onPress={() => router.push("/library")}
          />
        </View>

        <View className="mt-9">
          <SectionLabel>Historik</SectionLabel>
          <SettingsRow
            icon="book-open"
            title="Träningspass"
            body="Läs igenom, rätta ett felloggat set eller radera ett pass."
            onPress={() => router.push("/sessions")}
          />
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

function SettingsRow({
  icon,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="mt-2 flex-row items-center gap-3 rounded-[12px] border border-line bg-card px-4 active:opacity-70"
      style={{ minHeight: 58 }}
    >
      <Feather name={icon} size={18} color={colors.muted} />
      <View className="flex-1 py-2.5">
        <Text className="text-[16px] text-ink">{title}</Text>
        <Text className="mt-0.5 text-[12.5px] text-muted">{body}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
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
