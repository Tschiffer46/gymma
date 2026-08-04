import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { deleteSession, listSessions, useStore, type SessionSummary } from "@/lib/db";
import { Empty, IconButton, Loading, SectionLabel } from "@/components/ui";
import { describeDay, describeMonth, toDayKey, toMonthKey } from "@/lib/dates";
import { fmtVolume } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

const FEELING_LABEL: Record<string, string> = {
  latt: "Lätt",
  lagom: "Lagom",
  tungt: "Tungt",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Loggboken — alla avslutade pass, nyast först.
 *
 * Svep åt vänster för att rätta eller radera; ett tryck öppnar passet, där
 * samma åtgärder finns. Svepet är en genväg, aldrig enda vägen.
 */
export default function SessionsScreen() {
  const store = useStore();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setSessions(await listSessions(store));
    setLoading(false);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDelete(s: SessionSummary) {
    Alert.alert(
      "Radera passet?",
      `${capitalize(describeDay(toDayKey(new Date(s.endedAt))))} · ${s.gymName}. Alla ${s.sets} set försvinner och räknas inte längre i volym eller rekord.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: async () => {
            await deleteSession(store, s.id);
            await load();
          },
        },
      ],
    );
  }

  if (loading) return <Loading />;

  // Grupperas per månad så en lång historik går att överblicka. `toDayKey`/
  // `toMonthKey` räknar lokalt — endedAt ligger i UTC.
  const months: { key: string; items: SessionSummary[] }[] = [];
  for (const s of sessions) {
    const key = toMonthKey(new Date(s.endedAt));
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.items.push(s);
    else months.push({ key, items: [s] });
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        {sessions.length === 0 ? (
          <Empty
            icon="book-open"
            title="Inga pass än"
            body="Avslutade pass hamnar här. Då går de att läsa igen, rätta eller radera."
          />
        ) : (
          <>
            <Text className="mb-5 mt-2 text-[13px] leading-[18px] text-muted">
              Tryck på ett pass för att läsa det och rätta enskilda set. Papperskorgen raderar
              hela passet.
            </Text>

            {months.map((m) => (
              <View key={m.key} className="mb-7">
                <SectionLabel>{describeMonth(m.key)}</SectionLabel>
                <View className="mt-3 gap-2">
                  {m.items.map((s) => (
                    <View
                      key={s.id}
                      className="flex-row items-center border border-line bg-card pl-4"
                      style={{ minHeight: 74, borderRadius: radius.md }}
                    >
                      <Pressable
                        onPress={() =>
                          router.push({ pathname: "/session/[id]", params: { id: s.id } })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${describeDay(toDayKey(new Date(s.endedAt)))}, ${s.gymName}, ${s.sets} set`}
                        className="flex-1 flex-row items-center gap-2 py-3 active:opacity-70"
                      >
                        <View className="flex-1">
                          <Text
                            className="text-[16px] font-semibold text-ink"
                            numberOfLines={1}
                          >
                            {capitalize(describeDay(toDayKey(new Date(s.endedAt))))}
                          </Text>
                          <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
                            {[s.gymName, s.routineName, FEELING_LABEL[s.feeling ?? ""]]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                          <Text
                            className="mt-0.5 text-[12.5px] text-muted"
                            style={{ fontVariant: ["tabular-nums"] }}
                            numberOfLines={1}
                          >
                            {s.sets} set · {fmtVolume(s.volumeKg)}
                            {s.notes ? ` · ${s.notes}` : ""}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={20} color={colors.muted} />
                      </Pressable>

                      <IconButton
                        icon="trash-2"
                        label={`Radera passet ${describeDay(toDayKey(new Date(s.endedAt)))}`}
                        tone="danger"
                        onPress={() => confirmDelete(s)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
