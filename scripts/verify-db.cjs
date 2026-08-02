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
  eq(version.user_version, 1, "user_version satt till 1 efter migrering");

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
