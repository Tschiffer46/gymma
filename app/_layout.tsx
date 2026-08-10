import { Component, type ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ScrollView, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DbProvider, useDbState } from "@/lib/db";
import { Loading } from "@/components/ui";
import { RELEASE } from "@/lib/release";
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
 * Fångar JS-fel i renderingen och visar dem i stället för en vit eller död skärm.
 *
 * **Var ärlig om vad den täcker:** en native-krasch (som svep-buggen 2026-08-04)
 * dödar processen och når aldrig hit. Det den ger är att JS-klassen av fel blir
 * *rapporterbar* — versionsmarkören står på skärmen, så nästa felrapport från
 * familjen säger vilken OTA som gick sönder i stället för "appen är konstig".
 *
 * Ren React, noll beroenden ⇒ OTA-bart. Class-komponent för att
 * `componentDidCatch` inte finns som hook.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View className="flex-1 bg-bg" style={{ paddingTop: 90, paddingHorizontal: 28 }}>
        <Text className="text-lg font-semibold text-ink">Något gick fel</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          Starta om appen. Händer det igen — skicka texten nedan, den säger vilken version som
          gick sönder.
        </Text>
        <Text className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted">
          Version
        </Text>
        <Text className="mt-1 text-[15px] font-semibold text-ink">{RELEASE}</Text>
        <ScrollView className="mt-5" style={{ maxHeight: 260 }}>
          <Text selectable style={{ fontSize: 12, lineHeight: 17, color: colors.mutedDim }}>
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

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
      {/* Loggvyn ritar sin egen topprad (namn + setpips) och behöver hela
          höjden till vikten — systemheadern hade ätit 44 pt och dubblerat
          tillbakaknappen. */}
      <Stack.Screen name="log/[exerciseId]" options={{ headerShown: false }} />
      <Stack.Screen name="session/end" options={{ ...header, title: "Avsluta pass" }} />
      <Stack.Screen name="session/[id]" options={{ ...header, title: "Passet" }} />
      <Stack.Screen name="sessions" options={{ ...header, title: "Träningspass" }} />
      <Stack.Screen name="routine/[id]" options={{ ...header, title: "Plan" }} />
      <Stack.Screen name="library" options={{ ...header, title: "Övningsbibliotek" }} />
      <Stack.Screen name="exercise/[id]" options={{ ...header, title: "Redigera övning" }} />
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
        <ErrorBoundary>
          <DbProvider>
            <Gate />
            <StatusBar style="light" />
          </DbProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
