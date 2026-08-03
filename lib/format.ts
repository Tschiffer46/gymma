// Svenska talformat. Decimalkomma överallt — 2,5 kg, inte 2.5 kg.

/** 50 → "50", 2.5 → "2,5". Aldrig efterföljande nollor. */
export function fmtWeight(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  return String(rounded).replace(".", ",");
}

/**
 * Enhetstexten. Hantlar visar konventionen explicit — blandas totalvikt och
 * vikt-per-hantel blir volymkurvan brus, så den får aldrig vara underförstådd.
 */
export function weightUnitLabel(perHand: boolean): string {
  return perHand ? "kg/hantel" : "kg";
}

/**
 * "50 kg × 10, 10, 9" när vikten var densamma hela vägen,
 * annars "50×10, 55×8, 60×6".
 */
export function formatSets(
  sets: { weightKg: number; reps: number }[],
  perHand: boolean,
): string {
  if (sets.length === 0) return "";
  const unit = weightUnitLabel(perHand);
  const sameWeight = sets.every((s) => s.weightKg === sets[0].weightKg);
  if (sameWeight) {
    return `${fmtWeight(sets[0].weightKg)} ${unit} × ${sets.map((s) => s.reps).join(", ")}`;
  }
  return sets.map((s) => `${fmtWeight(s.weightKg)}×${s.reps}`).join(", ");
}

/**
 * Volym i ton när den blivit stor nog att bli oläslig i kilo.
 * 12 400 kg → "12,4 t". Under ett ton behålls kilo.
 */
export function fmtVolume(kg: number): string {
  if (kg < 1000) return `${Math.round(kg)} kg`;
  return `${fmtWeight(Math.round(kg / 100) / 10)} t`;
}

const NUMBER_WORDS = ["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"];

/** "tre" i stället för "3" — läsbarare i löpande text. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Passets längd: "4 min", "47 min", "1 h 12 min". */
export function formatElapsed(fromIso: string, nowMs: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(fromIso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "idag", "igår", "3 dagar sedan", "2 veckor sedan". */
export function relativeDay(iso: string | null): string {
  if (!iso) return "aldrig";
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "idag";
  if (days === 1) return "igår";
  if (days < 7) return `${days} dagar sedan`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 vecka sedan";
  if (weeks < 9) return `${weeks} veckor sedan`;
  return `${Math.floor(days / 30)} mån sedan`;
}
