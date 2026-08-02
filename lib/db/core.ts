// Datalagrets kärna. INGA importer från expo eller react här — filen ska kunna
// köras rakt av i Node mot node:sqlite (scripts/verify-db.mjs), så att schemat,
// migrationerna och all SQL kan verifieras utan simulator.
//
// React-/expo-sidan ligger i index.ts och bygger en Store av den här filen.

import { MIGRATIONS } from "./migrations";
import { SEED_EXERCISES, SEED_GYMS, FREEWEIGHT_STEP } from "./seed";
import { normalizeName } from "./match";

export const DB_NAME = "gymma.db";

export type SqlValue = string | number | null;

/**
 * Minsta gemensamma nämnare mellan expo-sqlite och node:sqlite.
 * Params skickas alltid som array (även tom) — det matchar båda API:erna.
 */
export interface SqlDb {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
}

/**
 * Databasen plus de två sidoeffekter datalagret behöver.
 *
 * uuid och now injiceras i stället för att importeras, eftersom appen använder
 * expo-crypto och verifieringsskriptet node:crypto. Det är också det som gör
 * queries.ts helt testbart utan React Native.
 */
export type Store = {
  db: SqlDb;
  uuid: () => string;
  now: () => string;
};

/**
 * Kör alla migrationer som den här databasen ännu inte sett.
 *
 * Versionen spåras med SQLite:s inbyggda `PRAGMA user_version` (index i
 * MIGRATIONS + 1). Varje migration körs i en transaktion tillsammans med sin
 * versionsbump, så en halvkörd migration aldrig kan lämna databasen i ett
 * odefinierat läge.
 */
export async function runMigrations(db: SqlDb): Promise<number> {
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;

  for (let v = current; v < MIGRATIONS.length; v++) {
    // user_version tar inte bind-parametrar, därav interpolationen. Värdet är
    // ett arrayindex vi själva räknat fram — aldrig användardata.
    await db.execAsync(`BEGIN;${MIGRATIONS[v]};PRAGMA user_version = ${v + 1};COMMIT;`);
  }

  return MIGRATIONS.length;
}

/**
 * Lägger in startbiblioteket första gången appen startar.
 *
 * Idempotent: gör ingenting om det redan finns ett gym, så en telefon som redan
 * har data aldrig får seeden påklistrad.
 */
export async function seedIfEmpty(store: Store): Promise<boolean> {
  const { db, uuid, now } = store;

  const existing = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM gym WHERE deleted_at IS NULL",
    [],
  );
  if ((existing?.n ?? 0) > 0) return false;

  const ts = now();

  await db.execAsync("BEGIN;");
  try {
    for (let i = 0; i < SEED_GYMS.length; i++) {
      await db.runAsync(
        "INSERT INTO gym (id, name, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [uuid(), SEED_GYMS[i], i === 0 ? 1 : 0, ts, ts],
      );
    }

    for (const ex of SEED_EXERCISES) {
      await db.runAsync(
        `INSERT INTO exercise
           (id, name, type, weight_unit, weight_step, primary_muscles, secondary_muscles,
            match_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          ex.name,
          ex.type,
          ex.weightUnit,
          FREEWEIGHT_STEP,
          JSON.stringify(ex.primary),
          JSON.stringify(ex.secondary),
          normalizeName(ex.name),
          ts,
          ts,
        ],
      );
    }
    await db.execAsync("COMMIT;");
  } catch (e) {
    await db.execAsync("ROLLBACK;");
    throw e;
  }

  return true;
}

/** Migrationer + seed. Körs en gång vid appstart. */
export async function initStore(store: Store): Promise<void> {
  await runMigrations(store.db);
  await seedIfEmpty(store);
}
