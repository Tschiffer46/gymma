# Överlämning: Gymma — polering + gamification

## Översikt
Gymma (Expo/React Native, `Tschiffer46/gymma@main`) ska poleras och få gamification. Fyra
skärmar ritas om och en ny "Följ upp"-yta tillkommer. Inget i datamodellen behöver rivas —
det handlar om hierarki, typografi och två nya aggregerande queries.

Valda riktningar (beslutade av Thomas 2026-08-03):

| Vad | Val | Fil/vy i repot |
|---|---|---|
| Startvyn | **1b** — veckoringen + volym först | `app/(tabs)/index.tsx` → `StartSession` |
| Pågående pass | **1c** — planen som bana med "Nu"-nod | `app/(tabs)/index.tsx` → `ActiveSession` |
| Loggvyn | **1d** — en siffra i fokus | `app/log/[exerciseId].tsx` |
| Nivå & märken | **1f** — behålls | ny vy, förslagsvis `app/(tabs)/insights.tsx` |
| Ton i copyn | **B** — varmare men sober | `app/session/end.tsx`, loggvyn, startvyn |

⚠️ **1f går emot `CLAUDE.md` → "Bygg inte detta: sociala funktioner/delning/streaks".**
Thomas har medvetet ändrat det beslutet. Uppdatera den listan i `CLAUDE.md` i samma PR som
1f, annars kommer nästa utvecklare (eller nästa Claude-session) att riva funktionen igen som
scope creep.

## Om designfilerna
Filerna i det här paketet är **designreferenser skrivna i HTML** — prototyper som visar
avsett utseende och beteende, inte produktionskod att kopiera. Uppgiften är att återskapa
dem i Gymmas befintliga miljö: **Expo SDK 56, React Native 0.85.3, expo-router, NativeWind 4,
Feather från `@expo/vector-icons`, tokens ur `lib/theme.ts` + `tailwind.config.js`**.
Inga nya beroenden krävs (se "Beroenden & bygg").

HTML-prototypernas iPhone-ram (`ios-frame.jsx`) är bara ett skyltfönster — den motsvarar
`SafeAreaView` + systemets statusrad och flikrad i appen och ska inte återskapas.

## Fidelity
**Hi-fi.** Alla värden nedan är exakta och tagna ur prototypen. Färgerna finns redan som
tokens; använd `colors` från `lib/theme.ts` eller Tailwind-klasserna — **inga hårdkodade
färger i ny UI** (befintlig konvention).

---

## Designtokens

Samtliga finns redan i `lib/theme.ts` / `tailwind.config.js`:

| Token | Hex | Används till |
|---|---|---|
| `bg` | `#131316` | sidbakgrund |
| `card` | `#1d1d22` | upphöjd yta, bottenark |
| `cardHi` / `card-hi` | `#26262d` | stepperknappar, inaktiva spår, hårfina avdelare |
| `ink` | `#f2f1ee` | primär text, stora siffror |
| `muted` | `#8f8c86` | sekundär text |
| `line` | `#31313a` | 1 px kanter |
| `accent` | `#f0603c` | primär åtgärd, "nu", nivå |
| `accentSoft` | `#3a2019` | tonad accentyta |
| `ok` | `#4ea87a` | klart, PB, avbockat |

**Två nya deriverade värden** (skriv dem som `rgba` i style, eller lägg till som tokens):
- `rgba(240,96,60,.14)` — tonad accentbricka (märken, veckochip)
- `rgba(78,168,122,.16)` — tonad ok-bricka (PB-chip, celebration-cirkel)
- `#6d6a65` — "dimmad muted" för framtida/inaktiva rader. Lägg gärna till som token
  `mutedDim` i båda filerna hellre än att strö rgba i vyerna.

### Radier
Prototyperna använder **större radier än dagens 15**, och det är en avsiktlig del av
poleringen:
- `20px` — bottenknappar och steppertryckytor i loggvyn
- `18px` — primär åtgärd, märkeskort, "Nu"-kortet
- `16px` — repsknappar
- `26px 26px 0 0` — bottenark (endast 1e, ej valt)
- `9999px` — chip, pips, ringnoder

Lägg `radius` i `lib/theme.ts` som en liten skala i stället för ett enda tal:
`radius = { sm: 12, md: 16, lg: 18, xl: 20, pill: 9999 }`.

### Typografi
Systemfont (`-apple-system` / RN default). Skalan i prototypen:

| Roll | Storlek / vikt / spårning |
|---|---|
| Loggvyns vikt | 96 / 700 / −4 |
| Reps i loggvyn | 42 / 700 / −1.4 |
| Skärmrubrik ("Ett pass kvar…") | 24 / 700 / −0.6 |
| Celebration-rubrik | 34 / 700 / −1 |
| Sifferstat (celebration) | 28 / 700 |
| Ringens siffra | 40 / 700 / −1.5 |
| Primär knapptext | 18 / 600 / −0.2 |
| Radtitel | 16 / 600 |
| Brödtext | 14–15 / 400, radavstånd 1.4 |
| Metatext | 12.5–13 / 400 |
| Versalетikett | 11 / 600, `letterSpacing: 0.16em`, uppercase |

**Alla siffror ska vara tabulära** — `fontVariant: ['tabular-nums']` på `<Text>`. Utan det
hoppar vikten i sidled när man stegar 47,5 → 50 och det är precis den sortens skavank som
gör att appen känns oputsad.

---

## Skärm 1 — Startvyn (1b)

**Syfte:** svara på "hur ligger jag till den här veckan" och sedan starta passet med ett tryck.

**Layout** (`SafeAreaView edges={["top","left","right"]}`, `bg`):
`ScrollView` med `paddingHorizontal: 22`. Bottenåtgärden ligger utanför scrollen, direkt
ovanför flikraden — **ingen `border-t` längre** (den avdelaren tas bort i hela appen; ytan
separeras med luft i stället).

1. **Toppmeta**, `flexDirection: row, justifyContent: space-between`:
   - vänster: `GYMMA`, 13/700, `letterSpacing: 0.18em`, uppercase, `accent`
   - höger: aktivt gym, 13/400, `muted`
2. **Ringblock**, `marginTop: 30`, `row`, `gap: 22`:
   - **Ringen**: 132×132. `react-native-svg` behövs inte om du hellre gör den med två
     `View` + `borderRadius` — men gör den med SVG (`Circle` r=57, `strokeWidth={11}`,
     `stroke={colors.cardHi}` i botten, `stroke={colors.accent}` ovanpå med
     `strokeDasharray={358}` och `strokeDashoffset` = `358 * (1 - andel)`,
     `strokeLinecap="round"`, hela SVG:n roterad −90°). 3 av 4 pass ⇒ offset 90.
   - I centrum absolut positionerat: `3` (40/700/−1.5, `ink`, tabulärt) och `av 4 pass`
     (13/600, `muted`, `marginTop: 3`).
   - **Höger kolumn**: `Ett pass kvar\nden här veckan` (24/700/−0.6, `ink`) +
     `Torsdag och söndag är dina vanliga dagar.` (14/400, `muted`, `marginTop: 8`).
     Texten är genererad: se "Queries" nedan.
3. **Volymblock**, `marginTop: 34`:
   - Rad: versaletikett `VOLYM DEN HÄR VECKAN` + `12,4 t` (15/600, `ink`, tabulärt).
   - Fyllnadsstav: höjd 8, `borderRadius: 9999`, spår `cardHi`, fyllning `accent`,
     bredd = andel av förra veckan (max 100 %). **Animera bredden när vyn fokuseras**
     (Reanimated `withTiming`, 550 ms, `Easing.out(Easing.cubic)`) — "progress som fyller".
   - Undertext `78 % av förra veckans 15,9 t`, 12.5/400, `#6d6a65`, `marginTop: 8`.
4. **PB-raden**, `marginTop: 20`, `paddingTop: 18`, `borderTopWidth: 1`, `borderTopColor: cardHi`:
   38×38 rund bricka `rgba(78,168,122,.16)` med Feather `trending-up` 19 i `ok`, sedan
   `Bröstpress 52,5 kg` (15.5/600, `ink`) + `Nytt bästa på den maskinen · +2,5 kg`
   (13/400, `muted`). Raden visas bara om det finns ett PB de senaste 7 dagarna.
5. **Primär åtgärd** (utanför scrollen), `paddingHorizontal: 22`:
   höjd 64, `borderRadius: 18`, `bg accent`, `row`, `gap: 14`, `paddingHorizontal: 20`:
   Feather `play` 19 vit ifylld, sedan `Starta Överkropp` (17/600, vit) och
   `6 övningar · ca 45 min` (12.5/400, `rgba(255,255,255,.72)`, `marginTop: 3`).
   Planen som föreslås = senast körda rutinen. Finns ingen rutin: `Starta pass` + `Kör på egen hand`.
6. **Sekundärrad**: `Byt plan · Kör på egen hand`, 15/600, `muted`, centrerad. Öppnar en
   `ActionSheet`/enkel lista med gym + rutiner — gymvalet och rutinlistan från dagens vy
   flyttar dit. Behåll `listGymsByRecentUse` som sortering och förvalt gym.

**Viktigt:** gymvalet försvinner inte, det flyttar ner. Designprincip 5 (tummen når allt)
gäller fortfarande — allt tryckbart ligger i nedre tredjedelen utom gymnamnet i toppmetan,
som bara är information.

## Skärm 2 — Pågående pass (1c)

**Syfte:** veta vad som är nästa övning utan att läsa en lista.

1. **Topp**, `padding: 0 22 14`:
   - `Överkropp` (19/700/−0.3) + `47 min · 9 set · 3,1 t` (13/400, `muted`, tabulärt).
     Volymen i passet är ny — samma formel som veckovolymen, filtrerad på `session_id`.
   - `Avsluta`-chip: höjd 38, `borderRadius: 9999`, `bg cardHi`, text 13.5/600 `ink`.
     **Inte längre accent-inramad** — att avsluta är inte den primära åtgärden.
   - **Framdriftsstav** `marginTop: 16`: höjd 6, spår `cardHi`, fyllning `ok`, animerad bredd.
     Under den: `4 AV 6 KLARA`, 11.5/600, uppercase, `letterSpacing: 0.1em`, `muted`.
     Överhoppade räknas som klara (samma regel som dagens `planDone`).
2. **Banan** — `FlatList` med `paddingHorizontal: 22`. En absolut positionerad linje
   (`left: 44, top: 22, bottom: 0, width: 2, backgroundColor: cardHi`) ligger bakom noderna.
   Fyra radtillstånd:
   - **Klar:** 26×26 rund nod `ok` med Feather `check` 15 i `bg`, strokeWidth 3. Titel
     16/600 i `#6d6a65`, undertext `52,5 kg × 10, 10, 9` 13.5/400 `#6d6a65`. Är det ett PB
     läggs ` · nytt bästa` till i `ok`.
   - **Överhoppad:** nod `cardHi` med Feather `minus` 14 i `#6d6a65`; titel genomstruken;
     undertext `Överhoppad · maskinen var upptagen` (skriv `Överhoppad` om ingen anledning finns).
   - **Nu:** nod 26×26 fylld `accent` med en pulserande glow (Reanimated: `boxShadow` går
     inte att animera i RN — använd i stället en absolut positionerad `View` bakom noden med
     `borderRadius: 9999` som skalas 1 → 1.9 och tonas 0.45 → 0 i 2,4 s loop).
     Kortet: `bg card`, `borderWidth: 1`, `borderColor: accentSoft`, `borderRadius: 18`,
     `padding: 16 18`, `marginTop: -6`. Innehåll: `NU` (11/600, uppercase, 0.16em, `accent`),
     övningsnamn 24/700/−0.6, `Förra gången 30 kg × 10, 9, 8` 14/400 `muted`.
   - **Kommande:** nod 26×26 `borderWidth: 2`, `borderColor: line`, `bg bg`. Titel 16/600 `ink`,
     undertext senaste seten 13.5/400 `muted`.
   - Rad-avstånd: 22 mellan noder, 24 efter "Nu"-kortet.
3. **Bottenåtgärd:** höjd 64, `borderRadius: 18`, `accent`, text `Logga Axelpress` (18/600, vit)
   + Feather `chevron-right` 19 vit. Under den: `Alla övningar`, 15/600, `muted` — samma
   flyktväg som dagens "Alla övningar"-chip (designprincip 4, planen är aldrig en grind).
   Sökfältet lever kvar i "Alla övningar"-läget, inte i banan.

**Behåll:** `session_skip`, ordningen från `routine_item.position`, raden
"Finns inte på det här gymmet" (visa den som undertext i `danger` på en kommande nod).

## Skärm 3 — Loggvyn (1d)

**Syfte:** ett tryck per set, utan tangentbord, läsbart på armlängds avstånd.

1. **Topp**, `padding: 0 18 0`, `row`, `gap: 10`: Feather `chevron-left` 24 `muted`,
   sedan namn 17/700/−0.2 + `Technogym · säte 4` 12.5/400 `muted`, och längst till höger
   **setpips**: 9×9 runda punkter, `gap: 5` — loggade i `ok`, återstående i `line`.
   Antalet pips = antal set förra passet (fallback 3).
2. **Mitten** (`flex: 1`, centrerad):
   - `SET 3 AV 3` — 11/600, uppercase, 0.16em, `muted`.
   - **Vikten**: 96/700/−4, `ink`, tabulär, med enheten `kg` (22/600, `muted`) på baslinjen.
     Är övningen `per_hand` står `kg/hantel` — enheten får aldrig vara underförstådd.
   - **Repsen**: 42/700/−1.4 + `reps` 16/600 `muted`, `marginTop: 20`.
   - **Hjälpraden**: `Förra passet: 50 kg × 10`, 13.5/400, `muted`, `marginTop: 26`.
     Faller tillbaka på `Extraset — förra passet stannade på tre` när man går utöver.
   - **PB-chip** (villkorat): visas när vald vikt > bästa loggade vikten på den `machine_id`.
     `borderRadius: 9999`, `rgba(78,168,122,.16)`, `padding: 7 14`, Feather `trending-up` 14
     i `ok` + `Tyngre än någonsin på den här maskinen` 13/600 `ok`. Monteras med
     `riseIn`: translateY 18 → 0, opacity 0 → 1, 320 ms, ease-out.
3. **Tumzonen**, `padding: 0 18 6`, `gap: 12`:
   - **Viktrad:** två tryckytor `flex: 1`, höjd **74**, `borderRadius: 20`, `bg cardHi`,
     Feather `minus`/`plus` 30 i `ink`. Mellan dem en 76 px etikett `±2,5 kg` (13/600, `muted`)
     — **tryck på den cyklar steget 2,5 → 5 → 10**, vilket ersätter dagens tre chip och
     sparar en hel rad. Skriv värdet till `setWeightStep` som i dag.
   - **Repsrad:** samma mönster, höjd 56, `borderRadius: 16`, `borderWidth: 1`
     `borderColor: line`, ikoner 22 i `muted`, mittetikett `reps`.
   - **Primär:** höjd 68, `borderRadius: 20`, `accent`, Feather `check` 21 vit strokeWidth 2.8,
     text `Logga set 3` 19/600 vit.
   - **Sekundär:** `Klar med övningen` (blir `Nästa övning` när alla set är loggade),
     15/600, `muted`, centrerad. Går tillbaka till banan.
   - Båda tryckytorna är över 64 pt (`TAP`) — kravet står kvar.
4. **Kvitto på loggat set** ("mikro-feedback", ett av de två celebrationsögonblicken):
   - `Haptics.notificationAsync(Success)` — finns redan.
   - Vikten gör en `pop`: scale 0.82 → 1.06 → 1, opacity 0.4 → 1, 260 ms.
   - En pip fylls från `line` till `ok` (färgövergång 200 ms).
   - Toast 180 px från underkanten: `bg card`, `borderWidth: 1` `line`,
     `borderRadius: 9999`, `padding: 11 18`, Feather `check` 16 `ok` +
     `Set 3 loggat · 52,5 kg × 10` 14.5/600 `ink`, tabulärt. In med `riseIn` 280 ms,
     ut efter **1700 ms**.
   - Behåll `deleteSet`-ångran: svep vänster på toasten, eller x-knappen i setlistan.
5. **Setlistan** flyttar till en fällbar rad ovanför tumzonen (eller ligger kvar i toppen som
   pips + en rad text). Den får inte konkurrera med vikten om uppmärksamheten.

**Förifyllningen ändras inte.** `prefillFor()` gäller precis som i dag: förra passets
motsvarande set-index först.

## Skärm 4 — Celebration: planen klar

Andra celebrationsögonblicket. Visas som fullskärmsöverlägg **när sista övningen i planen
bockas av** (alla `routine_item` antingen har set i passet eller är överhoppade) — inte vid
"Avsluta". Därefter leder den in i dagens `session/end`-flöde.

- `bg bg`, centrerat innehåll, `paddingHorizontal: 34`.
- **Två utgående ringar** bakom rubriken: 200×200, `borderWidth: 2`, en `accent` och en `ok`
  med 220 ms fördröjning; scale 0.3 → 1.9, opacity 0.9 → 0, 1,5 s ease-out, körs en gång.
- 86×86 rund bricka `rgba(78,168,122,.16)` med Feather `check` 42 i `ok`, strokeWidth 2.6.
- Rubrik `Överkropp klar` 34/700/−1, `marginTop: 26`.
- Brödtext (ton B): `Sex av sex, och tyngre än förra gången på två maskiner.`
  15/400, radavstånd 1.45, `muted`. Utan PB: `Sex av sex. Hela planen avklarad.`
- **Statrad** `marginTop: 34`, `gap: 26`: tre kolumner `18 / 4,2 t / 52` (28/700, tabulärt)
  med versaletiketter `SET / VOLYM / MIN` (11/600, 0.14em, `muted`, `marginTop: 7`).
  **Siffrorna räknar upp från 0** över 700 ms (Reanimated `withTiming` + `useDerivedValue`).
- **Veckochip:** `rgba(240,96,60,.14)`, `borderRadius: 9999`, `padding: 9 16`, Feather `zap`
  15 `accent` + `4 av 4 pass den här veckan` 13.5/600 `accent`.
- Botten: primär `Avsluta passet` (höjd 64, radius 18, `accent`, 18/600 vit) och sekundär
  `Fortsätt träna` (15/600, `muted`).
- Hela innehållet in med `riseIn` 400 ms. Ett svep ned eller "Fortsätt träna" stänger.
- `Haptics.notificationAsync(Success)` en gång när överlägget monteras.

## Skärm 5 — Nivå & märken (1f)

Ny yta. Lägg den i **`app/(tabs)/insights.tsx`** ovanför de kommande graferna, så "Följ upp"
slutar vara ett skal.

1. **Nivårad:** 52×52 bricka `borderRadius: 16`, `bg accentSoft`, siffran `7` 21/700 `accent`.
   Höger: `Nivå 7 · Stadig` 19/700; fyllnadsstav höjd 7 (spår `cardHi`, fyllning `accent`);
   `3 pass till nivå 8` 12/400 `muted`.
   **Nivåformel (förslag):** 1 nivå per 12 avslutade pass med minst ett set. Namnen är
   svenska och lågmälda — `Igång, Stadig, Rutinerad, Envis, Tung` — inga titlar som skryter.
2. **Veckoraden:** sju kolumner, `gap: 7`. Varje dag: `height: 46`, `borderRadius: 12`.
   Tränad dag = `ok` med Feather `check` 17 i `bg`; i dag = `borderWidth: 2` `accent` +
   `bg accentSoft`; övriga `card`. Under varje ruta veckodagsförkortning 11/600
   (`muted` för tränade, `#6d6a65` för tomma, `accent` för i dag).
3. **Märken:** tre kort i rad, `gap: 12`, `borderRadius: 18`, `bg card`, `padding: 16 14`,
   centrerat. 44×44 rund ikonbricka (tonad `accent` eller `ok`; låst märke = `cardHi` med
   ikon i `#6d6a65` och kortet på `opacity: 0.55`), titel 13.5/600 `ink` `marginTop: 11`,
   status 11.5/400 (`muted`, eller `ok` när nyss klarat).
   Startuppsättning: `100 pass` (94 klara), `10 t på ett pass` (Klart i går),
   `PB på 5 maskiner` (3 av 5). Alla tre går att räkna ur befintlig data — inga nya tabeller.
4. Bottenåtgärd `Starta pass` (höjd 64, radius 18, `accent`) — genväg tillbaka till Gymma.

**Ingen delning i första versionen** trots att Thomas öppnade för det. Skäl: `share`-vägen
kräver bild-rendering och en beslutad grafisk profil; ta det som eget spår när 1f varit i
TestFlight ett par veckor.

---

## Ton i copyn — B

Varmare, men siffran är belöningen. Inga utropstecken, inga emoji, ingen coach.

| Plats | I dag | Ton B |
|---|---|---|
| Planen klar | *(finns inte)* | `Överkropp klar` / `Sex av sex, och tyngre än förra gången på två maskiner.` |
| Set loggat | *(bara haptik)* | `Set 3 loggat · 52,5 kg × 10` |
| PB | *(finns inte)* | `Tyngre än någonsin på den här maskinen` |
| Tomt pass | `Du loggade inga set. Passet sparas inte — det hade bara blivit brus i historiken.` | `Inga set loggade, så passet sparas inte. Ingen skada skedd.` |
| Startvyn | `Starta ett pass för att börja logga.` | `Ett pass kvar den här veckan` (data i stället för uppmaning) |
| Första gången | `Första gången — sätt en startvikt.` | behålls oförändrad |

Regler: svenska, decimalkomma via `fmtWeight`, aldrig "du borde", aldrig utropstecken.
Positiv återkoppling får bara påstå saker som är sanna ur datan.

---

## Interaktion & rörelse

Allt nedan är byggbart med **Reanimated 4.3.1 som redan finns**. Rörelsen ska vara
*tydlig men snabb* — inget som fördröjer nästa set.

| Vad | Egenskap | Tid / kurva |
|---|---|---|
| Loggat set | scale 0.82 → 1.06 → 1 + opacity | 260 ms, ease-out |
| Toast in | translateY 18 → 0, opacity | 280 ms, ease-out; ut efter 1700 ms |
| Pip fylls | färg `line` → `ok` | 200 ms |
| Fyllnadsstavar | width | 550 ms, `Easing.out(Easing.cubic)`, startar vid fokus |
| Uppräknande siffror | 0 → värdet | 700 ms, ease-out |
| "Nu"-nodens puls | scale 1 → 1.9, opacity .45 → 0 | 2,4 s loop |
| Celebration-ringar | scale 0.3 → 1.9, opacity | 1,5 s, den andra +220 ms, en gång |
| Celebration in | translateY + opacity | 400 ms, ease-out |

Haptik (`expo-haptics`, redan installerat): `selectionAsync` på varje +/−,
`notificationAsync(Success)` på loggat set, planen klar och avslutat pass.

## State

Inga nya globala tillstånd. Per skärm:

- **Startvyn:** `weekSessions`, `weekTarget`, `weekVolumeKg`, `prevWeekVolumeKg`,
  `recentPb`, `suggestedRoutine`. Laddas i `useFocusEffect` som i dag.
- **Pågående pass:** dagens `items` / `skipped` / `sets` plus `sessionVolumeKg`,
  och `currentExerciseId` = första ej klara, ej överhoppade raden i planordningen.
- **Loggvyn:** dagens `weight` / `reps` / `step` / `sets` plus `bestWeightOnMachine`
  (för PB-chippet), `flash` (toast-text, nollas av en timer — rensa i `useEffect`-städningen)
  och `pips`.
- **Celebration:** `planComplete` beräknas ur `items` + `skipped`; `celebrationShownFor`
  (session-id) i state så överlägget inte kommer tillbaka när man går in och ut ur en övning.
- **Nivå & märken:** `level`, `sessionsToNext`, `weekDays[7]`, `badges[]`.

## Queries som behöver skrivas

Allt i `lib/db/queries.ts`, **inga expo-/react-importer** (det är vad som gör
`npm run test:db` möjligt). Lägg till fall i `scripts/verify-db.cjs` för de tre första.

1. `weekSummary(store, { gymId?: string | null, weekStartIso })`
   → `{ sessions, volumeKg, prevVolumeKg }`.
   Volym = `SUM(weight_kg * reps * CASE WHEN exercise.weight_unit = 'per_hand' THEN 2 ELSE 1 END)`
   över `set_entry` joinat mot `exercise`, filtrerat på `session.ended_at` inom veckan och
   `deleted_at IS NULL`. **Volym aggregeras över alla gym** (viktskalor spelar ingen roll
   för summan) — till skillnad från progression, se punkt 2.
2. `bestWeightOnMachine(store, { exerciseId, machineId })` → `number | null`.
   `MAX(weight_kg)` per `machine_id`. **Måste vara per maskin, inte per övning** —
   50 kg på en bröstpress är inte 50 kg på en annan. Saknas maskin (frivikt) matchar man
   på `exercise_id` med `machine_id IS NULL`.
3. `sessionVolumeKg(store, sessionId)` → samma formel filtrerad på ett pass.
4. `recentPbs(store, { sinceIso })` → `[{ exerciseId, machineId, weightKg, deltaKg }]`,
   för PB-raden på startvyn och `· nytt bästa` i banan.
5. `sessionsPerWeekday(store, { weekStartIso })` → `boolean[7]`, för 1f.
6. `usualWeekdays(store)` → de två vanligaste veckodagarna de senaste 8 veckorna, för
   raden "Torsdag och söndag är dina vanliga dagar". Faller tillbaka på att raden inte visas
   när underlaget är tunt (< 4 pass).

**Veckomålet** (`weekTarget`, 4 i prototypen) finns inte i datamodellen. Två vägar:
- **Utan migration:** härled det som medianen av antal pass/vecka de senaste 6 veckorna,
  golv 2, tak 6. Fungerar direkt, kräver inget av användaren.
- **Med migration:** ny tabell `goal (id, kind, value, created_at, updated_at, deleted_at)`
  och ett val i Inställningar. Lägg den **sist** i `MIGRATIONS` — befintliga migrationer får
  aldrig ändras i efterhand.

Börja utan migration. Sätt in `goal` först om det visar sig att härledningen känns fel.

## Beroenden & bygg

- **`react-native-svg`** behövs för ringen i 1b. Det är en **ny native-modul ⇒ nytt
  EAS-bygge**, inte en OTA. Bunta den med alla andra konfigändringar i **en** commit
  (fingerprintet gör varje konfigändring till ett eget bygge annars).
- Allt annat — 1c, 1d, celebrationen, 1f, copyn — är ren JS och går ut som **OTA**.
- Vill du undvika bygget helt: rita ringen med två `View` (rund, `borderWidth: 11`,
  roterad halva som mask). Ful lösning; rekommenderas inte, men den är gratis.
- `nativewind@4.1.23` + `react-native-css-interop@0.1.22` måste förbli exakt pinnade.
- Före commit: `npm run verify && npx expo export --platform ios`, och **titta på appen i
  simulatorn** — de tre gröna testerna bevisar inte att stylingen lever (det har redan
  kostat ett trasigt TestFlight-bygge).

## Föreslagen ordning

1. **Loggvyn 1d** + mikro-feedback. Störst upplevd effekt, ren OTA, ingen ny query utom
   `bestWeightOnMachine`.
2. **Pågående pass 1c** + `sessionVolumeKg`. Också OTA.
3. **Celebration** när planen är klar. OTA.
4. **Startvyn 1b** + `weekSummary`, `recentPbs`, `usualWeekdays` + `react-native-svg`.
   Ett bygge — bunta med eventuella andra konfigändringar.
5. **1f i Följ upp** + `sessionsPerWeekday`, märkesberäkningar, och **uppdatera
   `CLAUDE.md` → "Bygg inte detta"** i samma PR.
6. Ton B skrivs in löpande i varje steg, inte som en egen omgång.

## Tillgänglighet

- `accessibilityLabel` på alla tryckytor, som i dag (`Öka vikt`, `Minska reps`, …).
- Setpipsen är dekor — sätt `accessibilityElementsHidden` och lägg informationen i
  övningens label i stället (`Set 2 av 3 loggade`).
- Celebrationen måste gå att stänga utan att träffa ett svep: knappen `Fortsätt träna` räcker.
- Kontrast: `muted` (#8f8c86) mot `bg` (#131316) är ~5,4:1 — ok. `#6d6a65` mot `bg` är
  ~3,4:1 och får därför **bara** användas på text som redan är redundant (klara rader,
  inaktiva veckodagar), aldrig på enda källan till en uppgift.

## Assets

- **Ikoner:** Feather, via `@expo/vector-icons` som redan finns. Använda namn:
  `activity, trending-up, clipboard, settings, check, plus, minus, x, search,
  chevron-left, chevron-right, play, skip-forward, rotate-ccw, award, zap`.
  (HTML-prototypen har samma ikoner inlinade som SVG-paths hämtade från
  `feathericons/feather@main` — samma set, så formerna matchar exakt.)
- **Inga bilder eller nya fonter.** Systemfonten är avsiktlig.

## Filer (i repot under `docs/design/`)

| Fil | Vad |
|---|---|
| `docs/design/Gymma – nuläget.dc.html` | Pixeltrogen återskapning av dagens tre skärmar. Referens för vad som ändras. |
| `docs/design/Gymma – förslag.dc.html` | De sex riktningarna. **1b, 1c, 1d, 1f** är de valda; 1d är körbar (tryck +/− och logga set tills celebrationen kommer). 1a och 1e är förkastade men ligger kvar som jämförelse. |
| `docs/design/ios-frame.jsx` | Bara iPhone-ramen runt prototyperna. Ska inte återskapas i appen. |
| `github.md` (repo-roten) | Kopplingen till repot + skärmkarta över vilka källfiler varje skärm bygger på. |

Öppna HTML-filerna i en webbläsare. Sifferbadgen (`1b`, `1c` …) i övre vänstra hörnet av
varje skärm är referensen som används i texten ovan.
