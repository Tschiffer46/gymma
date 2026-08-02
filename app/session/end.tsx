import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  endSession,
  getCurrentSession,
  listGymsByRecentUse,
  sessionSetCount,
  useStore,
  type Feeling,
  type Session,
} from "@/lib/db";
import { Button, Loading, SectionLabel } from "@/components/ui";
import { formatElapsed } from "@/lib/format";
import { colors } from "@/lib/theme";

const FEELINGS: { key: Feeling; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "latt", label: "Lätt", icon: "feather" },
  { key: "lagom", label: "Lagom", icon: "check-circle" },
  { key: "tungt", label: "Tungt", icon: "alert-circle" },
];

/**
 * Avsluta passet.
 *
 * Känslan är tre fasta val — ett tryck, inget tangentbord. Kommentaren är
 * frivillig; passet är slut när man kommer hit, så ett tangentbord är okej här
 * på ett sätt det aldrig är mellan set.
 */
export default function EndSessionScreen() {
  const store = useStore();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [gymName, setGymName] = useState("");
  const [sets, setSets] = useState(0);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const gyms = await listGymsByRecentUse(store);
    for (const g of gyms) {
      const s = await getCurrentSession(store, g.id);
      if (s) {
        setSession(s);
        setGymName(g.name);
        setSets(await sessionSetCount(store, s.id));
        break;
      }
    }
    setLoading(false);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function finish() {
    if (!session || busy) return;
    setBusy(true);
    try {
      await endSession(store, session.id, { feeling, notes: notes.trim() || null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8" edges={["bottom"]}>
        <Text className="text-center text-ink">Inget pågående pass.</Text>
      </SafeAreaView>
    );
  }

  const empty = sets === 0;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-7 mt-1 rounded-[15px] border border-line bg-card px-4 py-4">
          <Text className="text-[17px] font-bold text-ink">{gymName}</Text>
          <Text className="mt-1 text-[14px] text-muted">
            {formatElapsed(session.startedAt)} · {sets} set
          </Text>
        </View>

        {empty ? (
          <Text className="mb-6 text-[14px] leading-5" style={{ color: colors.muted }}>
            Du loggade inga set. Passet sparas inte — det hade bara blivit brus i historiken.
          </Text>
        ) : (
          <>
            <SectionLabel>Hur kändes det?</SectionLabel>
            <View className="mt-3 flex-row gap-2">
              {FEELINGS.map((f) => {
                const active = feeling === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setFeeling(active ? null : f.key);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 items-center justify-center gap-1.5 rounded-[15px] border py-4 active:opacity-70 ${
                      active ? "border-accent bg-accent-soft" : "border-line bg-card"
                    }`}
                  >
                    <Feather
                      name={f.icon}
                      size={22}
                      color={active ? colors.accent : colors.muted}
                    />
                    <Text
                      className="text-[14px] font-semibold"
                      style={{ color: active ? colors.accent : colors.ink }}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-7">
              <SectionLabel>Anteckning (valfritt)</SectionLabel>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="t.ex. Ont i axeln på sista setet"
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
                className="mt-2 rounded-[15px] border border-line bg-card px-4 py-3 text-[16px] text-ink"
                style={{ minHeight: 110 }}
              />
            </View>
          </>
        )}
      </ScrollView>

      <View className="gap-2 border-t border-line px-4 pb-1 pt-3">
        <Button
          label={empty ? "Kasta passet" : "Avsluta passet"}
          icon={empty ? "trash-2" : "check"}
          variant={empty ? "danger" : "primary"}
          onPress={finish}
          loading={busy}
        />
        <Button label="Fortsätt träna" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}
