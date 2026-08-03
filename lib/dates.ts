// Datumhjälpare. Veckan börjar på måndag (svensk konvention).
//
// Ligger utanför lib/db/ eftersom queries.ts tar färdiga ISO-strängar som
// parametrar — det är vad som håller datalagret testbart i Node.

const DAY_MS = 86_400_000;

/** Måndag 00:00 lokal tid, som ISO-sträng. */
export function startOfWeekIso(from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = söndag. Söndag hör till veckan som började sex dagar tidigare.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.toISOString();
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** 0 = söndag, som SQLites `strftime('%w')`. */
const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];

export function weekdayName(dow: number): string {
  return WEEKDAYS[dow] ?? "";
}

/** Måndag först — ordningen veckoraden visas i. */
export const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
