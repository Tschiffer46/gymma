// All SQL i appen. Inga expo-/react-importer — se core.ts för varför.

import type { Store } from "./core";
import { normalizeName } from "./match";
import type {
  Exercise,
  ExerciseListItem,
  ExerciseType,
  Gym,
  Machine,
  Session,
  SetEntry,
  WeightUnit,
} from "./types";

/**
 * Hur länge ett pass får ligga öppet innan nästa loggade set räknas som ett
 * nytt pass. Ingen start-/stoppknapp finns — designprincip 1 säger att appen
 * inte ska kräva något man måste komma ihåg.
 */
const SESSION_WINDOW_HOURS = 6;

// ---------------------------------------------------------------------------
// Radmappning (snake_case i SQLite → camelCase i appen)
// ---------------------------------------------------------------------------

type Ts = { created_at: string; updated_at: string; deleted_at: string | null };
type GymRow = Ts & { id: string; name: string; is_default: number };
type ExerciseRow = Ts & {
  id: string;
  name: string;
  type: string;
  weight_unit: string;
  weight_step: number;
  primary_muscles: string;
  secondary_muscles: string;
  match_key: string;
  merged_into_id: string | null;
};
type MachineRow = Ts & {
  id: string;
  gym_id: string;
  exercise_id: string;
  manufacturer: string | null;
  article_code: string | null;
  ocr_text: string | null;
  photo_uri: string | null;
  seat_settings: string | null;
  weight_step: number;
  last_used_at: string | null;
};
type SessionRow = Ts & { id: string; gym_id: string; started_at: string; ended_at: string | null };
type SetRow = Ts & {
  id: string;
  session_id: string;
  machine_id: string | null;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  set_index: number;
  logged_at: string;
};

const ts = (r: Ts) => ({ createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at });

/** Muskellistorna lagras som JSON-text; en trasig rad ska inte krascha listan. */
function parseMuscles(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const toGym = (r: GymRow): Gym => ({ ...ts(r), id: r.id, name: r.name, isDefault: r.is_default === 1 });

const toExercise = (r: ExerciseRow): Exercise => ({
  ...ts(r),
  id: r.id,
  name: r.name,
  type: r.type as ExerciseType,
  weightUnit: r.weight_unit as WeightUnit,
  weightStep: r.weight_step,
  primaryMuscles: parseMuscles(r.primary_muscles),
  secondaryMuscles: parseMuscles(r.secondary_muscles),
  matchKey: r.match_key,
  mergedIntoId: r.merged_into_id,
});

const toMachine = (r: MachineRow): Machine => ({
  ...ts(r),
  id: r.id,
  gymId: r.gym_id,
  exerciseId: r.exercise_id,
  manufacturer: r.manufacturer,
  articleCode: r.article_code,
  ocrText: r.ocr_text,
  photoUri: r.photo_uri,
  seatSettings: r.seat_settings,
  weightStep: r.weight_step,
  lastUsedAt: r.last_used_at,
});

const toSession = (r: SessionRow): Session => ({
  ...ts(r),
  id: r.id,
  gymId: r.gym_id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
});

const toSet = (r: SetRow): SetEntry => ({
  ...ts(r),
  id: r.id,
  sessionId: r.session_id,
  machineId: r.machine_id,
  exerciseId: r.exercise_id,
  weightKg: r.weight_kg,
  reps: r.reps,
  setIndex: r.set_index,
  loggedAt: r.logged_at,
});

// ---------------------------------------------------------------------------
// Gym
// ---------------------------------------------------------------------------

export async function listGyms({ db }: Store): Promise<Gym[]> {
  const rows = await db.getAllAsync<GymRow>(
    "SELECT * FROM gym WHERE deleted_at IS NULL ORDER BY created_at ASC",
    [],
  );
  return rows.map(toGym);
}

/** Aktivt gym = `is_default`. Faller tillbaka på det äldsta om flaggan tappats. */
export async function getActiveGym({ db }: Store): Promise<Gym | null> {
  const row = await db.getFirstAsync<GymRow>(
    `SELECT * FROM gym WHERE deleted_at IS NULL
     ORDER BY is_default DESC, created_at ASC LIMIT 1`,
    [],
  );
  return row ? toGym(row) : null;
}

export async function setActiveGym({ db, now }: Store, gymId: string): Promise<void> {
  const t = now();
  await db.runAsync("UPDATE gym SET is_default = 0, updated_at = ? WHERE is_default = 1", [t]);
  await db.runAsync("UPDATE gym SET is_default = 1, updated_at = ? WHERE id = ?", [t, gymId]);
}

export async function createGym({ db, uuid, now }: Store, name: string): Promise<string> {
  const id = uuid();
  const t = now();
  await db.runAsync(
    "INSERT INTO gym (id, name, is_default, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
    [id, name.trim(), t, t],
  );
  return id;
}

export async function renameGym({ db, now }: Store, gymId: string, name: string): Promise<void> {
  await db.runAsync("UPDATE gym SET name = ?, updated_at = ? WHERE id = ?", [name.trim(), now(), gymId]);
}

// ---------------------------------------------------------------------------
// Övningar och maskiner
// ---------------------------------------------------------------------------

export async function getExercise({ db }: Store, id: string): Promise<Exercise | null> {
  const row = await db.getFirstAsync<ExerciseRow>("SELECT * FROM exercise WHERE id = ?", [id]);
  return row ? toExercise(row) : null;
}

/**
 * Enda tillåtna vägen att kolla "finns den här övningen redan?".
 *
 * Både manuell inmatning och (från sprint 3) kamera/OCR måste gå via den här
 * innan de skapar en ny post — annars splittras månadstrenden i två halva
 * serier som båda är oanvändbara.
 */
export async function findExerciseByName({ db }: Store, name: string): Promise<Exercise | null> {
  const row = await db.getFirstAsync<ExerciseRow>(
    "SELECT * FROM exercise WHERE match_key = ? AND deleted_at IS NULL AND merged_into_id IS NULL LIMIT 1",
    [normalizeName(name)],
  );
  return row ? toExercise(row) : null;
}

export async function createExercise(
  { db, uuid, now }: Store,
  input: {
    name: string;
    type: ExerciseType;
    weightUnit: WeightUnit;
    weightStep: number;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
  },
): Promise<string> {
  const id = uuid();
  const t = now();
  await db.runAsync(
    `INSERT INTO exercise
       (id, name, type, weight_unit, weight_step, primary_muscles, secondary_muscles,
        match_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name.trim(),
      input.type,
      input.weightUnit,
      input.weightStep,
      JSON.stringify(input.primaryMuscles ?? []),
      JSON.stringify(input.secondaryMuscles ?? []),
      normalizeName(input.name),
      t,
      t,
    ],
  );
  return id;
}

export async function getMachine(
  { db }: Store,
  exerciseId: string,
  gymId: string,
): Promise<Machine | null> {
  const row = await db.getFirstAsync<MachineRow>(
    "SELECT * FROM machine WHERE exercise_id = ? AND gym_id = ? AND deleted_at IS NULL LIMIT 1",
    [exerciseId, gymId],
  );
  return row ? toMachine(row) : null;
}

export async function createMachine(
  { db, uuid, now }: Store,
  input: {
    gymId: string;
    exerciseId: string;
    manufacturer?: string | null;
    articleCode?: string | null;
    ocrText?: string | null;
    photoUri?: string | null;
    seatSettings?: string | null;
    weightStep: number;
  },
): Promise<string> {
  const id = uuid();
  const t = now();
  await db.runAsync(
    `INSERT INTO machine
       (id, gym_id, exercise_id, manufacturer, article_code, ocr_text, photo_uri,
        seat_settings, weight_step, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.gymId,
      input.exerciseId,
      input.manufacturer ?? null,
      input.articleCode ?? null,
      input.ocrText ?? null,
      input.photoUri ?? null,
      input.seatSettings ?? null,
      input.weightStep,
      t,
      t,
    ],
  );
  return id;
}

export async function updateMachine(
  { db, now }: Store,
  machineId: string,
  patch: { seatSettings?: string | null; weightStep?: number },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.seatSettings !== undefined) {
    sets.push("seat_settings = ?");
    params.push(patch.seatSettings);
  }
  if (patch.weightStep !== undefined) {
    sets.push("weight_step = ?");
    params.push(patch.weightStep);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(now(), machineId);
  await db.runAsync(`UPDATE machine SET ${sets.join(", ")} WHERE id = ?`, params);
}

/** Viktsteget för en övning: maskinens om den finns, annars övningens. */
export function weightStepFor(exercise: Exercise, machine: Machine | null): number {
  return machine?.weightStep ?? exercise.weightStep;
}

/**
 * Sparar viktsteget där det hör hemma: på maskinen om övningen körs på en
 * maskin (viktmagasin skiljer sig mellan maskiner), annars på övningen.
 *
 * Anropas när användaren byter steg i loggvyn, så valet gäller nästa gång
 * också — man ska aldrig behöva ställa in samma sak två gånger.
 */
export async function setWeightStep(
  { db, now }: Store,
  target: { exerciseId: string; machineId: string | null },
  step: number,
): Promise<void> {
  const t = now();
  if (target.machineId) {
    await db.runAsync("UPDATE machine SET weight_step = ?, updated_at = ? WHERE id = ?", [
      step,
      t,
      target.machineId,
    ]);
  } else {
    await db.runAsync("UPDATE exercise SET weight_step = ?, updated_at = ? WHERE id = ?", [
      step,
      t,
      target.exerciseId,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Pass (sessioner)
// ---------------------------------------------------------------------------

/** Läser det pågående passet utan att skapa något. Används av startskärmen. */
export async function getCurrentSession({ db, now }: Store, gymId: string): Promise<Session | null> {
  const cutoff = new Date(Date.parse(now()) - SESSION_WINDOW_HOURS * 3600_000).toISOString();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM session
     WHERE gym_id = ? AND ended_at IS NULL AND deleted_at IS NULL AND started_at >= ?
     ORDER BY started_at DESC LIMIT 1`,
    [gymId, cutoff],
  );
  return row ? toSession(row) : null;
}

/**
 * Passet som nästa set ska hamna i — öppnar ett nytt om det behövs.
 *
 * Anropas bara från loggningsvägen, aldrig från listan, så att appen inte
 * skapar tomma pass bara för att man tittar in.
 */
export async function getOrOpenSession(store: Store, gymId: string): Promise<Session> {
  const existing = await getCurrentSession(store, gymId);
  if (existing) return existing;

  const { db, uuid, now } = store;
  const t = now();

  // Stäng allt som fortfarande står öppet — passet är över när ett nytt börjar.
  // Sluttiden sätts till sista loggade setet, inte till nu, så gamla pass inte
  // ser ut att ha pågått i dagar.
  await db.runAsync(
    `UPDATE session
     SET ended_at = COALESCE(
           (SELECT MAX(logged_at) FROM set_entry
            WHERE session_id = session.id AND deleted_at IS NULL),
           started_at),
         updated_at = ?
     WHERE ended_at IS NULL AND deleted_at IS NULL`,
    [t],
  );

  const id = uuid();
  await db.runAsync(
    "INSERT INTO session (id, gym_id, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, gymId, t, t, t],
  );
  return { id, gymId, startedAt: t, endedAt: null, createdAt: t, updatedAt: t, deletedAt: null };
}

// ---------------------------------------------------------------------------
// Set
// ---------------------------------------------------------------------------

/**
 * Seten från senaste passet övningen kördes — källan till förifyllningen och
 * till "Förra: 50 kg × 10, 10, 9".
 *
 * `excludeSessionId` utesluter det pågående passet, så man ser vad man gjorde
 * *förra* gången och inte vad man just loggade.
 */
export async function lastSets(
  { db }: Store,
  exerciseId: string,
  excludeSessionId: string | null,
): Promise<{ weightKg: number; reps: number; setIndex: number }[]> {
  const rows = await db.getAllAsync<{ weight_kg: number; reps: number; set_index: number }>(
    `SELECT weight_kg, reps, set_index FROM set_entry
     WHERE exercise_id = ? AND deleted_at IS NULL
       AND session_id = (
         SELECT session_id FROM set_entry
         WHERE exercise_id = ? AND deleted_at IS NULL AND session_id IS NOT ?
         ORDER BY logged_at DESC LIMIT 1
       )
     ORDER BY set_index ASC`,
    [exerciseId, exerciseId, excludeSessionId],
  );
  return rows.map((r) => ({ weightKg: r.weight_kg, reps: r.reps, setIndex: r.set_index }));
}

export async function setsInSession(
  { db }: Store,
  sessionId: string,
  exerciseId: string,
): Promise<SetEntry[]> {
  const rows = await db.getAllAsync<SetRow>(
    `SELECT * FROM set_entry
     WHERE session_id = ? AND exercise_id = ? AND deleted_at IS NULL
     ORDER BY set_index ASC`,
    [sessionId, exerciseId],
  );
  return rows.map(toSet);
}

export async function logSet(
  { db, uuid, now }: Store,
  input: {
    sessionId: string;
    exerciseId: string;
    machineId: string | null;
    weightKg: number;
    reps: number;
    setIndex: number;
  },
): Promise<SetEntry> {
  const id = uuid();
  const t = now();
  await db.runAsync(
    `INSERT INTO set_entry
       (id, session_id, machine_id, exercise_id, weight_kg, reps, set_index,
        logged_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.sessionId, input.machineId, input.exerciseId, input.weightKg, input.reps, input.setIndex, t, t, t],
  );
  if (input.machineId) {
    await db.runAsync("UPDATE machine SET last_used_at = ?, updated_at = ? WHERE id = ?", [
      t,
      t,
      input.machineId,
    ]);
  }
  return {
    id,
    sessionId: input.sessionId,
    machineId: input.machineId,
    exerciseId: input.exerciseId,
    weightKg: input.weightKg,
    reps: input.reps,
    setIndex: input.setIndex,
    loggedAt: t,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
}

/** Soft delete — raden ligger kvar så en framtida sync kan propagera raderingen. */
export async function deleteSet({ db, now }: Store, setId: string): Promise<void> {
  const t = now();
  await db.runAsync("UPDATE set_entry SET deleted_at = ?, updated_at = ? WHERE id = ?", [t, t, setId]);
}

// ---------------------------------------------------------------------------
// Startskärmens lista
// ---------------------------------------------------------------------------

type ListRow = ExerciseRow & {
  m_id: string | null;
  m_gym_id: string | null;
  m_exercise_id: string | null;
  m_manufacturer: string | null;
  m_article_code: string | null;
  m_ocr_text: string | null;
  m_photo_uri: string | null;
  m_seat_settings: string | null;
  m_weight_step: number | null;
  m_last_used_at: string | null;
  m_created_at: string | null;
  m_updated_at: string | null;
  m_deleted_at: string | null;
};

/**
 * Övningarna som är tillgängliga på ett gym, med det listan behöver visa.
 *
 * Fria vikter finns överallt; maskiner bara där de står. Tre frågor totalt —
 * ingen N+1 per rad.
 *
 * Sortering enligt specen: ej körda i det pågående passet först, därefter
 * senast använd. Det gör listan till en avbockningslista utan att någon
 * behöver bocka av något manuellt.
 */
export async function listExercisesForGym(
  store: Store,
  gymId: string,
  currentSessionId: string | null,
): Promise<ExerciseListItem[]> {
  const { db } = store;

  const rows = await db.getAllAsync<ListRow>(
    `SELECT e.*,
            m.id AS m_id, m.gym_id AS m_gym_id, m.exercise_id AS m_exercise_id,
            m.manufacturer AS m_manufacturer, m.article_code AS m_article_code,
            m.ocr_text AS m_ocr_text, m.photo_uri AS m_photo_uri,
            m.seat_settings AS m_seat_settings, m.weight_step AS m_weight_step,
            m.last_used_at AS m_last_used_at, m.created_at AS m_created_at,
            m.updated_at AS m_updated_at, m.deleted_at AS m_deleted_at
     FROM exercise e
     LEFT JOIN machine m
       ON m.exercise_id = e.id AND m.gym_id = ? AND m.deleted_at IS NULL
     WHERE e.deleted_at IS NULL AND e.merged_into_id IS NULL
       AND (e.type = 'freeweight' OR m.id IS NOT NULL)`,
    [gymId],
  );

  // Senaste passet per övning. Den nakna kolumnen session_id vid sidan av
  // MAX() är dokumenterat SQLite-beteende: den kommer från raden som gav maxet.
  const latest = await db.getAllAsync<{ exercise_id: string; session_id: string; last_at: string }>(
    `SELECT exercise_id, session_id, MAX(logged_at) AS last_at
     FROM set_entry WHERE deleted_at IS NULL GROUP BY exercise_id`,
    [],
  );

  const latestByExercise = new Map(latest.map((r) => [r.exercise_id, r]));
  const sessionIds = [...new Set(latest.map((r) => r.session_id))];

  const setsByKey = new Map<string, { weightKg: number; reps: number }[]>();
  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => "?").join(",");
    const setRows = await db.getAllAsync<{
      exercise_id: string;
      session_id: string;
      weight_kg: number;
      reps: number;
    }>(
      `SELECT exercise_id, session_id, weight_kg, reps FROM set_entry
       WHERE deleted_at IS NULL AND session_id IN (${placeholders})
       ORDER BY set_index ASC`,
      sessionIds,
    );
    for (const r of setRows) {
      const key = `${r.exercise_id}|${r.session_id}`;
      const list = setsByKey.get(key);
      const entry = { weightKg: r.weight_kg, reps: r.reps };
      if (list) list.push(entry);
      else setsByKey.set(key, [entry]);
    }
  }

  const items: ExerciseListItem[] = rows.map((r) => {
    const exercise = toExercise(r);
    const machine =
      r.m_id && r.m_gym_id && r.m_exercise_id && r.m_created_at && r.m_updated_at
        ? toMachine({
            id: r.m_id,
            gym_id: r.m_gym_id,
            exercise_id: r.m_exercise_id,
            manufacturer: r.m_manufacturer,
            article_code: r.m_article_code,
            ocr_text: r.m_ocr_text,
            photo_uri: r.m_photo_uri,
            seat_settings: r.m_seat_settings,
            weight_step: r.m_weight_step ?? 5,
            last_used_at: r.m_last_used_at,
            created_at: r.m_created_at,
            updated_at: r.m_updated_at,
            deleted_at: r.m_deleted_at,
          })
        : null;

    const last = latestByExercise.get(exercise.id);
    return {
      exercise,
      machine,
      lastSets: last ? (setsByKey.get(`${exercise.id}|${last.session_id}`) ?? []) : [],
      lastPerformedAt: last?.last_at ?? null,
      doneToday: !!last && !!currentSessionId && last.session_id === currentSessionId,
    };
  });

  items.sort((a, b) => {
    if (a.doneToday !== b.doneToday) return a.doneToday ? 1 : -1;
    if (a.lastPerformedAt !== b.lastPerformedAt) {
      if (!a.lastPerformedAt) return 1;
      if (!b.lastPerformedAt) return -1;
      return a.lastPerformedAt < b.lastPerformedAt ? 1 : -1;
    }
    return a.exercise.name.localeCompare(b.exercise.name, "sv");
  });

  return items;
}
