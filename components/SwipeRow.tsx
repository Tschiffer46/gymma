import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { colors, radius } from "@/lib/theme";

/**
 * Rad med Redigera och Radera bakom ett vänstersvep.
 *
 * **Svepet är aldrig enda vägen till en åtgärd.** Ett tryck på raden ska alltid
 * leda till en vy där samma sak går att göra. Skälet är projektets historia:
 * NativeWind gick sönder tyst i ett releasebygge medan alla kontroller var
 * gröna, och ett gestbaserat mönster kan inte verifieras utan telefon. Går
 * svepet sönder är ingen funktion borta — bara en genväg.
 *
 * `react-native-gesture-handler` är redan installerad och
 * `GestureHandlerRootView` redan monterad i `app/_layout.tsx`, så det här
 * kostar ingen ny native-modul och kan gå ut som en OTA.
 */
export function SwipeRow({
  children,
  onEdit,
  onDelete,
  deleteLabel = "Radera",
}: {
  children: ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  deleteLabel?: string;
}) {
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, _translation, methods) => (
        <View className="flex-row items-stretch" style={{ gap: 8, paddingLeft: 8 }}>
          {onEdit ? (
            <SwipeAction
              icon="edit-2"
              label={`Redigera. ${deleteLabel} finns också.`}
              text="Ändra"
              tone={colors.ink}
              background={colors.cardHi}
              onPress={() => {
                methods.close();
                onEdit();
              }}
            />
          ) : null}
          <SwipeAction
            icon="trash-2"
            label={deleteLabel}
            text={deleteLabel}
            tone={colors.white}
            background={colors.danger}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              methods.close();
              onDelete();
            }}
          />
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  icon,
  label,
  text,
  tone,
  background,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  text: string;
  tone: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center justify-center gap-1 active:opacity-70"
      style={{ width: 76, borderRadius: radius.md, backgroundColor: background }}
    >
      <Feather name={icon} size={18} color={tone} />
      <Text style={{ fontSize: 11.5, fontWeight: "600", color: tone }}>{text}</Text>
    </Pressable>
  );
}
