/**
 * Migrationer, körda i ordning av runMigrations() i index.ts.
 *
 * Versionen spåras med SQLite:s inbyggda `PRAGMA user_version` — index i den
 * här arrayen + 1. Lägg ALDRIG till, ta bort eller ändra ordning på befintliga
 * poster; lägg bara till nya sist. En redan körd migration får inte ändras,
 * eftersom telefoner som redan kört den aldrig kör den igen.
 *
 * Varje sträng körs som en enda `execAsync` inuti en transaktion.
 */
export const MIGRATIONS: string[] = [
  // 1 — grundschemat.
  //
  // Alla tabeller har id (UUID), created_at, updated_at och deleted_at (soft
  // delete). Det kostar ingenting nu och gör en framtida backend till en
  // påbyggnad i stället för en migrering.
  `
  CREATE TABLE gym (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE exercise (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    type               TEXT NOT NULL CHECK (type IN ('machine','freeweight')),
    weight_unit        TEXT NOT NULL DEFAULT 'total' CHECK (weight_unit IN ('total','per_hand')),
    weight_step        REAL NOT NULL DEFAULT 5,
    primary_muscles    TEXT NOT NULL DEFAULT '[]',
    secondary_muscles  TEXT NOT NULL DEFAULT '[]',
    match_key          TEXT NOT NULL,
    merged_into_id     TEXT REFERENCES exercise(id),
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    deleted_at         TEXT
  );
  CREATE INDEX idx_exercise_match_key ON exercise(match_key);

  CREATE TABLE machine (
    id            TEXT PRIMARY KEY,
    gym_id        TEXT NOT NULL REFERENCES gym(id),
    exercise_id   TEXT NOT NULL REFERENCES exercise(id),
    manufacturer  TEXT,
    article_code  TEXT,
    ocr_text      TEXT,
    photo_uri     TEXT,
    seat_settings TEXT,
    weight_step   REAL NOT NULL DEFAULT 5,
    last_used_at  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
  );
  CREATE INDEX idx_machine_gym ON machine(gym_id);
  CREATE INDEX idx_machine_article ON machine(article_code);

  CREATE TABLE session (
    id          TEXT PRIMARY KEY,
    gym_id      TEXT NOT NULL REFERENCES gym(id),
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE set_entry (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES session(id),
    machine_id  TEXT REFERENCES machine(id),
    exercise_id TEXT NOT NULL REFERENCES exercise(id),
    weight_kg   REAL NOT NULL,
    reps        INTEGER NOT NULL,
    set_index   INTEGER NOT NULL,
    logged_at   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX idx_set_entry_session ON set_entry(session_id);
  CREATE INDEX idx_set_entry_exercise ON set_entry(exercise_id, logged_at);
  `,
];
