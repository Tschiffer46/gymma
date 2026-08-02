import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { colors } from "@/lib/theme";

const PLANNED: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  {
    icon: "bar-chart-2",
    title: "Volym per muskelgrupp",
    body: "Hur många kilo du faktiskt flyttat per vecka, fördelat på bröst, rygg, ben och axlar.",
  },
  {
    icon: "trending-up",
    title: "Progression per maskin",
    body: "En kurva per maskin. Viktskalor skiljer sig mellan gym, så varje maskin får sin egen linje.",
  },
  {
    icon: "calendar",
    title: "Hur ofta du tränar",
    body: "Antal pass per vecka och månad, och hur långa de varit.",
  },
];

/**
 * "Följ upp" — skal tills det finns data värd att visa.
 *
 * Medvetet ärligt om att vyn är tom: en attrapp med påhittade siffror vore
 * sämre än en tom yta som säger vad som kommer.
 */
export default function InsightsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        <Text className="pb-1 pt-2 text-3xl font-bold tracking-tight text-ink">Följ upp</Text>
        <Text className="mb-7 text-[14px] leading-5 text-muted">
          Insikterna byggs härnäst. De blir användbara först när du loggat några veckor — därför
          kommer de efter att du haft appen med dig ett tag.
        </Text>

        <View className="gap-2.5">
          {PLANNED.map((p) => (
            <Card key={p.title} className="flex-row gap-3.5 px-4 py-4">
              <Feather name={p.icon} size={20} color={colors.muted} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-[16px] font-semibold text-ink">{p.title}</Text>
                <Text className="mt-1 text-[13.5px] leading-[19px] text-muted">{p.body}</Text>
              </View>
            </Card>
          ))}
        </View>

        <Text className="mt-7 text-[13px] leading-[18px] text-muted">
          Allt du loggar nu räknas — datan sparas fullt ut redan i dag, så insikterna får
          historik från första passet när de väl kopplas på.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
