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
  /** Engelskt namn — det som står på maskinskylten. Söks och matchas mot. */
  nameEn: string | null;
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
  /** Vilken plan passet följde, om någon. */
  routineId: string | null;
};

/**
 * En sparad ordning av övningar — aldrig ett krav.
 *
 * Designprincip 4 säger att programmet ska växa fram. Rutinen är därför en
 * genväg till det man brukar göra, inte ett schema som stänger ute annat: under
 * ett pass går det alltid att växla till hela biblioteket och logga något som
 * inte står i planen.
 */
export type Routine = Timestamps & {
  id: string;
  name: string;
};

/** Rutin med antal övningar — det listvyn behöver. */
export type RoutineSummary = Routine & { itemCount: number };

/** Rutin med hur många pass som faktiskt kört den — sorterar snabbstarten. */
export type RoutineUsage = RoutineSummary & { sessions: number };

/** Gym med hur många pass som körts där — sorterar snabbstarten. */
export type GymUsage = Gym & { sessions: number };

/**
 * En planerad dag och passet som är tänkt den dagen.
 *
 * `routineId` är nullbar med flit: en dag utan pass är ett fullgott läge.
 * Designprincip 4 säger att programmet växer fram — att välja dag ska aldrig
 * tvinga fram ett beslut om vad man ska köra.
 */
export type PlannedDayPlan = {
  day: string;
  routineId: string | null;
  routineName: string | null;
};

/** Summering av en månad. Månader helt utan avslutade pass saknas i listan. */
export type MonthTotals = {
  /** 'YYYY-MM', lokal tid. */
  month: string;
  sessions: number;
  volumeKg: number;
  sets: number;
};

export type RoutineItem = {
  id: string;
  position: number;
  exercise: Exercise;
};

export type RoutineDetail = Routine & { items: RoutineItem[] };

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
 * Ett avslutat pass som det visas i historiken.
 *
 * Gym- och plannamn följer med från joinen så listan aldrig behöver ett anrop
 * per rad. En raderad plan ger `routineName: null` — samma regel som
 * `listPlannedDayPlans`: hellre passlös än en dinglande referens.
 */
export type SessionSummary = {
  id: string;
  gymId: string;
  gymName: string;
  routineId: string | null;
  routineName: string | null;
  startedAt: string;
  endedAt: string;
  feeling: Feeling | null;
  notes: string | null;
  sets: number;
  volumeKg: number;
  exercises: number;
};

/** Passets set samlade per övning, i den ordning övningarna kördes. */
export type SessionExerciseGroup = {
  exercise: Exercise;
  machine: Machine | null;
  sets: SetEntry[];
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
