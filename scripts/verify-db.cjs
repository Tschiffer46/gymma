/**
 * Verifierar hela datalagret mot en riktig SQLite-databas, i Node, utan
 * simulator.
 *
 * Går att göra eftersom core.ts och queries.ts är fria från expo-/react-
 * importer och tar sin databas + uuid/now som parametrar (se Store i core.ts).
 * Klockan är injicerad, så vi kan hoppa fram en dag och testa att "förra
 * passet"-logiken faktiskt hittar rätt pass.
 *
 * Körs med `npm run test:db` (kompilerar först TS → CJS i .verify/).
 */
const { DatabaseSync } = require("node:sqlite");
const { randomUUID } = require("node:crypto");
const path = require("path");

const OUT = path.join(__dirname, "..", ".verify", "lib", "db");
const core = require(path.join(OUT, "core.js"));
const q = require(path.join(OUT, "queries.js"));
const { normalizeName } = require(path.join(OUT, "match.js"));
const { MIGRATIONS } = require(path.join(OUT, "migrations.js"));

let failures = 0;
let checks = 0;

function ok(cond, label) {
  checks++;
  if (cond) return;
  failures++;
  console.error(`  ✗ ${label}`);
}

function eq(actual, expected, label) {
  checks++;
  if (actual === expected) return;
  failures++;
  console.error(`  ✗ ${label}\n      förväntat: ${expected}\n      faktiskt:  ${actual}`);
}

/** node:sqlite bakom samma SqlDb-interface som expo-sqlite. */
function adapter(db) {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      return db.prepare(sql).run(...params);
    },
    async getFirstAsync(sql, params) {
      return db.prepare(sql).get(...params) ?? null;
    },
    async getAllAsync(sql, params) {
      return db.prepare(sql).all(...params);
    },
  };
}

async function main() {
  const db = new DatabaseSync(":memory:");

  // Injicerad klocka: låter oss simulera "nästa dag" utan att vänta.
  let clock = Date.parse("2026-08-02T08:00:00.000Z");
  const store = {
    db: adapter(db),
    uuid: randomUUID,
    now: () => new Date(clock).toISOString(),
  };
  const advanceHours = (h) => {
    clock += h * 3600_000;
  };

  console.log("Migrationer och seed");
  await core.initStore(store);

  const version = db.prepare("PRAGMA user_version").get();
  eq(
    version.user_version,
    MIGRATIONS.length,
    `user_version följer antalet migrationer (${MIGRATIONS.length})`,
  );

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_"));
  for (const t of ["exercise", "gym", "machine", "session", "set_entry"]) {
    ok(tables.includes(t), `tabellen ${t} finns`);
  }

  const gyms = await q.listGyms(store);
  eq(gyms.length, 2, "två gym seedade");
  eq(gyms[0].name, "Hemmagym", "första gymmet är Hemmagym");
  ok(gyms[0].isDefault, "första gymmet är aktivt");

  const seeded = await q.listExercisesForGym(store, gyms[0].id, null);
  eq(seeded.length, 27, "27 fria vikter seedade");
  ok(
    seeded.every((i) => i.exercise.type === "freeweight" && i.machine === null),
    "inga maskiner seedade (programmet ska växa fram)",
  );

  console.log("Idempotens");
  const again = await core.seedIfEmpty(store);
  eq(again, false, "seedIfEmpty gör ingenting andra gången");
  eq((await q.listExercisesForGym(store, gyms[0].id, null)).length, 27, "fortfarande 27 övningar");

  console.log("Aktivt gym");
  await q.setActiveGym(store, gyms[1].id);
  eq((await q.getActiveGym(store)).id, gyms[1].id, "byte av aktivt gym slår igenom");
  await q.setActiveGym(store, gyms[0].id);
  eq((await q.getActiveGym(store)).id, gyms[0].id, "byte tillbaka fungerar");

  console.log("Övningsidentitet");
  eq(normalizeName("Bröstpress"), "brostpress", "å/ä/ö viks till a/a/o");
  eq(normalizeName("BRÖST PRESS"), "brostpress", "versaler och blanksteg normaliseras bort");
  eq(normalizeName("Chest Press"), "chestpress", "engelsk skylttext normaliseras");

  const exId = await q.createExercise(store, {
    name: "Bröstpress",
    type: "machine",
    weightUnit: "total",
    weightStep: 5,
    primaryMuscles: ["pectoralis"],
    secondaryMuscles: ["triceps", "deltoid_anterior"],
  });
  const found = await q.findExerciseByName(store, "  bröst press ");
  ok(found && found.id === exId, "findExerciseByName matchar tvärs stavning och blanksteg");
  eq(await q.findExerciseByName(store, "Benpress"), null, "okänd övning ger null");

  console.log("Maskiner");
  const machineId = await q.createMachine(store, {
    gymId: gyms[0].id,
    exerciseId: exId,
    manufacturer: "Technogym",
    articleCode: "0E001960AB",
    seatSettings: "Sits 4, rygg 3",
    weightStep: 5,
  });
  const machine = await q.getMachine(store, exId, gyms[0].id);
  ok(machine && machine.id === machineId, "maskinen hittas på sitt gym");
  eq(await q.getMachine(store, exId, gyms[1].id), null, "maskinen finns INTE på det andra gymmet");

  const exercise = await q.getExercise(store, exId);
  eq(q.weightStepFor(exercise, machine), 5, "maskinens viktsteg vinner");
  eq(q.weightStepFor(exercise, null), 5, "övningens viktsteg används utan maskin");

  const atGym1 = await q.listExercisesForGym(store, gyms[0].id, null);
  const atGym2 = await q.listExercisesForGym(store, gyms[1].id, null);
  eq(atGym1.length, 28, "maskinövningen syns på gymmet där maskinen står");
  eq(atGym2.length, 27, "maskinövningen syns INTE på det andra gymmet");
  ok(
    atGym1.find((i) => i.exercise.id === exId)?.machine?.manufacturer === "Technogym",
    "maskindata följer med i listan (ingen N+1)",
  );

  console.log("Pass och set");
  eq(await q.getCurrentSession(store, gyms[0].id), null, "inget pass öppet från start");

  const s1 = await q.getOrOpenSession(store, gyms[0].id);
  ok(s1.id, "pass öppnas vid första setet");
  const s1again = await q.getOrOpenSession(store, gyms[0].id);
  eq(s1again.id, s1.id, "samma pass återanvänds inom tidsfönstret");

  for (let i = 0; i < 3; i++) {
    advanceHours(0.05);
    await q.logSet(store, {
      sessionId: s1.id,
      exerciseId: exId,
      machineId,
      weightKg: 50,
      reps: 10 - (i === 2 ? 1 : 0),
      setIndex: i + 1,
    });
  }
  const logged = await q.setsInSession(store, s1.id, exId);
  eq(logged.length, 3, "tre set loggade");
  eq(logged[2].reps, 9, "sista setet har rätt reps");
  eq(logged[0].setIndex, 1, "set_index börjar på 1");

  const touched = await q.getMachine(store, exId, gyms[0].id);
  ok(touched.lastUsedAt, "maskinens last_used_at uppdateras vid loggning");

  console.log("Avbockning");
  const during = await q.listExercisesForGym(store, gyms[0].id, s1.id);
  const row = during.find((i) => i.exercise.id === exId);
  ok(row.doneToday, "övningen är avbockad i det pågående passet");
  eq(row.lastSets.length, 3, "listan visar passets tre set");
  eq(row.lastSets[0].weightKg, 50, "listan visar rätt vikt");
  eq(during[during.length - 1].exercise.id, exId, "avbockade hamnar sist i listan");
  ok(!during[0].doneToday, "ej körda ligger först");

  console.log("Förifyllning från förra passet");
  eq(
    (await q.lastSets(store, exId, s1.id)).length,
    0,
    "pågående pass räknas inte som 'förra gången'",
  );
  eq((await q.lastSets(store, exId, null)).length, 3, "utan uteslutning hittas passets set");

  // Nästa dag: nytt pass, och nu ska förra passets siffror förifylla.
  advanceHours(26);
  eq(await q.getCurrentSession(store, gyms[0].id), null, "gamla passet räknas inte längre som öppet");
  const s2 = await q.getOrOpenSession(store, gyms[0].id);
  ok(s2.id !== s1.id, "ett nytt pass öppnas dagen efter");

  const closed = db.prepare("SELECT ended_at FROM session WHERE id = ?").get(s1.id);
  ok(closed.ended_at, "det gamla passet stängdes automatiskt");

  const prev = await q.lastSets(store, exId, s2.id);
  eq(prev.length, 3, "förra passets tre set hittas");
  eq(prev[0].weightKg, 50, "förifyllning: rätt vikt");
  eq(prev[0].reps, 10, "förifyllning: rätt reps för set 1");
  eq(prev[2].reps, 9, "förifyllning: rätt reps för set 3");

  console.log("Ångra set");
  await q.deleteSet(store, logged[2].id);
  eq((await q.setsInSession(store, s1.id, exId)).length, 2, "raderat set försvinner ur passet");
  const softDeleted = db.prepare("SELECT deleted_at FROM set_entry WHERE id = ?").get(logged[2].id);
  ok(softDeleted.deleted_at, "raderingen är mjuk — raden ligger kvar för framtida sync");
  eq((await q.lastSets(store, exId, s2.id)).length, 2, "förifyllningen speglar raderingen");

  console.log("Uttryckligt pass: start och avslut");
  // s2 öppnades tidigare men fick aldrig något set. Ge det ett, annars städas
  // det (helt korrekt) bort som tomt och kan inte användas för att testa att
  // pass MED set stängs i stället för raderas.
  await q.logSet(store, {
    sessionId: s2.id,
    exerciseId: exId,
    machineId,
    weightKg: 52.5,
    reps: 10,
    setIndex: 1,
  });

  advanceHours(24);
  const s3 = await q.startSession(store, gyms[0].id);
  ok(s3.id !== s2.id, "startSession öppnar ett nytt pass");
  eq((await q.getCurrentSession(store, gyms[0].id)).id, s3.id, "det nya passet är det pågående");

  const s2closed = db.prepare("SELECT ended_at, deleted_at FROM session WHERE id = ?").get(s2.id);
  ok(s2closed.ended_at, "föregående pass stängdes av startSession");
  ok(!s2closed.deleted_at, "pass MED set raderas inte");

  advanceHours(0.5);
  await q.logSet(store, {
    sessionId: s3.id,
    exerciseId: exId,
    machineId,
    weightKg: 55,
    reps: 8,
    setIndex: 1,
  });
  eq(await q.sessionSetCount(store, s3.id), 1, "sessionSetCount räknar rätt");

  await q.endSession(store, s3.id, { feeling: "tungt", notes: "Sista setet tog i" });
  const ended = db
    .prepare("SELECT ended_at, feeling, notes, deleted_at FROM session WHERE id = ?")
    .get(s3.id);
  ok(ended.ended_at, "endSession sätter sluttid");
  eq(ended.feeling, "tungt", "känslan sparas");
  eq(ended.notes, "Sista setet tog i", "kommentaren sparas");
  ok(!ended.deleted_at, "avslutat pass med set behålls");
  eq(await q.getCurrentSession(store, gyms[0].id), null, "inget pass pågår efter avslut");

  console.log("Tomma pass städas bort");
  const empty = await q.startSession(store, gyms[0].id);
  await q.endSession(store, empty.id, { feeling: null, notes: null });
  const emptyRow = db.prepare("SELECT deleted_at FROM session WHERE id = ?").get(empty.id);
  ok(emptyRow.deleted_at, "pass utan set raderas vid avslut i stället för att sparas");

  const abandoned = await q.startSession(store, gyms[0].id);
  const replacing = await q.startSession(store, gyms[0].id);
  const abandonedRow = db.prepare("SELECT deleted_at FROM session WHERE id = ?").get(abandoned.id);
  ok(abandonedRow.deleted_at, "övergivet tomt pass städas bort när nästa startas");
  await q.endSession(store, replacing.id, { feeling: null, notes: null });

  console.log("Senaste gångerna");
  const recent = await q.recentPerformances(store, exId, null, 3);
  eq(recent.length, 3, "tre tidigare pass hittas");
  ok(
    recent[0].performedAt > recent[1].performedAt && recent[1].performedAt > recent[2].performedAt,
    "nyast först",
  );
  eq(recent[0].sets.length, 1, "senaste passet hade ett set");
  eq(recent[0].sets[0].weightKg, 55, "senaste passets vikt stämmer");
  // Det äldsta passet loggade tre set men ett ångrades längre upp i testet.
  // Att bara två syns här bevisar att den mjuka raderingen slår igenom hela
  // vägen ut i historiken.
  eq(recent[2].sets.length, 2, "ångrat set syns inte i historiken");
  eq(
    (await q.recentPerformances(store, exId, recent[0].sessionId, 3)).length,
    2,
    "det uteslutna passet räknas inte med",
  );
  eq((await q.recentPerformances(store, exId, null, 1)).length, 1, "limit respekteras");

  console.log("Gym sorterade efter senast använda");
  const byUse = await q.listGymsByRecentUse(store);
  eq(byUse.length, 2, "alla gym listas");
  eq(byUse[0].id, gyms[0].id, "det senast tränade gymmet ligger överst");
  eq(byUse[1].lastUsedAt, null, "ett aldrig använt gym saknar tidsstämpel och hamnar sist");

  console.log("");
  if (failures > 0) {
    console.error(`${failures} av ${checks} kontroller misslyckades`);
    process.exit(1);
  }
  console.log(`Alla ${checks} kontroller gick igenom.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
