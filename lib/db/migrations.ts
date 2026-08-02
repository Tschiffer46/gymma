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

  // 2 — hur passet kändes.
  //
  // Passet får en medveten avslutning i stället för att bara tystna. `feeling`
  // är ett av tre fasta värden (ett tryck, inget tangentbord) och `notes` är
  // frivillig fritext. Båda blir underlag för Följ upp-vyn.
  `
  ALTER TABLE session ADD COLUMN feeling TEXT;
  ALTER TABLE session ADD COLUMN notes TEXT;
  `,

  // 3 — rutiner ("Planera").
  //
  // En rutin är en SPARAD ORDNING, inte ett schema. Designprincip 4 gäller
  // fortfarande: du kan logga vad som helst utanför planen, och maskiner läggs
  // till första gången de används. Därför finns ingen koppling från rutin till
  // gym — samma "Överkropp" ska gå att köra var som helst.
  //
  // session.routine_id sparar vilken plan passet följde, så Följ upp senare kan
  // svara på "hur ofta kör jag faktiskt Ben?".
  `
  CREATE TABLE routine (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE routine_item (
    id          TEXT PRIMARY KEY,
    routine_id  TEXT NOT NULL REFERENCES routine(id),
    exercise_id TEXT NOT NULL REFERENCES exercise(id),
    position    INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX idx_routine_item_routine ON routine_item(routine_id, position);

  ALTER TABLE session ADD COLUMN routine_id TEXT REFERENCES routine(id);
  `,

  // 4 — engelska namn och överhoppade övningar.
  //
  // `name_en` gör två saker på en gång: visar skyltnamnet bredvid det svenska
  // (Technogym-skyltarna är på engelska) och blir matchningsnyckel för
  // kamera/OCR i en senare sprint. Utan den skulle "CHEST PRESS" aldrig hitta
  // "Bänkpress" och månadstrenden splittras i två halva serier.
  //
  // `session_skip` är överhoppningar under ett pass. Egen tabell i stället för
  // komponenttillstånd, så en överhoppning överlever att iOS dödar appen mitt
  // i passet. Den är medvetet PASSSPECIFIK — att maskinen var upptagen idag
  // ska inte ändra planen permanent.
  `
  ALTER TABLE exercise ADD COLUMN name_en TEXT;

  CREATE TABLE session_skip (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES session(id),
    exercise_id TEXT NOT NULL REFERENCES exercise(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX idx_session_skip ON session_skip(session_id);
  `,
];
