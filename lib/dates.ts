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

/** Måndag först — ordningen veckoraden visas i. Värdet är `strftime('%w')`-numret. */
export const WEEKDAYS_MONDAY_FIRST: { dow: number; short: string }[] = [
  { dow: 1, short: "Mån" },
  { dow: 2, short: "Tis" },
  { dow: 3, short: "Ons" },
  { dow: 4, short: "Tor" },
  { dow: 5, short: "Fre" },
  { dow: 6, short: "Lör" },
  { dow: 0, short: "Sön" },
];

/**
 * Nästa dag du tänkt träna.
 *
 * `daysFromNow: 0` betyder att i dag är en träningsdag. Är listan tom finns
 * inget att svara — då säger startvyn i stället att dagarna inte är valda ännu.
 *
 * Ren funktion utan databasberoende, så den kan testas direkt.
 */
export function nextTrainingDay(
  days: number[],
  from: Date = new Date(),
): { dow: number; daysFromNow: number } | null {
  if (days.length === 0) return null;

  const today = from.getDay();
  for (let ahead = 0; ahead < 7; ahead++) {
    const dow = (today + ahead) % 7;
    if (days.includes(dow)) return { dow, daysFromNow: ahead };
  }
  return null;
}
