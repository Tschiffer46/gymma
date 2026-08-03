# Gymma — projektinstruktioner

## Vad detta är
iOS-app (Expo/React Native) för att logga styrketräning — maskiner, hantlar och skivstång.
All data ligger **lokalt på telefonen** i SQLite. Ingen backend, ingen inloggning, ingen sync.
Varje familjemedlem har sin egen loggbok; distribution sker via TestFlight.

Arbetsnamn: vadskavi.nu/gymma. Riggen är kopierad från systerappen **`laga-app`** (samma
Expo-version, samma EAS-workflow, samma byggrutin) — läs dess `CLAUDE.md` när något i
bygg-/deploykedjan strular, lärdomarna där gäller även här.

## Designprinciper — dessa väger tyngre än enskilda funktioner
Vid konflikt vinner principen. De kommer från kravspecen och är hela poängen med appen.

1. **Ett tryck per set.** Loggvyn är redan ifylld med förra passets siffror.
2. **Aldrig tangentbord under passet.** Endast stora +/– och bekräfta. Tangentbord är tillåtet
   när man lägger till en ny övning eller döper om ett gym — aldrig mellan set.
3. **Fungerar helt offline.** Gymkällare har usel täckning. Nät är en bonus, aldrig ett krav.
4. **Programmet växer fram.** Det finns ingen "skapa program"-vy. Maskiner läggs till när de
   används, inte i förväg.
5. **Tummen når allt.** Alla interaktiva element i nedre tredjedelen av skärmen.

## Stack
- **Expo SDK 56** + React Native 0.85.3 + TypeScript, **expo-router** (filbaserad routing)
- **NativeWind 4** + Tailwind 3 — mörka tokens i `lib/theme.ts` och `tailwind.config.js`
- **expo-sqlite** + egen migrationskörare. **Ingen ORM** (se "Varför inte Drizzle" nedan)
- **expo-crypto** (UUID), **expo-haptics** (kvitto på loggat set), **@expo/vector-icons** (Feather)
- **react-native-svg** (veckoringen; behövs även för graferna i Följ upp) + **Reanimated 4**
- **EAS Build/Submit/Update** → TestFlight, automatiserat via `.eas/workflows/deploy-ios.yml`

## Filstruktur
```
app/
├── _layout.tsx            DbProvider + laddningsgrind + Stack
├── (tabs)/
│   ├── _layout.tsx        Gymma / Följ upp / Planera / Inställningar
│   ├── index.tsx          GYMMA — startvy (var + hur) eller pågående pass
│   ├── insights.tsx       Följ upp — skal tills det finns data
│   ├── plan.tsx           Planera — lista över rutiner
│   └── settings.tsx       Gym (namn, lägg till) + versionsmarkör
├── log/[exerciseId].tsx   LOGGVYN — appens hjärta
├── session/end.tsx        Avsluta pass: känsla + anteckning
├── routine/[id].tsx       Redigera plan: namn, lägg till, omordna, ta bort
├── library.tsx            Övningsbibliotek med sök (nås från Inställningar)
├── exercise/new.tsx       Lägg till övning/maskin → direkt in i loggvyn
└── exercise/[id].tsx      Redigera övning: namn, engelskt namn, viktenhet, steg
components/  ui.tsx (Card/Button/Chip/Empty/Loading/SearchField) · ExerciseRow.tsx
             · WeekRing.tsx (SVG) · FillBar.tsx · StartSheet.tsx
lib/
├── theme.ts    mörka tokens + TAP (minsta tryckyta)
├── format.ts   svenska tal ("2,5 kg"), volym i ton, "50 kg × 10, 10, 9", relativa datum
├── dates.ts    veckostart (måndag), veckodagsnamn
├── muscles.ts  muskelnycklar → svenska visningsnamn
├── release.ts  RELEASE — byggmarkören, BUMPA PER RELEASE
└── db/
    ├── core.ts        SqlDb, Store, runMigrations, seedIfEmpty  ← inga expo-importer
    ├── queries.ts     all SQL                                    ← inga expo-importer
    ├── migrations.ts  MIGRATIONS: string[]
    ├── seed.ts        2 gym + 27 fria vikter
    ├── match.ts       normalizeName — övningsidentitet
    ├── types.ts       radtyper
    └── index.ts       DbProvider/useStore (expo-sqlite + expo-crypto) + re-export
scripts/
├── verify-db.cjs   hela datalagret testat mot node:sqlite, utan simulator
└── make-icon.cjs   genererar platshållarikonen
```

## Datamodell
Exakt kravspecens tabeller. **Alla har `id` (UUID), `created_at`, `updated_at`, `deleted_at`
(soft delete)** — det kostar ingenting nu och gör en framtida backend till en påbyggnad i
stället för en migrering. Tidsstämplar är ISO-8601-text.

```
gym         id, name, is_default
exercise    id, name, name_en, type('machine'|'freeweight'),
            weight_unit('total'|'per_hand'), weight_step,
            primary_muscles(JSON), secondary_muscles(JSON),
            match_key, merged_into_id
machine     id, gym_id, exercise_id, manufacturer, article_code, ocr_text,
            photo_uri, seat_settings, weight_step, last_used_at
session     id, gym_id, routine_id?, started_at, ended_at, feeling, notes
set_entry   id, session_id, machine_id?, exercise_id, weight_kg, reps, set_index, logged_at
routine     id, name
routine_item id, routine_id, exercise_id, position
session_skip id, session_id, exercise_id      -- överhoppat i ETT pass
app_setting  key, value                        -- t.ex. training_days
```

### Kritiskt: övningsidentitet får aldrig splittras
Två vägar leder in i appen (manuell inmatning nu, kamera/OCR och fritext i sprint 4–5). Skapar
de olika poster för samma sak splittras månadstrenden i två halva serier som båda är oanvändbara.

- **Ingen väg får skapa en `exercise` utan att först ha anropat `findExerciseByName()`.**
- `match_key` = `normalizeName(namn)` — gemener, å/ä/ö vikta till a/a/o, blanksteg borttagna.
- **`findExerciseByName` matchar även `name_en`.** Maskinskyltarna är på engelska
  ("CHEST PRESS", "PECTORAL", "LEG PRESS", "LOW ROW" — verifierat på Technogym-utrustningen),
  biblioteket är svenskt. Utan den matchningen skulle OCR skapa en dubblett varje gång.
  `updateExercise` skriver om `match_key` när namnet ändras, annars tappar skyddet greppet.
- **`topUpLibrary()`** (körs vid varje start) fyller i nya standardövningar och saknade
  `name_en` på telefoner som redan har data — `seedIfEmpty` kör ju bara på tom databas.
  Den kollar match_key **oavsett `deleted_at`** och återuppväcker därför aldrig något
  användaren själv tagit bort.
- `article_code` blir den starkaste matchningsnyckeln när kameran kopplas in (stabil per
  maskinmodell). Kolumnen finns redan.
- `merged_into_id` finns för "slå ihop dessa två övningar" (sprint 4). Alla listningar filtrerar
  redan på `merged_into_id IS NULL`.

### Kritiskt: viktskalor skiljer mellan maskiner
50 kg på en bröstpress är inte 50 kg på en annan — olika hävarmar och viktmagasin.
**Progression mäts per `machine_id`**, inte per övning. Därför är `machine` en fysisk instans
på ett specifikt gym, och `listExercisesForGym` visar bara maskiner som står på det gymmet.
Volym per muskelgrupp aggregeras däremot över allt.

### Hantelkonvention
`weight_unit = 'per_hand'` betyder att vikten som skrivs in är **per hantel**. Volym räknas ×2.
Enheten visas alltid explicit i loggvyn (`12 kg/hantel`) — blandas konventionerna blir
volymkurvan brus. Detta är ett tillägg utöver specen, som bara har `type` och därmed inte kan
skilja hantlar från skivstång.

### Träningsdagar: målet sätts, det härleds inte
`app_setting['training_days']` håller veckodagarna du valt i Planera, som en JSON-array med
`strftime('%w')`-nummer (0 = söndag).

Startvyn räknade tidigare mot ett **härlett** veckomål (medianen av senaste sex veckorna).
Det togs bort efter användartest 2026-08-03: "Två pass kvar den här veckan" utan att kunna se
var tvåan kom ifrån är brus, och ett osynligt mål går inte att ifrågasätta. **Återinför inte
`weeklyTarget()`.**

Startvyn svarar nu på *när nästa pass är*, inte *hur många som återstår* — en plan i stället
för ett betyg. Tom lista är ett giltigt tillstånd: då ber vyn dig välja i stället för att hitta
på ett mål åt dig.

`usualWeekdays()` finns kvar men har bytt roll: den föreslår dagar i Planera första gången,
den styr ingenting.

### Rutiner är en sparad ordning, aldrig ett krav
`routine` + `routine_item` (position 0,1,2…) och `session.routine_id`. Designprincip 4 gäller
fortfarande fullt ut, och det syns i tre val:

- Rutinen har **ingen gymkoppling** — samma "Överkropp" ska gå att köra var som helst.
- Under ett pass med plan finns alltid fliken **"Alla övningar"** bredvid "Planen". Planen är en
  genväg, inte en grind.
- Står en maskin i planen men inte på gymmet visas raden ändå, med texten "Finns inte på det här
  gymmet" — annars ser planen ut att ha tappat rader. `listExercisesForGym(..., alwaysInclude)`
  är till för just det.

**Positionerna hålls täta** (0,1,2…) av `removeRoutineItem`, vilket är det som gör
`moveRoutineItem` till ett enkelt platsbyte med grannen. Inför man luckor går den logiken sönder.

**Omordning sker med upp/ned, inte drag-and-drop.** `react-native-draggable-flatlist` och
`react-native-reorderable-list` har öppna peer-intervall mot reanimated, men ingen av dem är
belagt testad mot 4.3.1 (v4 var en omskrivning). Efter NativeWind-incidenten är obeprövade
beroenden som bara går sönder vid körning inte värda risken för en funktion som två knappar löser.

### Passets livscykel
Passet startas **uttryckligen** ("Kör på egen hand" i Gymma-fliken) och avslutas uttryckligen,
med hur det kändes. Men `getOrOpenSession()` finns kvar som skyddsnät i loggningsvägen: loggar
man ett set utan öppet pass ska setet aldrig gå förlorat bara för att en knapp inte tryckts.

- `startSession(gymId)` stänger först allt som glömts öppet.
- `endSession(id, {feeling, notes})` — **pass utan set raderas mjukt i stället för att sparas.**
  Startar man av misstag ska det inte bli brus i historiken. Samma sak sker för övergivna tomma
  pass när nästa startas.
- `getCurrentSession()` har kvar `SESSION_WINDOW_HOURS` = 6 h som bortre gräns, så ett glömt
  pass inte står öppet i dagar.
- Avbockningen i listan är helt enkelt "har den här övningen set i det pågående passet".

## Konventioner
- **Språk i UI: svenska.** Även kodkommentarer. Tal med decimalkomma (`fmtWeight`).
- **Inga hårdkodade färger i ny UI** — använd `colors` från `lib/theme.ts` eller Tailwind-tokens
  (`bg-card`, `text-ink`, `border-line`, `bg-accent` …). De två hålls i synk manuellt.
  `tint.accent` / `tint.ok` är tonade brickor och är avsiktligt `rgba` — de ligger ovanpå
  olika underlag och ska släppa igenom dem.
- **`radius` är en skala**, inte ett tal: `{ sm: 12, md: 16, lg: 18, xl: 20, pill: 9999 }`.
  Skillnaden bär mening — en tryckyta i loggvyn (`xl`) ska kännas mjukare än ett listkort (`md`).
- **Alla siffror som ändras ska vara tabulära** — `fontVariant: ["tabular-nums"]`. Utan det
  hoppar vikten i sidled när man stegar 47,5 → 50, och det är precis den sortens skavank som
  får appen att kännas oputsad.
- **Minsta tryckyta:** `TAP` (64pt) för allt som trycks på under ett pass.
- **`lib/db/core.ts` och `lib/db/queries.ts` får ALDRIG importera från expo eller react.**
  Det är vad som gör `npm run test:db` möjligt utan simulator. React-/expo-sidan bor i
  `lib/db/index.ts`, som re-exporterar allt — appkod importerar alltid från `@/lib/db`.
- `Store` (`{ db, uuid, now }`) skickas som första argument till varje query. `uuid`/`now` är
  injicerade just för att testet ska kunna hoppa fram ett dygn och verifiera förifyllningen.

### Varför inte Drizzle (som specen föreslog)
Drizzle på Expo kräver `drizzle-kit`, en tredjeparts babel-plugin som inlinar `.sql`-filer och
extra metro-config — fyra rörliga delar i byggkedjan som måste samsas med `nativewind/babel`.
För sex tabeller och ~20 queries är vinsten liten och risken den sort som redan kostat tid i
`laga-app`. Schemat är identiskt med specens; bara verktyget skiljer.

## Kommandon
```bash
npm install              # installera
npx expo start           # utvecklingsserver
npm run typecheck        # tsc --noEmit
npm run test:db          # hela datalagret mot node:sqlite — kör detta före commit
npx expo export --platform ios   # bundlar via Metro, fångar import-/kompileringsfel
node scripts/make-icon.cjs       # regenerera platshållarikonen
```

## Verifiering före commit
Ingen simulator finns i Claude-web-sessioner. Kör alltid:
```bash
npm run verify && npx expo export --platform ios
```
`verify` = `verify:deps` + `typecheck` + `test:db`.

**Dessa bevisar inte att appen ser rätt ut.** Sprint 1 gick till TestFlight med all styling död
medan alla tre var gröna (se NativeWind-punkten under Gotchas). Den enda kontroll som fångar
den klassen av fel är att titta på appen — iOS-simulatorn i Claude Code Desktop på Macen, eller
`npx expo start` + `i`. Gör det innan något går till TestFlight.
`test:db` kompilerar `lib/db/*` till CJS i `.verify/` och kör dem mot en riktig SQLite-databas
i minnet — migrationer, seed, idempotens, gymbyte, övningsmatchning, passlogik, förifyllning
över dygnsgräns och soft delete. Riktig runtime-verifiering sker först på telefonen.

## Bygg & deploy
**Allt sker automatiskt vid merge till `main`** — ingen terminal.
`.eas/workflows/deploy-ios.yml` beräknar native-fingerprintet och avgör själv:
ren JS-ändring → **OTA** (`eas update`, sekunder, ingen byggkvot); native-ändring (ny modul,
capability, ikon, native-fält i `app.json`) → **bygg + submit** till TestFlight.

### Engångssetup — GJORD 2026-08-02
Kör inte om detta. Antecknat för spårbarhet:

| Sak | Värde |
|---|---|
| EAS-projekt | `7531d681-3148-493d-ae86-2718c7eb810f` (@tschiffer46/gymma) |
| Bundle-id | `nu.vadskavi.gymma` |
| Apple Team | `9R6F4TGQF5` (Agile Transition Management AB) |
| Distributionscertifikat | delas med `vadskavi-laga` — teamgemensamt, korrekt |
| App Store Connect-namn | `Gymma (08b912)` — "Gymma" var upptaget |
| ASC API-nyckel | `8PNNF895X6`, delas med laga — teamgemensam |
| **App Store Connect Apple ID** | **`6797230599`** — ligger som `ascAppId` i `eas.json` |

**`channel:edit` är inte valfritt.** I `laga-app` visade det sig att kopplingen channel →
branch **inte** skapas automatiskt trots samma namn. Symptomet är lömskt: workflowen publicerar
OTA:er som aldrig når telefonen, och Update Details säger "No deployments for this runtime".
```bash
npx eas-cli channel:edit production --branch production
```

### Fingerprintet avgör bygge vs OTA — vet vad som ligger i det
`runtimeVersion.policy: "fingerprint"` gör att EAS hashar de native-påverkande delarna av
projektet. Matchar hashen ett befintligt bygge blir mergen en OTA; annars ett nytt bygge.

**I fingerprintet:** `app.json` (hela expo-konfigen, inklusive `version` och `ios.buildNumber`),
**`eas.json`**, `.gitignore`, ikonen, config-pluginfilerna, `package.json` → `scripts`, samt
native-beroendena och autolinking-konfigen.

**Inte i fingerprintet:** allt under `app/`, `lib/`, `components/`, `scripts/`, samt `CLAUDE.md`
och annan dokumentation. Det är därför en ren kodändring blir en OTA.

**Konsekvens:** varje konfigändring, hur liten den än är, kostar ett bygge ur kvoten. Uppmätt
2026-08-02 (`npx expo-updates fingerprint:generate --platform ios`):

| Ändring | Hash |
|---|---|
| nuläget | `0b4640e4…` |
| ta bort `ios.buildNumber` | `360bb89c…` |
| lägga till `ascAppId` i `eas.json` | `0e42107e…` |

**`package.json` → `scripts` ingår också** — att lägga till ett npm-script tvingar fram ett
bygge. Uppmätt: att lägga till `verify` och `verify:deps` ändrade hashen till `aa115364…`
medan beroendeändringen i samma commit var helt fingerprint-neutral.

**Bunta därför ihop alla konfigändringar i EN commit**, helst tillsammans med en ändring som
ändå kräver ett nytt bygge (t.ex. en ny native-modul). Att smyga in dem en och en betyder ett
bygge per ändring.

Det gjordes 2026-08-02: NativeWind-fixen krävde nya npm-scripts, och då följde `ascAppId`,
borttaget `ios.buildNumber` och `/ios` + `/android` i `.gitignore` med i samma bygge. Konfigen
har därmed ingen känd skuld kvar.

### Verifiera OTA-vägen (gör detta innan du litar på den)
Den här vägen går sönder tyst — workflowen rapporterar en lyckad uppdatering som aldrig når
telefonen. Testa den så här:

1. Bumpa `RELEASE` i `lib/release.ts`. Filen ligger **utanför** fingerprintet, så mergen blir
   garanterat en OTA och aldrig ett bygge.
2. Merga till `main`. På expo.dev → Workflows ska jobbet `publish_update` köra — inte
   `build_ios`. Kör den bygg-jobbet i stället är fingerprintet oväntat ändrat.
3. Kallstarta appen **två gånger** på telefonen (första starten hämtar uppdateringen, andra
   applicerar den) och kolla Inställningar → Version.
4. Står det gamla värdet kvar: gå till expo.dev → Deploy → Channels → production. Pekar den
   inte på branch `production` är det felet — kör `channel:edit`-kommandot ovan.

## Gotchas
- **`react` MÅSTE matcha `react-native`s renderer.** SDK 56 / RN 0.85.3 ⇒ **react@19.2.3**.
  Fel version kraschar appen tyst i produktion — felet syns bara i dev client.
  Kolla med: `node -e "console.log(require('./node_modules/react-native/package.json').peerDependencies.react)"`
- **`expo install` är blockerad i Claude-web-sessioner** (nätverkspolicyn tillåter GitHub och
  npm-registret, inte Expos API). Lägg till expo-paket med `npm install <pkg>@~56.0.x`.
- **Ny native dependency ⇒ nytt EAS-bygge.** En ny native-modul finns inte i en redan byggd
  binär; en OTA kan inte leverera den. `runtimeVersion.policy: "fingerprint"` ser till att EAS
  tvingar fram ett bygge i stället för att skicka en trasig OTA.
- **`nativewind` och `react-native-css-interop` MÅSTE vara pinnade exakt** — inget `^`, inget
  `~`. `npm run verify:deps` failar om någon återinför ett caret.
  **Detta har redan kostat ett trasigt TestFlight-bygge** (2026-08-02): `nativewind: "^4.1.23"`
  löstes vid en ny installation till 4.2.6, som kräver `react-native-css-interop@0.2.6`, medan
  vår direkta dependency krävde `0.1.22`. npm installerade **båda kopiorna**, babel-transformen
  och runtime-registret hamnade i olika, och **all `className`-styling blev tyst verkningslös** —
  inline-styles fungerade, klasser inte. `tsc`, `test:db` och `expo export` gick alla igenom.
  Felet upptäcktes på ett foto av telefonen.
  Fungerande kombination: `nativewind@4.1.23` + `react-native-css-interop@0.1.22` (samma som
  `laga-app` faktiskt skickar i produktion). Obs: `laga-app` deklarerar fortfarande caret och
  räddas bara av sitt package-lock — en ren ominstallation där skulle gå i samma fälla.
- **`.npmrc` med `legacy-peer-deps=true` krävs** för att `npm ci` ska gå igenom på EAS.
- **`declare module "*.css";`** måste finnas i `nativewind-env.d.ts`, annars klagar `tsc` på
  `import "../global.css"`.
- **`nativewind/babel` ligger i `presets`, inte `plugins`.**
- **Migrationer får aldrig ändras i efterhand.** Telefoner som redan kört en migration kör den
  aldrig igen. Lägg bara till nya poster sist i `MIGRATIONS`.
- **Ikonen får inte ha alfakanal** — Apple avvisar app-ikoner med transparens.
  `scripts/make-icon.cjs` skriver RGB utan alfa.
- **Build numbers** sköts av EAS (`appVersionSource: "remote"` + `autoIncrement`). Ingen manuell
  bump. `buildNumber` i `app.json` är bara ett frö.

## Status
- **Sprint 1** ✅ Datamodell, seedat bibliotek, avbockningslista, loggvy med förifyllning från
  förra passet, gymväxlare, lägg till maskin/övning, inställningar. Appen går att ta med till
  gymmet.
- **Sprint 2** ✅ Fyrflikig navigation (Gymma/Följ upp/Planera/Inställningar), uttryckligt
  pass med start och avslut, känsla + anteckning vid avslut, gymval i startvyn sorterat på
  senast använt, "Senaste gångerna" (tre pass bakåt) i loggvyn, begripligt viktsteg.
  Följ upp och Planera är skal.
- **Sprint 3** ✅ **Planera**: namngivna rutiner, lägg till övningar, omordna med upp/ned, radera.
  "Följ en plan" i startvyn, planläge under passet med växling till hela biblioteket, och
  `session.routine_id` så Följ upp senare kan svara på hur ofta varje plan faktiskt körs.
- **Sprint 3.1** ✅ Engelska namn på alla övningar (matchas + söks), sök i passets lista, i
  planredigeraren och i biblioteket, hoppa över övning i planläget (`session_skip`, passspecifikt
  och överlever appomstart), samt övningsbibliotek i Inställningar med redigering och radering.
- **Polering 1** ✅ Loggvyn omritad enligt `docs/design/gymma-polering-spec.md` (riktning 1d):
  vikten 96 px och tabulär, setpips, cyklande viktstegsetikett i stället för tre chip,
  PB-chip via `bestWeightOnMachine`, samt mikro-feedback (pop, pip-fyllning, toast).
- **Polering 2** ✅ Startvyn omritad (riktning 1b): veckoring (SVG), volym mot förra veckan,
  PB-rad, "Starta {plan}" med gymval + rutiner i ett bottenark. Nya aggregat: `weekSummary`,
  `usualWeekdays`, `recentPbs`, `sessionVolumeKg`, `lastUsedRoutine`, `averageSessionMinutes`.
- **Träningsdagar** ✅ Det härledda veckomålet ersatt av dagar du väljer själv i Planera.
  Startvyn visar nästa träningsdag. Volym och rekord flyttade till Följ upp, som därmed
  slutade vara ett skal.
- **Nästa** — nästa-kort under passet (lätt version av 1c: tydligt kort överst, **utan** den
  ritade banan och den pulserande noden), sedan progression per maskin och träningsfrekvens
  i Följ upp. `react-native-svg` finns redan ⇒ OTA.

### Bortvalt ur designspecen (beslutat 2026-08-03)
`docs/design/gymma-polering-spec.md` beskriver mer än vi bygger. **Celebration-överlägget
(Skärm 4) och nivåer/märken (Skärm 5) byggs inte.** De hjälper dig inte träna, och Thomas bad
uttryckligen om färre funktioner hellre än fler. Veckoraden ur Skärm 5 är däremot byggd — den
ligger i Följ upp.
- **Sprint 3.5** — redigera/radera set i efterhand, passhistorik som egen vy.
- **Sprint 3** — kamera + OCR (`expo-camera` + `expo-text-extractor`, Apples Vision on-device) +
  fuzzy-matchning + disambigueringsvy. **Undersök NFC/QR på Technogym-skylten först** — om
  taggen exponerar ett läsbart maskin-ID ersätter det hela OCR-steget.
- **Sprint 4** — Mistral vision för okända maskiner, fritextinmatning, sammanslagning av
  dubbletter (`merged_into_id` finns redan).
- **Följ upp** — progression per maskin (linje, gymmarkerad), volym per muskelgrupp (stapel),
  träningsfrekvens. `react-native-svg`. Enda återstående skalet.
- **Bild per övning/maskin** — `machine.photo_uri` finns redan i schemat; kräver
  `expo-image-picker` (ny native-modul ⇒ nytt bygge). Buntas lämpligen med kameran i sprint 3.
- **Sprint 6** — JSON-export/import till Filer, felhantering, polering.

## Bygg inte detta
Medvetet bortvalt, skyddar mot scope creep: vilotimer, kroppsvikt/mått/kroppssammansättning
(hör hemma i Stegvis — håll gränsen skarp), **delning och jämförelse med andra**, kondition och
kroppsviktsövningar, inloggning/konto/molnsync, övningsinstruktioner och videor (QR-koden på
maskinen leder redan dit), automatisk viktrekommendation.

### Ändrat beslut 2026-08-03: gamification är INTE längre bortvalt
Kravspecen listade "sociala funktioner/delning/streaks" som en punkt. **Thomas har delat den
punkten:** progression mot sig själv — veckoring, volymjämförelse, PB-chip, nivå och märken —
är nu uttryckligen önskat och beskrivs i `docs/design/gymma-polering-spec.md`.

Det som fortfarande är bortvalt är **det sociala**: att dela pass, se andras data eller jämföra
sig med någon annan. Varje familjemedlem har sin egen lokala loggbok, och det står fast.

Riv alltså inte veckoringen, PB-chippet eller nivåvyn som scope creep — de är beställda.
Ton B gäller för all sådan copy: inga utropstecken, ingen coach, och **positiv återkoppling får
bara påstå saker som är sanna ur datan** (därför visas t.ex. "dina vanliga dagar" inte alls när
underlaget är under fyra pass).

## Kommunikation
Thomas föredrar svenska. Förklara steg-för-steg med "varför", inte bara "vad". Ge
copy/paste-färdiga kommandon när något ska göras i terminalen.
