import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { colors, TAP } from "@/lib/theme";
import { fmtWeight } from "@/lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-[15px] border border-line bg-card ${className}`}>{children}</View>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-widest text-muted">{children}</Text>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  full = true,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
}) {
  const box =
    variant === "primary"
      ? "bg-accent"
      : variant === "secondary"
        ? "border border-accent bg-transparent"
        : variant === "danger"
          ? "border border-danger bg-transparent"
          : "border border-line bg-card";
  const fg =
    variant === "primary"
      ? colors.white
      : variant === "secondary"
        ? colors.accent
        : variant === "danger"
          ? colors.danger
          : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center justify-center gap-2 rounded-[12px] px-4 active:opacity-70 ${box} ${
        full ? "w-full" : ""
      }`}
      style={{ opacity: disabled ? 0.4 : 1, minHeight: 54 }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={18} color={fg} /> : null}
          <Text style={{ color: fg }} className="text-base font-semibold">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      className={`rounded-full border px-4 active:opacity-70 ${
        active ? "border-accent bg-accent" : "border-line bg-card"
      }`}
      style={{ minHeight: 42, justifyContent: "center" }}
    >
      <Text
        style={{ color: active ? colors.white : colors.ink }}
        className="text-sm font-semibold"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * En siffra som betyder något, med sin jämförelse under.
 *
 * `note` får bara stå där när jämförelsen faktiskt går att göra. Ton B: positiv
 * återkoppling ska påstå det som är sant ur datan, och "+40 %" mot ett snitt som
 * bara bygger på en halv månad vore en glädjekalkyl.
 */
export function StatTile({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const noteColor = tone === "up" ? colors.ok : tone === "down" ? colors.muted : colors.mutedDim;

  return (
    <View
      className="flex-1 rounded-[16px] border border-line bg-card"
      style={{ paddingHorizontal: 14, paddingVertical: 13, minHeight: 92 }}
    >
      <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </Text>
      <Text
        className="text-ink"
        style={{
          fontSize: 26,
          fontWeight: "700",
          letterSpacing: -0.6,
          marginTop: 6,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {note ? (
        <Text style={{ fontSize: 11.5, color: noteColor, marginTop: 4 }} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Den stora +/–-raden. Enda sättet att ändra vikt och reps under ett pass —
 * appen öppnar aldrig tangentbordet mellan set (designprincip 2).
 *
 * Knapparna är TAP×TAP stora (64pt, långt över Apples 44) eftersom de trycks
 * på med svettiga fingrar. Värdet i mitten är avsiktligt stort nog att läsas
 * på armlängds avstånd.
 */
export function Stepper({
  value,
  unit,
  step,
  min = 0,
  max,
  decimals = false,
  onChange,
  label,
}: {
  value: number;
  unit: string;
  step: number;
  min?: number;
  max?: number;
  decimals?: boolean;
  onChange: (next: number) => void;
  label: string;
}) {
  function bump(dir: 1 | -1) {
    const raw = value + dir * step;
    // Flyttalsaddition ger 47.50000000000001 — avrunda till stegets upplösning.
    const next = Math.round(raw * 100) / 100;
    if (next < min) return;
    if (max !== undefined && next > max) return;
    Haptics.selectionAsync();
    onChange(next);
  }

  const shown = decimals ? fmtWeight(value) : String(value);

  return (
    <View className="flex-row items-center overflow-hidden rounded-[15px] border border-line bg-card">
      <StepButton icon="minus" onPress={() => bump(-1)} label={`Minska ${label}`} />
      <View className="flex-1 items-center justify-center px-1">
        <Text className="font-bold text-ink" style={{ fontSize: 38, letterSpacing: -1 }}>
          {shown}
        </Text>
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted">{unit}</Text>
      </View>
      <StepButton icon="plus" onPress={() => bump(1)} label={`Öka ${label}`} />
    </View>
  );
}

function StepButton({
  icon,
  onPress,
  label,
}: {
  icon: "plus" | "minus";
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center justify-center bg-card-hi active:opacity-60"
      style={{ width: TAP + 12, height: TAP + 16 }}
    >
      <Feather name={icon} size={30} color={colors.ink} />
    </Pressable>
  );
}

/**
 * Sökfält för övningslistor. Matchar både svenskt och engelskt namn — vilket
 * språk man tänker på beror på om man läser skylten eller minns vad man kallar
 * övningen.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Sök övning",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="flex-row items-center gap-2.5 rounded-[12px] border border-line bg-card px-3.5">
      <Feather name="search" size={17} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        className="flex-1 text-[16px] text-ink"
        style={{ minHeight: 46 }}
      />
    </View>
  );
}

export function Empty({ icon, title, body }: { icon: keyof typeof Feather.glyphMap; title: string; body: string }) {
  return (
    <View className="items-center px-8 py-14">
      <Feather name={icon} size={34} color={colors.muted} />
      <Text className="mt-4 text-center text-lg font-semibold text-ink">{title}</Text>
      <Text className="mt-1.5 text-center text-sm leading-5 text-muted">{body}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
