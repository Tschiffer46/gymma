import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { colors } from "@/lib/theme";

const PLANNED: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  {
    icon: "edit-3",
    title: "Namngivna pass",
    body: 'Egna rutiner som "Överkropp" eller "Ben tisdag".',
  },
  {
    icon: "move",
    title: "Dra in övningar och ordna dem",
    body: "Välj övningar ur biblioteket och sätt ordningen du faktiskt kör dem i.",
  },
  {
    icon: "play",
    title: "Följ planen i gymmet",
    body: 'Starta ett pass med "Följ en plan" så ligger övningarna i rätt ordning direkt.',
  },
];

/**
 * "Planera" — skal.
 *
 * En plan blir en **sparad ordning**, aldrig ett krav: designprincip 4 säger
 * att programmet ska växa fram. Du ska fortfarande kunna logga vad som helst
 * utanför planen, och maskiner läggs fortfarande till första gången de används.
 * Planen är en genväg, inte en grind.
 */
export default function PlanScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        <Text className="pb-1 pt-2 text-3xl font-bold tracking-tight text-ink">Planera</Text>
        <Text className="mb-7 text-[14px] leading-5 text-muted">
          Byggs härnäst. Tanken är att en plan ska vara en sparad ordning, inte ett schema du
          måste följa.
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
          Till dess: kör på egen hand. Listan sorterar ändå det du inte gjort idag överst, och
          det du använde senast därefter.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
