import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DbProvider, useDbState } from "@/lib/db";
import { Loading } from "@/components/ui";
import { colors } from "@/lib/theme";
import "../global.css";

const header = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.ink,
  headerTitleStyle: { color: colors.ink },
  headerBackTitle: "Tillbaka",
  headerShadowVisible: false,
} as const;

/**
 * Laddningsgrind: resten av appen monteras först när migrationer och seed är
 * klara. Det gör att useStore() aldrig kan anropas mot en halvöppen databas,
 * och att en trasig migrering syns som ett tydligt fel i stället för en tom
 * lista.
 */
function Gate() {
  const { store, error } = useDbState();

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-bg px-8">
        <Text className="text-center text-lg font-semibold text-ink">
          Databasen kunde inte öppnas
        </Text>
        <Text className="text-center text-sm leading-5 text-muted">{error.message}</Text>
      </View>
    );
  }

  if (!store) return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="log/[exerciseId]" options={{ ...header, title: "" }} />
      <Stack.Screen name="session/end" options={{ ...header, title: "Avsluta pass" }} />
      {/* Vanlig push, inte modal: skärmen ersätter sig själv med loggvyn när
          övningen sparats (router.replace), och då blir en modal presentation
          bara i vägen. */}
      <Stack.Screen name="exercise/new" options={{ ...header, title: "Ny övning" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <DbProvider>
          <Gate />
          <StatusBar style="light" />
        </DbProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
