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
 * Lokalt kalenderdatum som 'YYYY-MM-DD'.
 *
 * Medvetet INTE `toISOString().slice(0,10)` — den konverterar till UTC först,
 * och en svensk sommarkväll klockan 23 blir då fel dag.
 */
export function toDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

export function monthName(month: number): string {
  return MONTHS[month] ?? "";
}

/**
 * Rutnätet för en månad, måndag först.
 *
 * `null` = tom ruta före den första eller efter den sista i månaden, så att
 * kolumnerna alltid står under rätt veckodag.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // måndag = 0

  const cells: (string | null)[] = new Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDayKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 'YYYY-MM' i lokal tid — nyckeln `monthlyTotals` grupperar på. */
export function toMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Första och sista kalenderdagen i ett spann av månader, inklusive båda.
 *
 * `monthsBack: 0` ger den aktuella månaden. `new Date(year, month + 1, 0)` är
 * sista dagen i månaden — dag 0 i nästa månad, vilket också hanterar skottår.
 */
export function monthSpanDays(
  year: number,
  month: number,
  monthsBack = 0,
): { from: string; to: string } {
  return {
    from: toDayKey(new Date(year, month - monthsBack, 1)),
    to: toDayKey(new Date(year, month + 1, 0)),
  };
}

/** "augusti 2026" — rubriken över månadsbrickorna. */
export function describeMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${monthName(m - 1)} ${y}`;
}

/**
 * Tidsanpassad hälsning.
 *
 * Ton B: en hälsning, ingen coach. "Dags att bli starkare" hade sagt samma sak
 * varje dag och låtit som en tränare — det här känns i stället som att appen
 * vet vilken tid på dygnet du öppnade den.
 */
export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "God natt";
  if (h < 10) return "God morgon";
  if (h < 13) return "God förmiddag";
  if (h < 18) return "God eftermiddag";
  return "God kväll";
}

/** "torsdag 7 augusti" — för raden om nästa pass. */
export function describeDay(key: string): string {
  const d = dayKeyToDate(key);
  return `${weekdayName(d.getDay()).toLowerCase()} ${d.getDate()} ${monthName(d.getMonth())}`;
}

/** Hela dagar mellan två kalenderdatum, oberoende av klockslag. */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = dayKeyToDate(fromKey).getTime();
  const b = dayKeyToDate(toKey).getTime();
  return Math.round((b - a) / 86_400_000);
}
