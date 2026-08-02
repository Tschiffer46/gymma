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

  console.log("Rutiner");
  const routineId = await q.createRoutine(store, "  Överkropp  ");
  const routines = await q.listRoutines(store);
  eq(routines.length, 1, "rutinen skapas");
  eq(routines[0].name, "Överkropp", "namnet trimmas");
  eq(routines[0].itemCount, 0, "tom rutin har noll övningar");

  const seededIds = (await q.listExercisesForGym(store, gyms[0].id, null))
    .filter((i) => i.exercise.type === "freeweight")
    .slice(0, 3)
    .map((i) => i.exercise.id);

  for (const id of seededIds) await q.addRoutineItem(store, routineId, id);
  await q.addRoutineItem(store, routineId, seededIds[0]);
  let detail = await q.getRoutine(store, routineId);
  eq(detail.items.length, 3, "dubblett läggs inte till två gånger");
  eq(detail.items.map((i) => i.position).join(","), "0,1,2", "positioner är täta och börjar på 0");
  eq(detail.items[0].exercise.id, seededIds[0], "första övningen ligger först");

  console.log("Omordning");
  await q.moveRoutineItem(store, detail.items[0].id, "down");
  detail = await q.getRoutine(store, routineId);
  eq(detail.items[0].exercise.id, seededIds[1], "flytt nedåt byter plats med grannen");
  eq(detail.items[1].exercise.id, seededIds[0], "den flyttade hamnar på plats två");
  eq(detail.items.map((i) => i.position).join(","), "0,1,2", "positionerna förblir täta");

  await q.moveRoutineItem(store, detail.items[0].id, "up");
  detail = await q.getRoutine(store, routineId);
  eq(detail.items[0].exercise.id, seededIds[1], "flytt uppåt från toppen gör ingenting");

  await q.moveRoutineItem(store, detail.items[2].id, "down");
  detail = await q.getRoutine(store, routineId);
  eq(detail.items[2].exercise.id, seededIds[2], "flytt nedåt från botten gör ingenting");

  console.log("Ta bort ur rutin");
  await q.removeRoutineItem(store, detail.items[0].id);
  detail = await q.getRoutine(store, routineId);
  eq(detail.items.length, 2, "raden försvinner");
  eq(detail.items.map((i) => i.position).join(","), "0,1", "positionerna packas ihop");

  console.log("Maskin i plan som saknas på gymmet");
  // exId är bröstpressen som bara står på gyms[0]. Läggs den i planen ska den
  // synas även när man kör planen på gyms[1] — annars ser planen ut att ha
  // tappat övningar.
  await q.addRoutineItem(store, routineId, exId);
  const planIds = (await q.getRoutine(store, routineId)).items.map((i) => i.exercise.id);
  const atOtherGym = await q.listExercisesForGym(store, gyms[1].id, null, planIds);
  ok(
    atOtherGym.some((i) => i.exercise.id === exId),
    "planens maskin syns även på ett gym där den inte står",
  );
  eq(
    atOtherGym.find((i) => i.exercise.id === exId).machine,
    null,
    "men utan maskinkoppling, så viktsteg och progression inte blandas ihop",
  );
  ok(
    !(await q.listExercisesForGym(store, gyms[1].id, null)).some((i) => i.exercise.id === exId),
    "utan plan syns den fortfarande inte på fel gym",
  );

  console.log("Pass kopplat till plan");
  const planned = await q.startSession(store, gyms[0].id, routineId);
  eq(planned.routineId, routineId, "passet minns vilken plan det följde");
  eq(
    (await q.getCurrentSession(store, gyms[0].id)).routineId,
    routineId,
    "planen läses tillbaka från databasen",
  );
  await q.endSession(store, planned.id, { feeling: null, notes: null });

  console.log("Radera rutin");
  await q.deleteRoutine(store, routineId);
  eq((await q.listRoutines(store)).length, 0, "rutinen försvinner ur listan");
  eq(await q.getRoutine(store, routineId), null, "raderad rutin går inte att hämta");
  const orphan = db
    .prepare("SELECT COUNT(*) AS n FROM routine_item WHERE routine_id = ? AND deleted_at IS NULL")
    .get(routineId);
  eq(orphan.n, 0, "rutinens rader raderas med");

  console.log("Engelska namn");
  const bench = await q.findExerciseByName(store, "Bänkpress");
  eq(bench.nameEn, "Bench Press", "seedade övningar har engelskt namn");
  const viaEnglish = await q.findExerciseByName(store, "BENCH PRESS");
  ok(viaEnglish && viaEnglish.id === bench.id, "engelskt skyltnamn hittar den svenska övningen");
  ok(
    (await q.findExerciseByName(store, "  bench-press ")).id === bench.id,
    "engelsk matchning tål versaler, bindestreck och blanksteg",
  );
  eq(await q.findExerciseByName(store, "Lat Pulldown"), null, "okänt engelskt namn ger null");

  console.log("Komplettering av biblioteket");
  // Simulera en telefon som installerade före migration 4: nolla ett engelskt
  // namn och radera en övning som användaren själv tagit bort.
  const cleared = db
    .prepare("UPDATE exercise SET name_en = NULL WHERE match_key = ?")
    .run(normalizeName("Knäböj"));
  eq(cleared.changes, 1, "testuppsättning: en rad fick sitt engelska namn nollat");
  const removedByUser = await q.findExerciseByName(store, "Shrugs");
  await q.deleteExercise(store, removedByUser.id);

  const topped = await core.topUpLibrary(store);
  eq(topped.named, 1, "saknat engelskt namn fylls i");
  eq(topped.added, 0, "inget läggs till som redan finns");
  eq(
    (await q.findExerciseByName(store, "Knäböj")).nameEn,
    "Squat",
    "kompletteringen satte rätt engelskt namn",
  );
  eq(
    await q.findExerciseByName(store, "Shrugs"),
    null,
    "en övning användaren raderat återuppväcks ALDRIG av kompletteringen",
  );
  eq((await core.topUpLibrary(store)).named, 0, "kompletteringen är idempotent");

  console.log("Sök");
  eq((await q.listAllExercises(store, "press")).length > 0, true, "sök på svenskt namn ger träff");
  ok(
    (await q.listAllExercises(store, "squat")).some((e) => e.name === "Knäböj"),
    "sök på engelskt namn hittar den svenska övningen",
  );
  ok(
    (await q.listAllExercises(store, "knabo")).some((e) => e.name === "Knäböj"),
    "sök tål saknade diakriter",
  );
  eq((await q.listAllExercises(store, "zzzz")).length, 0, "sök utan träff ger tom lista");

  console.log("Redigera övning");
  const curl = await q.findExerciseByName(store, "Bicepscurl");
  await q.updateExercise(store, curl.id, { name: "Hantelcurl", nameEn: "Dumbbell Curl" });
  eq(await q.findExerciseByName(store, "Bicepscurl"), null, "gamla namnet slutar matcha");
  eq(
    (await q.findExerciseByName(store, "hantelcurl")).id,
    curl.id,
    "match_key följer med namnbytet",
  );
  eq(
    (await q.findExerciseByName(store, "Dumbbell Curl")).id,
    curl.id,
    "nya engelska namnet matchar",
  );

  console.log("Radering städar planer utan att lämna luckor");
  const r2 = await q.createRoutine(store, "Ben");
  const legIds = (await q.listExercisesForGym(store, gyms[0].id, null))
    .filter((i) => i.exercise.type === "freeweight")
    .slice(0, 4)
    .map((i) => i.exercise.id);
  for (const id of legIds) await q.addRoutineItem(store, r2, id);

  await q.deleteExercise(store, legIds[1]);
  const after = await q.getRoutine(store, r2);
  eq(after.items.length, 3, "raderad övning försvinner ur planen");
  eq(
    after.items.map((i) => i.position).join(","),
    "0,1,2",
    "positionerna packas ihop — annars slutar omordningen fungera vid luckan",
  );
  await q.moveRoutineItem(store, after.items[2].id, "up");
  eq(
    (await q.getRoutine(store, r2)).items[1].exercise.id,
    legIds[3],
    "omordning fungerar efter raderingen",
  );

  console.log("Hoppa över i pass");
  const skipSess = await q.startSession(store, gyms[0].id, r2);
  eq((await q.skippedInSession(store, skipSess.id)).length, 0, "inget överhoppat från start");
  await q.skipExercise(store, skipSess.id, legIds[0]);
  await q.skipExercise(store, skipSess.id, legIds[0]);
  eq((await q.skippedInSession(store, skipSess.id)).length, 1, "dubbelt överhopp räknas en gång");
  await q.unskipExercise(store, skipSess.id, legIds[0]);
  eq((await q.skippedInSession(store, skipSess.id)).length, 0, "överhoppet går att ångra");

  await q.skipExercise(store, skipSess.id, legIds[0]);
  const other = await q.startSession(store, gyms[0].id, r2);
  eq(
    (await q.skippedInSession(store, other.id)).length,
    0,
    "överhopp är passspecifikt och följer inte med till nästa pass",
  );
  await q.endSession(store, other.id, { feeling: null, notes: null });

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
