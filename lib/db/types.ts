// Radtyper som speglar schemat i migrations.ts exakt.
//
// SQLite har ingen boolean och ingen array: `is_default` är 0/1 och
// muskellistorna är JSON-strängar. De råa raderna heter *Row; queries.ts
// returnerar de avkodade typerna nedan.

export type ExerciseType = "machine" | "freeweight";

/**
 * Hur vikten som skrivs in ska tolkas.
 * - `total`    — vikten på stacken/stången, används som den är.
 * - `per_hand` — vikt per hantel. Volym räknas ×2.
 *
 * Detta är ett tillägg utöver specen: `type: 'freeweight'` täcker både hantlar
 * och skivstång, och utan den här kolumnen kan volymberäkningen inte veta när
 * den ska gånga med två. Blandas konventionerna blir volymkurvan brus.
 */
export type WeightUnit = "total" | "per_hand";

type Timestamps = {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Gym = Timestamps & {
  id: string;
  name: string;
  isDefault: boolean;
};

export type Exercise = Timestamps & {
  id: string;
  name: string;
  type: ExerciseType;
  weightUnit: WeightUnit;
  weightStep: number;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** Normaliserat namn — enda nyckeln som får avgöra "är detta samma övning?". */
  matchKey: string;
  mergedIntoId: string | null;
};

export type Machine = Timestamps & {
  id: string;
  gymId: string;
  exerciseId: string;
  manufacturer: string | null;
  /** Stabil per maskinmodell (t.ex. '0E001960AB') — starkaste matchningssignalen. */
  articleCode: string | null;
  /** Det OCR faktiskt läste, sparas rått för framtida matchning. */
  ocrText: string | null;
  photoUri: string | null;
  seatSettings: string | null;
  weightStep: number;
  lastUsedAt: string | null;
};

/** Hur passet kändes. Tre fasta val = ett tryck, inget tangentbord. */
export type Feeling = "latt" | "lagom" | "tungt";

export type Session = Timestamps & {
  id: string;
  gymId: string;
  startedAt: string;
  endedAt: string | null;
  feeling: Feeling | null;
  notes: string | null;
};

/** Ett tidigare pass för en övning — underlaget till "senaste gångerna". */
export type PastPerformance = {
  sessionId: string;
  performedAt: string;
  sets: { weightKg: number; reps: number }[];
};

export type SetEntry = Timestamps & {
  id: string;
  sessionId: string;
  machineId: string | null;
  exerciseId: string;
  weightKg: number;
  reps: number;
  setIndex: number;
  loggedAt: string;
};

/**
 * En rad i startskärmens avbockningslista: övningen plus det appen behöver
 * visa utan ett extra anrop per rad.
 */
export type ExerciseListItem = {
  exercise: Exercise;
  machine: Machine | null;
  /** Seten från senaste passet övningen kördes, i ordning. */
  lastSets: { weightKg: number; reps: number }[];
  lastPerformedAt: string | null;
  doneToday: boolean;
};
