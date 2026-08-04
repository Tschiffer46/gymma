/**
 * Verifierar hela datalagret mot en riktig SQLite-databas, i Node, utan
 * simulator.
 *
 * Går att göra eftersom core.ts och queries.ts är fria från expo-/react-
 * importer och tar sin databas + uuid/now som parametrar (se Store i core.ts).
 * Klockan är injicerad, så vi kan hoppa fram en dag och testa att "förra
 * passet"-logiken faktiskt hittar rätt pass.
 *
 * Körs med `npm run test:db`.
 *
 * Skriptet kompilerar SJÄLV de rena TS-filerna till CJS i .verify/ i stället
 * för att göra det i package.json. Skälet är byggmekaniskt: `package.json` →
 * `scripts` ligger i EAS native-fingerprint, så varje ny testfil i en
 * kommandorad hade tvingat fram ett helt EAS-bygge. Med filistan här inne är
 * den kostnaden borta för gott.
 */
const { DatabaseSync } = require("node:sqlite");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("path");

/** Rena filer utan expo-/react-importer — det som gör testet möjligt i Node. */
const PURE_SOURCES = [
  "lib/db/core.ts",
  "lib/db/queries.ts",
  "lib/db/migrations.ts",
  "lib/db/seed.ts",
  "lib/db/match.ts",
  "lib/db/types.ts",
  "lib/dates.ts",
];

const ROOT = path.join(__dirname, "..");
execFileSync(
  path.join(ROOT, "node_modules", ".bin", "tsc"),
  [
    ...PURE_SOURCES,
    "--outDir", ".verify",
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2022",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--ignoreConfig",
    "--ignoreDeprecations", "6.0",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

const OUT = path.join(__dirname, "..", ".verify", "lib", "db");
const core = require(path.join(OUT, "core.js"));
const q = require(path.join(OUT, "queries.js"));
const { normalizeName } = require(path.join(OUT, "match.js"));
const { MIGRATIONS } = require(path.join(OUT, "migrations.js"));
const dates = require(path.join(__dirname, "..", ".verify", "lib", "dates.js"));

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

  console.log("Bästa vikt per maskin (PB)");
  // exId är bröstpressen med maskinen `machineId` på gyms[0]. Där loggades
  // 50, 50 och 55 kg tidigare i testet.
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: exId, machineId }),
    55,
    "tyngsta loggade vikten på maskinen hittas",
  );

  // Samma övning på ett ANNAT gym är en annan fysisk maskin med annan viktskala.
  const otherMachine = await q.createMachine(store, {
    gymId: gyms[1].id,
    exerciseId: exId,
    manufacturer: "Technogym",
    weightStep: 5,
  });
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: exId, machineId: otherMachine }),
    null,
    "PB räknas per maskin — en ny maskin startar utan rekord trots samma övning",
  );

  const pbSession = await q.startSession(store, gyms[1].id);
  await q.logSet(store, {
    sessionId: pbSession.id,
    exerciseId: exId,
    machineId: otherMachine,
    weightKg: 30,
    reps: 10,
    setIndex: 1,
  });
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: exId, machineId: otherMachine }),
    30,
    "den nya maskinen får sitt eget rekord",
  );
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: exId, machineId }),
    55,
    "den andra maskinens rekord påverkas inte",
  );

  // Fria vikter saknar maskin — då jämförs inom övningen, men bara mot set utan maskin.
  const freeEx = (await q.findExerciseByName(store, "Sidolyft")).id;
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: freeEx, machineId: null }),
    null,
    "övning utan loggade set saknar rekord",
  );
  await q.logSet(store, {
    sessionId: pbSession.id,
    exerciseId: freeEx,
    machineId: null,
    weightKg: 12.5,
    reps: 12,
    setIndex: 1,
  });
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: freeEx, machineId: null }),
    12.5,
    "fri vikt får rekord på övningen",
  );

  await q.deleteSet(store, (await q.setsInSession(store, pbSession.id, freeEx))[0].id);
  eq(
    await q.bestWeightOnMachine(store, { exerciseId: freeEx, machineId: null }),
    null,
    "ångrat set räknas inte som rekord",
  );
  await q.endSession(store, pbSession.id, { feeling: null, notes: null });

  console.log("Vecka, volym och mål");
  // Egen databas: veckoaggregaten är känsliga för allt som loggats ovan, och
  // ett isolerat underlag gör förväntningarna exakta i stället för ungefärliga.
  const wdb = new DatabaseSync(":memory:");
  let wclock = Date.parse("2026-08-03T09:00:00.000Z"); // en måndag
  const wstore = {
    db: adapter(wdb),
    uuid: randomUUID,
    now: () => new Date(wclock).toISOString(),
  };
  await core.initStore(wstore);

  const wgym = (await q.listGyms(wstore))[0].id;
  const barbell = await q.findExerciseByName(wstore, "Bänkpress"); // total
  const dumbbell = await q.findExerciseByName(wstore, "Sidolyft"); // per_hand
  const weekStart = new Date(wclock).toISOString();

  const blankWeek = await q.weekSummary(wstore, weekStart);
  eq(blankWeek.sessions, 0, "tom vecka har noll pass");
  eq(blankWeek.volumeKg, 0, "tom vecka har noll volym");

  // Ett avslutat pass: 100 kg × 10 skivstång + 10 kg × 10 hantlar (räknas ×2).
  const w1 = await q.startSession(wstore, wgym);
  await q.logSet(wstore, {
    sessionId: w1.id, exerciseId: barbell.id, machineId: null,
    weightKg: 100, reps: 10, setIndex: 1,
  });
  await q.logSet(wstore, {
    sessionId: w1.id, exerciseId: dumbbell.id, machineId: null,
    weightKg: 10, reps: 10, setIndex: 1,
  });
  eq(await q.sessionVolumeKg(wstore, w1.id), 1200, "hantlar räknas dubbelt i volymen");

  eq(
    (await q.weekSummary(wstore, weekStart)).sessions,
    0,
    "ett PÅGÅENDE pass räknas inte — passet hör till veckan när det är klart",
  );
  wclock += 45 * 60_000;
  await q.endSession(wstore, w1.id, { feeling: "lagom", notes: null });

  const afterOne = await q.weekSummary(wstore, weekStart);
  eq(afterOne.sessions, 1, "avslutat pass räknas");
  eq(afterOne.volumeKg, 1200, "veckovolymen använder samma formel");
  eq(afterOne.prevVolumeKg, 0, "förra veckan var tom");

  // Fyra pass i veckan, fyra veckor bakåt — underlag för "vanliga dagar" och
  // för att förra veckan ska ha volym.
  for (let week = 1; week <= 4; week++) {
    for (let i = 0; i < 4; i++) {
      wclock = Date.parse(weekStart) - week * 7 * 86_400_000 + i * 86_400_000;
      const s = await q.startSession(wstore, wgym);
      await q.logSet(wstore, {
        sessionId: s.id, exerciseId: barbell.id, machineId: null,
        weightKg: 80, reps: 10, setIndex: 1,
      });
      wclock += 40 * 60_000;
      await q.endSession(wstore, s.id, { feeling: null, notes: null });
    }
  }
  wclock = Date.parse(weekStart) + 9 * 3600_000;
  ok((await q.weekSummary(wstore, weekStart)).prevVolumeKg > 0, "förra veckans volym hittas");

  console.log("Nya rekord");
  const since = new Date(Date.parse(weekStart) - 86_400_000).toISOString();
  const pbs = await q.recentPbs(wstore, since);
  ok(
    pbs.some((p) => p.exerciseId === barbell.id && p.weightKg === 100),
    "100 kg slår tidigare 80 kg och räknas som rekord",
  );
  eq(
    pbs.find((p) => p.exerciseId === barbell.id).deltaKg,
    20,
    "skillnaden mot förra rekordet räknas ut",
  );
  eq(
    (await q.recentPbs(wstore, new Date(wclock + 86_400_000).toISOString())).length,
    0,
    "inga rekord i en period utan set",
  );

  console.log("Föreslagen plan");
  eq(await q.lastUsedRoutine(wstore), null, "utan plan-pass finns inget förslag");
  const wroutine = await q.createRoutine(wstore, "Överkropp");
  await q.addRoutineItem(wstore, wroutine, barbell.id);
  const planned2 = await q.startSession(wstore, wgym, wroutine);
  await q.logSet(wstore, {
    sessionId: planned2.id, exerciseId: barbell.id, machineId: null,
    weightKg: 90, reps: 8, setIndex: 1,
  });
  wclock += 50 * 60_000;
  await q.endSession(wstore, planned2.id, { feeling: null, notes: null });

  const suggested = await q.lastUsedRoutine(wstore);
  eq(suggested.name, "Överkropp", "senast körda planen föreslås");
  eq(suggested.itemCount, 1, "antal övningar följer med");
  eq(await q.averageSessionMinutes(wstore, wroutine), 50, "snittlängden räknas ur passen");
  eq(
    await q.averageSessionMinutes(wstore, "finns-inte"),
    null,
    "plan utan avslutade pass saknar snittlängd",
  );

  console.log("Planerade dagar");
  eq((await q.listPlannedDays(wstore, "2026-01-01", "2026-12-31")).length, 0, "inget planerat från start");

  await q.setPlannedDay(wstore, "2026-08-06", true);
  await q.setPlannedDay(wstore, "2026-08-04", true);
  await q.setPlannedDay(wstore, "2026-08-08", true);
  eq(
    (await q.listPlannedDays(wstore, "2026-08-01", "2026-08-31")).join(","),
    "2026-08-04,2026-08-06,2026-08-08",
    "planerade dagar returneras i datumordning",
  );
  eq(
    (await q.listPlannedDays(wstore, "2026-08-05", "2026-08-07")).join(","),
    "2026-08-06",
    "intervallet är inklusive i båda ändar",
  );

  await q.setPlannedDay(wstore, "2026-08-06", false);
  eq(
    (await q.listPlannedDays(wstore, "2026-08-01", "2026-08-31")).join(","),
    "2026-08-04,2026-08-08",
    "avmarkerad dag försvinner",
  );

  // Unique-indexet på `day` gör att raden MÅSTE återanvändas, inte skapas om.
  await q.setPlannedDay(wstore, "2026-08-06", true);
  eq(
    (await q.listPlannedDays(wstore, "2026-08-06", "2026-08-06")).length,
    1,
    "samma dag går att slå på igen efter att ha stängts av",
  );
  const rowCount = wdb.prepare("SELECT COUNT(*) AS n FROM planned_day WHERE day = ?").get("2026-08-06");
  eq(rowCount.n, 1, "ingen dubblettrad skapas när dagen slås på igen");

  console.log("Nästa planerade dag");
  eq(await q.nextPlannedDay(wstore, "2026-08-01"), "2026-08-04", "första planerade framåt hittas");
  eq(await q.nextPlannedDay(wstore, "2026-08-04"), "2026-08-04", "i dag räknas som nästa");
  eq(await q.nextPlannedDay(wstore, "2026-08-05"), "2026-08-06", "passerade dagar hoppas över");
  eq(await q.nextPlannedDay(wstore, "2026-09-01"), null, "inget planerat framåt ger null");

  console.log("Konvertering från veckodagar");
  const conv = new DatabaseSync(":memory:");
  const cstore = { db: adapter(conv), uuid: randomUUID, now: () => new Date(wclock).toISOString() };
  await core.initStore(cstore);
  eq(
    await q.migrateTrainingDaysToPlannedDays(cstore, "2026-08-03", 2),
    0,
    "utan gamla veckodagar görs ingenting",
  );
  await q.setSetting(cstore, "training_days", JSON.stringify([1, 4]));
  eq(
    await q.migrateTrainingDaysToPlannedDays(cstore, "2026-08-03", 2),
    4,
    "två veckodagar i två veckor blir fyra datum",
  );
  eq(
    (await q.listPlannedDays(cstore, "2026-08-01", "2026-08-31")).join(","),
    "2026-08-03,2026-08-06,2026-08-10,2026-08-13",
    "rätt datum för måndagar och torsdagar",
  );
  eq(
    await q.migrateTrainingDaysToPlannedDays(cstore, "2026-08-03", 2),
    0,
    "konverteringen körs bara en gång",
  );

  console.log("Tränade dagar");
  eq((await q.trainedDays(wstore, "2026-08-01", "2026-08-31")).length, 1, "en tränad dag i augusti");

  console.log("Pass per planerad dag");
  // Planerade dagar just nu: 2026-08-04, -06 och -08. `wroutine` = "Överkropp".
  eq(
    await q.plannedRoutineForDay(wstore, "2026-08-06"),
    null,
    "planerad dag utan valt pass ger null — dagen behöver inget pass",
  );

  await q.setPlannedDayRoutine(wstore, "2026-08-06", wroutine);
  const dayPlan = await q.plannedRoutineForDay(wstore, "2026-08-06");
  eq(dayPlan.name, "Överkropp", "valt pass hittas för dagen");
  eq(dayPlan.itemCount, 1, "antal övningar följer med");
  eq(
    await q.plannedRoutineForDay(wstore, "2026-08-04"),
    null,
    "valet gäller bara den dag det sattes",
  );

  const plans = await q.listPlannedDayPlans(wstore, "2026-08-01", "2026-08-31");
  eq(plans.length, 3, "alla planerade dagar kommer med, med eller utan pass");
  eq(plans.find((p) => p.day === "2026-08-06").routineName, "Överkropp", "passets namn följer med");
  eq(plans.find((p) => p.day === "2026-08-04").routineId, null, "dag utan pass har null");

  // Att välja pass för en dag som inte var planerad ska planera den.
  await q.setPlannedDayRoutine(wstore, "2026-08-20", wroutine);
  ok(
    (await q.listPlannedDays(wstore, "2026-08-20", "2026-08-20")).length === 1,
    "att välja pass planerar dagen",
  );
  await q.setPlannedDayRoutine(wstore, "2026-08-20", null);
  eq(await q.plannedRoutineForDay(wstore, "2026-08-20"), null, "passet går att ta bort");
  eq(
    (await q.listPlannedDays(wstore, "2026-08-20", "2026-08-20")).length,
    1,
    "dagen är kvar när bara passet tas bort",
  );

  // Avplanerad dag ska glömma sitt pass — annars kommer det tyst tillbaka.
  await q.setPlannedDay(wstore, "2026-08-06", false);
  await q.setPlannedDay(wstore, "2026-08-06", true);
  eq(
    await q.plannedRoutineForDay(wstore, "2026-08-06"),
    null,
    "avplanerad och återplanerad dag är tom igen",
  );

  // En raderad plan får aldrig bli en dinglande referens.
  const doomed = await q.createRoutine(wstore, "Tas bort");
  await q.setPlannedDayRoutine(wstore, "2026-08-08", doomed);
  ok(await q.plannedRoutineForDay(wstore, "2026-08-08"), "passet är valt innan planen raderas");
  await q.deleteRoutine(wstore, doomed);
  eq(
    await q.plannedRoutineForDay(wstore, "2026-08-08"),
    null,
    "raderad plan gör dagen passlös i stället för trasig",
  );
  eq(
    (await q.listPlannedDayPlans(wstore, "2026-08-08", "2026-08-08"))[0].routineId,
    null,
    "listan visar ingen dinglande referens",
  );

  console.log("Vanligaste gym och planer");
  const topGyms = await q.listTopGyms(wstore, 3);
  eq(topGyms[0].name, "Hemmagym", "gymmet med flest pass ligger först");
  eq(topGyms[0].sessions, 18, "antal pass räknas per gym");
  eq(topGyms[1].sessions, 0, "gym utan pass hamnar sist men är kvar");
  eq((await q.listTopGyms(wstore, 1)).length, 1, "gränsen respekteras");

  await q.createRoutine(wstore, "Ben");
  const topRoutines = await q.listTopRoutines(wstore, 3);
  eq(topRoutines[0].name, "Överkropp", "planen med flest pass ligger först");
  eq(topRoutines[0].sessions, 1, "antal pass räknas per plan");
  eq(topRoutines[0].itemCount, 1, "antal övningar följer med");
  eq(topRoutines[1].name, "Ben", "nyskapad plan utan pass är med men sist");
  eq(topRoutines[1].sessions, 0, "en oanvänd plan har noll pass");

  console.log("Månadssummor");
  const months = await q.monthlyTotals(wstore, "2026-01-01", "2026-12-31");
  eq(months.length, 2, "bara månader med avslutade pass finns med");
  eq(months[0].month, "2026-07", "månaderna kommer i ordning");
  eq(months[0].sessions, 16, "juli har sexton pass");
  eq(months[0].volumeKg, 12800, "julis volym summeras");
  eq(months[0].sets, 16, "antal set räknas");
  eq(months[1].month, "2026-08", "augusti är den andra månaden");
  eq(months[1].sessions, 2, "augusti har två pass");
  eq(months[1].volumeKg, 1920, "hantlar räknas dubbelt även i månadssumman");
  eq(months[1].sets, 3, "tre set i augusti");
  eq(
    (await q.monthlyTotals(wstore, "2026-08-01", "2026-08-31")).length,
    1,
    "intervallet begränsar vilka månader som räknas",
  );
  eq(
    (await q.monthlyTotals(wstore, "2025-01-01", "2025-12-31")).length,
    0,
    "en period utan pass ger inga rader alls — inget snitt att dela med noll",
  );

  console.log("Passhistorik");
  // Egen databas: historiken ska ha ett exakt underlag, inte allt som råkat
  // loggas ovan.
  const hdb = new DatabaseSync(":memory:");
  let hclock = Date.parse("2026-08-10T09:00:00.000Z");
  const hstore = { db: adapter(hdb), uuid: randomUUID, now: () => new Date(hclock).toISOString() };
  await core.initStore(hstore);

  const hgyms = await q.listGyms(hstore);
  const hbar = (await q.findExerciseByName(hstore, "Bänkpress")).id; // total
  const hlift = (await q.findExerciseByName(hstore, "Sidolyft")).id; // per_hand

  eq((await q.listSessions(hstore)).length, 0, "tom historik från start");

  const h1 = await q.startSession(hstore, hgyms[0].id);
  for (const [w, r, i] of [[100, 10, 1], [100, 8, 2]]) {
    await q.logSet(hstore, {
      sessionId: h1.id, exerciseId: hbar, machineId: null, weightKg: w, reps: r, setIndex: i,
    });
  }
  await q.logSet(hstore, {
    sessionId: h1.id, exerciseId: hlift, machineId: null, weightKg: 10, reps: 12, setIndex: 1,
  });
  hclock += 50 * 60_000;
  await q.endSession(hstore, h1.id, { feeling: "lagom", notes: "Ont i axeln" });

  const hs1 = (await q.listSessions(hstore))[0];
  eq(hs1.gymName, "Hemmagym", "gymnamnet följer med utan ett anrop per rad");
  eq(hs1.sets, 3, "antal set räknas");
  eq(hs1.exercises, 2, "antal övningar räknas");
  eq(hs1.volumeKg, 2040, "volymen räknar hantlar dubbelt (1000 + 800 + 240)");
  eq(hs1.feeling, "lagom", "känslan följer med");
  eq(hs1.notes, "Ont i axeln", "kommentaren går att läsa igen");
  eq(hs1.routineName, null, "pass utan plan har ingen plan");

  hclock = Date.parse("2026-08-11T17:00:00.000Z");
  const hroutine = await q.createRoutine(hstore, "Ben");
  await q.addRoutineItem(hstore, hroutine, hbar);
  const h2 = await q.startSession(hstore, hgyms[1].id, hroutine);
  await q.logSet(hstore, {
    sessionId: h2.id, exerciseId: hbar, machineId: null, weightKg: 60, reps: 10, setIndex: 1,
  });
  hclock += 30 * 60_000;
  await q.endSession(hstore, h2.id, { feeling: null, notes: null });

  const hlist = await q.listSessions(hstore);
  eq(hlist.length, 2, "båda passen finns i historiken");
  eq(hlist[0].id, h2.id, "nyast först");
  eq(hlist[0].routineName, "Ben", "plannamnet följer med");

  // Ett PÅGÅENDE pass hör hemma i Gymma-fliken, inte i loggboken.
  hclock = Date.parse("2026-08-12T09:00:00.000Z");
  const hOpen = await q.startSession(hstore, hgyms[0].id);
  await q.logSet(hstore, {
    sessionId: hOpen.id, exerciseId: hbar, machineId: null, weightKg: 70, reps: 5, setIndex: 1,
  });
  eq((await q.listSessions(hstore)).length, 2, "pågående pass syns inte i historiken");
  eq((await q.sessionsOnDay(hstore, "2026-08-12")).length, 0, "och hamnar inte på sin dag heller");

  // sessionsOnDay måste dra dygnsgränsen på EXAKT samma sätt som trainedDays,
  // annars skulle kalendern markera en dag som man inte kan öppna.
  const hdays = await q.trainedDays(hstore, "2026-08-01", "2026-08-31");
  eq(hdays.length, 2, "två tränade dagar");
  let hFound = 0;
  for (const d of hdays) hFound += (await q.sessionsOnDay(hstore, d)).length;
  eq(hFound, 2, "sessionsOnDay hittar samma pass som trainedDays — samma dygnsgräns");

  hclock += 20 * 60_000;
  await q.endSession(hstore, hOpen.id, { feeling: null, notes: null });

  const hgroups = await q.sessionExerciseGroups(hstore, h1.id);
  eq(hgroups.length, 2, "seten grupperas per övning");
  eq(hgroups[0].exercise.name, "Bänkpress", "övningarna kommer i loggordning");
  eq(hgroups[0].sets.length, 2, "två set på första övningen");
  eq(hgroups[1].sets.length, 1, "ett set på den andra");

  console.log("Rätta ett pass i efterhand");
  await q.updateSession(hstore, h1.id, { feeling: "latt", notes: "Axeln bättre nu" });
  const hEdited = await q.getSessionSummary(hstore, h1.id);
  eq(hEdited.notes, "Axeln bättre nu", "kommentaren går att rätta");
  eq(hEdited.feeling, "latt", "känslan går att rätta");
  await q.updateSession(hstore, h1.id, { notes: "   " });
  eq((await q.getSessionSummary(hstore, h1.id)).notes, null, "tom kommentar sparas som null");

  await q.updateSet(hstore, hgroups[0].sets[0].id, { weightKg: 110, reps: 9 });
  eq(
    (await q.getSessionSummary(hstore, h1.id)).volumeKg,
    110 * 9 + 100 * 8 + 240,
    "volymen räknas om efter ett rättat set — den lagras aldrig",
  );
  eq(
    await q.bestWeightOnMachine(hstore, { exerciseId: hbar, machineId: null }),
    110,
    "det rättade setet slår igenom i rekordet",
  );

  console.log("Radera pass tar seten med sig");
  // DET HÄR är bygget farligaste fel: lämnas seten kvar fortsätter ett raderat
  // pass styra förifyllning och rekord, medan månadsbrickorna ser rätt ut.
  ok((await q.lastSets(hstore, hbar, null)).length > 0, "det finns set att förifylla från");
  await q.deleteSession(hstore, h1.id);

  eq((await q.listSessions(hstore)).length, 2, "passet försvinner ur historiken");
  eq(await q.getSessionSummary(hstore, h1.id), null, "och går inte att öppna igen");
  eq(
    await q.bestWeightOnMachine(hstore, { exerciseId: hbar, machineId: null }),
    70,
    "rekordet från det raderade passet räknas INTE längre",
  );
  const hAfter = await q.lastSets(hstore, hbar, null);
  eq(hAfter.length, 1, "förifyllningen kommer nu från passet innan");
  eq(hAfter[0].weightKg, 70, "och har det passets vikt");
  ok(
    !(await q.recentPbs(hstore, "2026-08-01T00:00:00.000Z")).some((p) => p.weightKg === 110),
    "raderade set kan inte bli rekord",
  );
  const hMonth = await q.monthlyTotals(hstore, "2026-08-01", "2026-08-31");
  eq(hMonth[0].sessions, 2, "månadsbrickan tappar det raderade passet");
  eq(hMonth[0].volumeKg, 950, "och dess volym (600 + 350)");
  eq((await q.sessionExerciseGroups(hstore, h1.id)).length, 0, "passets set är borta");

  console.log("Viktsteget normaliseras en gång");
  // Simulera en telefon som redan har biblioteket på det gamla 2,5 kg-steget.
  const sdb = new DatabaseSync(":memory:");
  const sstore = { db: adapter(sdb), uuid: randomUUID, now: () => new Date(hclock).toISOString() };
  await core.initStore(sstore);
  sdb.prepare("UPDATE exercise SET weight_step = 2.5").run();
  sdb.prepare("DELETE FROM app_setting WHERE key = 'weight_step_1kg'").run();

  const sgym = (await q.listGyms(sstore))[0].id;
  const sEx = (await q.findExerciseByName(sstore, "Bänkpress")).id;
  // En maskin med ett riktigt viktmagasin ska INTE röras.
  const sMachine = await q.createMachine(sstore, {
    gymId: sgym, exerciseId: sEx, weightStep: 5,
  });

  ok((await core.normaliseWeightSteps(sstore)) > 0, "gamla 2,5 kg-steg justeras");
  eq((await q.getExercise(sstore, sEx)).weightStep, 1, "övningen stegar nu 1 kg");
  eq(
    (await q.getMachine(sstore, sEx, sgym)).weightStep,
    5,
    "maskinens steg rörs INTE — magasinet går faktiskt i 5 kg",
  );
  eq(q.weightStepFor(await q.getExercise(sstore, sEx), await q.getMachine(sstore, sEx, sgym)), 5,
    "och maskinens steg vinner fortfarande i loggvyn");

  // Ett eget val i efterhand ska stå kvar.
  await q.setWeightStep(sstore, { exerciseId: sEx, machineId: null }, 2.5);
  eq(await core.normaliseWeightSteps(sstore), 0, "justeringen körs bara en gång");
  eq(
    (await q.getExercise(sstore, sEx)).weightStep,
    2.5,
    "ett eget val av 2,5 kg efteråt skrivs aldrig över",
  );
  eq(await core.normaliseWeightSteps(hstore), 0, "en färsk databas har inget att justera");

  console.log("Maskinen skapas när den används");
  const hmEx = await q.createExercise(hstore, {
    name: "Bröstpress", type: "machine", weightUnit: "total", weightStep: 5,
  });
  ok(
    !(await q.listExercisesForGym(hstore, hgyms[1].id, null)).some((i) => i.exercise.id === hmEx),
    "en maskinövning utan maskin syns inte på gymmet — buggen vi fixar",
  );

  const hm1 = await q.getOrCreateMachine(hstore, hmEx, hgyms[0].id, 5);
  eq(
    (await q.getOrCreateMachine(hstore, hmEx, hgyms[0].id, 5)).id,
    hm1.id,
    "andra anropet återanvänder raden i stället för att skapa en till",
  );
  const hm2 = await q.getOrCreateMachine(hstore, hmEx, hgyms[1].id, 5);
  ok(hm2.id !== hm1.id, "varje gym får sin egen maskin — viktskalor skiljer sig");
  ok(
    (await q.listExercisesForGym(hstore, hgyms[1].id, null)).some((i) => i.exercise.id === hmEx),
    "och nu syns övningen på gymmet där den använts",
  );

    console.log("Datumhjälpare");
  eq(dates.toDayKey(new Date(2026, 7, 4)), "2026-08-04", "lokalt datum blir rätt nyckel");
  eq(dates.daysBetween("2026-08-04", "2026-08-06"), 2, "dagar mellan datum räknas rätt");
  eq(dates.daysBetween("2026-08-04", "2026-08-04"), 0, "samma dag ger noll");
  const grid = dates.monthGrid(2026, 7); // augusti 2026 börjar en lördag
  eq(grid.length % 7, 0, "rutnätet är jämnt delbart med sju");
  eq(grid.filter(Boolean).length, 31, "augusti har 31 dagar");
  eq(grid[0], null, "tomma rutor före den första");
  eq(grid[5], "2026-08-01", "första augusti hamnar på lördagsplatsen");
  eq(dates.toMonthKey(new Date(2026, 7, 4)), "2026-08", "månadsnyckeln blir rätt");
  eq(dates.describeMonth("2026-08"), "augusti 2026", "månaden beskrivs på svenska");
  // Augusti plus de sex föregående månaderna = februari–augusti.
  const span = dates.monthSpanDays(2026, 7, 6);
  eq(span.from, "2026-02-01", "sex månader bakåt från augusti börjar i februari");
  eq(span.to, "2026-08-31", "spannet slutar sista dagen i augusti");
  eq(dates.monthSpanDays(2026, 1, 0).to, "2026-02-28", "februari 2026 slutar den 28:e");
  eq(dates.monthSpanDays(2026, 0, 1).from, "2025-12-01", "spannet klarar årsskiftet");
  eq(dates.greeting(new Date(2026, 7, 4, 7)), "God morgon", "morgonhälsning före tio");
  eq(dates.greeting(new Date(2026, 7, 4, 20)), "God kväll", "kvällshälsning efter arton");

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
