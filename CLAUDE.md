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
- **EAS Build/Submit/Update** → TestFlight, automatiserat via `.eas/workflows/deploy-ios.yml`

## Filstruktur
```
app/
├── _layout.tsx            DbProvider + laddningsgrind + Stack
├── index.tsx              "Idag" — avbockningslista, gymväxlare, till inställningar
├── log/[exerciseId].tsx   LOGGVYN — appens hjärta
├── exercise/new.tsx       Lägg till övning/maskin → direkt in i loggvyn
└── settings.tsx           Gym (namn, lägg till) + versionsmarkör
components/  ui.tsx (Card/Button/Chip/Stepper/Empty/Loading) · ExerciseRow.tsx
lib/
├── theme.ts    mörka tokens + TAP (minsta tryckyta)
├── format.ts   svenska tal ("2,5 kg"), "50 kg × 10, 10, 9", relativa datum
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
exercise    id, name, type('machine'|'freeweight'), weight_unit('total'|'per_hand'),
            weight_step, primary_muscles(JSON), secondary_muscles(JSON),
            match_key, merged_into_id
machine     id, gym_id, exercise_id, manufacturer, article_code, ocr_text,
            photo_uri, seat_settings, weight_step, last_used_at
session     id, gym_id, started_at, ended_at
set_entry   id, session_id, machine_id?, exercise_id, weight_kg, reps, set_index, logged_at
```

### Kritiskt: övningsidentitet får aldrig splittras
Två vägar leder in i appen (manuell inmatning nu, kamera/OCR och fritext i sprint 3–4). Skapar
de olika poster för samma sak splittras månadstrenden i två halva serier som båda är oanvändbara.

- **Ingen väg får skapa en `exercise` utan att först ha anropat `findExerciseByName()`.**
- `match_key` = `normalizeName(namn)` — gemener, å/ä/ö vikta till a/a/o, blanksteg borttagna.
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

### Pass öppnas implicit
Ingen start-/stoppknapp. `getOrOpenSession()` (anropas **bara** från loggningsvägen, aldrig från
listan) återanvänder ett öppet pass inom `SESSION_WINDOW_HOURS` = 6 h, annars stängs gamla pass
och ett nytt öppnas. Avbockningen på startskärmen är helt enkelt "har den här övningen set i det
pågående passet".

## Konventioner
- **Språk i UI: svenska.** Även kodkommentarer. Tal med decimalkomma (`fmtWeight`).
- **Inga hårdkodade färger i ny UI** — använd `colors` från `lib/theme.ts` eller Tailwind-tokens
  (`bg-card`, `text-ink`, `border-line`, `bg-accent` …). De två hålls i synk manuellt.
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
- **Sprint 2** — passhistorik, redigera/radera set i efterhand.
- **Sprint 3** — kamera + OCR (`expo-camera` + `expo-text-extractor`, Apples Vision on-device) +
  fuzzy-matchning + disambigueringsvy. **Undersök NFC/QR på Technogym-skylten först** — om
  taggen exponerar ett läsbart maskin-ID ersätter det hela OCR-steget.
- **Sprint 4** — Mistral vision för okända maskiner, fritextinmatning, sammanslagning av
  dubbletter (`merged_into_id` finns redan).
- **Sprint 5** — progression per maskin (linje, gymmarkerad), volym per muskelgrupp
  (stapel). `react-native-svg`. Flikmeny införs först här.
- **Sprint 6** — JSON-export/import till Filer, felhantering, polering.

## Bygg inte detta
Medvetet bortvalt, skyddar mot scope creep: vilotimer, kroppsvikt/mått/kroppssammansättning
(hör hemma i Stegvis — håll gränsen skarp), sociala funktioner/delning/streaks, kondition och
kroppsviktsövningar, inloggning/konto/molnsync, övningsinstruktioner och videor (QR-koden på
maskinen leder redan dit), automatisk viktrekommendation.

## Kommunikation
Thomas föredrar svenska. Förklara steg-för-steg med "varför", inte bara "vad". Ge
copy/paste-färdiga kommandon när något ska göras i terminalen.
