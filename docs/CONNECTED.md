# Gymma connected — utvärdering och etapplan

**Status:** beslutsunderlag, inget är byggt. Skrivet 2026-08-10 efter testarnas feedback.
**Beslut som styr dokumentet:** bygg för familjen nu, men blockera inte en kommersiell version.

---

## Frågan

Testarna vill kunna **dela utveckling och framgångar**, **utbyta träningspass** och **boka ett
pass tillsammans**. Allt tre kräver att data lämnar telefonen, vilket krockar med kravspecens
bärande princip: *ingen backend, ingen inloggning, ingen sync — var och en har sin egen loggbok.*

Det här dokumentet svarar på: vad kostar det, går det att göra utan att förstöra appen, och i
vilken ordning?

---

## Tre insikter som bär hela rekommendationen

### 1. Ingen av funktionerna kräver att loggboken lämnar telefonen

Det här är det viktigaste i dokumentet, och det var inte självklart förrän man bryter ned det:

| Önskemål | Vad som faktiskt behöver delas |
|---|---|
| Dela utveckling/framgångar | En **härledd händelse**: "Thomas slog ett rekord i Bänkpress" eller "3 pass den här veckan". Inte seten. |
| Ge beröm | En reaktion på en sådan händelse. |
| Utbyta träningspass | En **rutin** = ett namn + en lista övningsnamn i ordning. Inga vikter, ingen historik. |
| Boka pass ihop | Ett litet schemaobjekt: dag, tid, plats som fritext, deltagare, status. |

Ingen av raderna behöver `set_entry`. **Loggboken kan förbli lokal.** Det man delar är sådant
man aktivt publicerar.

Därför behöver principen inte rivas, bara skärpas:

> **Din loggbok är din och ligger lokalt. Det du väljer att publicera till din grupp är ett
> tillval.**

Det är en verklig skärpning, inte en omskrivning: den säger vad som *aldrig* lämnar telefonen.

### 2. Gym- och maskinidentifiering behövs inte på servern

Din misstanke i frågan stämmer — det går att undvika, och det är värt mycket.

`machine_id` finns för att **viktskalor skiljer mellan maskiner** (50 kg på en bröstpress är inte
50 kg på en annan). Det är en lokal, fysisk sanning om *ditt* gym. Ett globalt maskinregister
skulle kräva att alla identifierar exakt rätt maskin på exakt rätt gym — stor friktion, och
värdelöst för de fyra raderna ovan.

**Servern ser bara textetiketter.** En delad rutin överförs som övningsnamn, och mottagarens
`findExerciseByName()` mappar den mot det egna biblioteket via `match_key` — inklusive engelska
namn. Den designen (byggd för kamera/OCR) betalar sig här utan att en rad ändras.

En delad framgång är text: *"Bänkpress 82,5 kg"*. Att jämföra kilon mellan två personers olika
maskiner vore ändå meningslöst.

### 3. Backenden finns redan till stor del

reza (`vadskavi.nu`) har i drift, testat, med riktiga användare:

- **`User`** med `plan` (`free`/`paid`) — premium-gaten finns redan
- **`Account`** + Sign in with Apple för native, inklusive token-revokering
- **`Family` + `Membership` med `inviteCode`** — exakt gruppmönstret vi behöver
- **Bearer-auth för native** (`requireUser`, statslös HS256, ingen ny tabell)
- **Kontoradering som anonymiserar** — App Store-krav, redan löst
- **Purchasely-webhook** → `User.plan`, för den dag det ska kosta pengar
- Deploy, TLS, backup på Hetzner

laga-app har klientmönstren: secure-store, `apple-authentication`, och — dyrast av allt —
**lärdomarna om EAS-capabilities och channel↔branch-fällan.**

Och gymmas eget datalager byggdes för det här: UUID-nycklar, soft delete och `updated_at` på
varje rad. Det står redan i `CLAUDE.md` att det gör en framtida backend till *en påbyggnad i
stället för en migrering*. Den checken löses nu in.

---

## Scenarier

### Scenario 0 — dela manuellt, ingen backend

React Natives inbyggda `Share` skickar en rutin eller ett PB som text; klistra-in-import läser
tillbaka den. Noll konton, noll server, OTA-bart.

**Ger:** utbyta pass, visa upp framgång. **Ger inte:** beröm-loopen, bokning, flöde.
**Kostnad:** ett par dagar. **Risk:** ingen.

### Scenario 1 — connected som tillval ⭐ REKOMMENDERAS

Appen förblir **lokal-först och fullt användbar utan konto**. Ett valfritt konto (Sign in with
Apple) låser upp en **träningsgrupp** med invitkod, precis som gemenskaperna i laga.

Delning är **publicering**: du väljer att lägga upp ett rekord, en veckosummering eller en
rutin. Inget synkas automatiskt, ingen ser din loggbok.

**Ger:** allt som efterfrågats. **Kostnad:** ett EAS-bygge + backend-arbete i reza.
**Risk:** hanterbar, se riskavsnittet.

### Scenario 2 — full molnsync

Hela loggboken i backend, telefonen blir en cache.

**Avråds nu.** Det kräver en synkmotor med konfliktlösning (två telefoner, offline, samma pass),
gör varje gymkällare-bugg till en supportfråga, och flyttar hela din träningshistorik till en
server — utan att lösa något av det som efterfrågades. Datalagret håller dörren öppen om det
någon gång blir aktuellt; det behöver inte beslutas nu.

### Avfört: CloudKit / iCloud-delning

Låter lockande (ingen server, gratis, Apple sköter identitet) men: stor **otestad native-yta i
Expo** — exakt den felklass som redan kostat två produktionsincidenter i det här projektet —
Apple-inlåsning som stänger dörren för Android om det blir kommersiellt, och dålig passform för
bokning och notiser.

---

## Rekommendation: Scenario 1, i reza

**Varför i reza och inte en egen tjänst:** auth, kontoradering, admin, deploy, TLS och backup
finns och är bevisade i produktion av laga-app. Att bygga om det för en handfull användare är
slöseri.

**Hur isoleringen görs — viktigt för det kommersiella spåret:** egna tabeller med `Gym*`-prefix
och egna routes under `/api/gym/*`, men **delad `User`**. Det ger samma inloggning i familjens
båda appar och låter premium gatas på befintliga `User.plan` utan ny mekanik.

Blir gymma en riktig produkt är `Gym*`-tabellerna plus `/api/gym/*` **mekaniskt lyftbara** till
en egen tjänst — id:na är redan globala (cuid/uuid) och inget joinar mot recept-domänen.

**Ärlig nackdel:** gymma-connected knyts till vadskavi.nu:s drift och till reza-repots
deploytakt. Går den servern ner slutar delningen fungera — men appen fortsätter fungera, vilket
är hela poängen med lokal-först.

---

## Etapplan

Varje steg ger värde i sig och kan stoppas efter. **Steg 1 är medvetet först** — det mäter om
delning faktiskt används innan backendkostnaden tas.

| Steg | Vad | Kostnad |
|---|---|---|
| **1** | **Dela utan konto.** Rutin och PB som text via iOS delningsblad, klistra-in-import av delad rutin, JSON-export/import till Filer (tidigarelagd ur Sprint 6 — ger också riktig backup). | OTA |
| **2** | **Konto + grupp.** `expo-apple-authentication` + `expo-secure-store`. reza: `Gym*`-tabeller, `/api/gym/*`, egen login-endpoint. Appen fungerar oförändrat utan konto. | **1 bygge** |
| **3** | **Flöde + beröm.** Publicera rekord/veckosummering, reaktioner, oläst-bricka (samma mönster som laga:s snack-unread). | OTA |
| **4** | **Utbyta pass i gruppen** — samma payload som steg 1 producerar. | OTA |
| **5** | **Boka pass ihop.** `GymBooking`, bjud in/acceptera i flödet. | OTA |
| **6** | Push (`expo-notifications`), premium via Purchasely när det ska utanför familjen. | **1 bygge** |

**Buntningsregel:** steg 2 och 6 kräver nya native-moduler ⇒ nytt fingerprint ⇒ EAS-bygge.
Samla *alla* konfigändringar i de commitarna. Se fingerprint-avsnittet i `CLAUDE.md`.

---

## Datamodell (skiss, reza/Prisma)

Delad `User`. Allt annat är eget och prefixat.

```prisma
model GymGroup {                      // "träningsgrupp", motsvarar Family i laga
  id, name, inviteCode @unique, status, createdAt, createdById
}

model GymMembership {
  id, userId, groupId, role, joinedAt
  @@unique([userId, groupId])
}

model GymEvent {                      // det man PUBLICERAR — aldrig automatiskt
  id, groupId, userId, createdAt
  kind        // 'pb' | 'session' | 'week' | 'note'
  title       // "Bänkpress 82,5 kg" — färdig text, ingen tolkning på servern
  body?
  occurredAt  // lokal tidpunkt från telefonen
}

model GymReaction {                   // "bra jobbat"
  id, eventId, userId, kind
  @@unique([eventId, userId, kind])
}

model GymRoutineShare {               // ett delat pass
  id, groupId, userId, name, createdAt
  items  Json   // [{ name, nameEn? }] — NAMN, inga id:n och inga vikter
}

model GymBooking {
  id, groupId, createdById, startsAt, place?, note?, status
  participants GymBookingParticipant[]   // userId + status
}
```

**Tre regler att inte tumma på:**

1. **Inga `set_entry` på servern.** Om en framtida funktion vill ha det är det ett nytt beslut,
   inte en detalj.
2. **`GymRoutineShare.items` bär namn, aldrig lokala id:n.** Mottagarens `findExerciseByName()`
   gör mappningen mot sitt eget bibliotek.
3. **`GymEvent.title` är färdig text från telefonen.** Servern tolkar aldrig träningsdata — det
   är det som håller gym/maskin-frågan borta från backenden.

---

## Risker

| Risk | Hantering |
|---|---|
| **Apple-capability-fällan** (kostade laga ett trasigt bygge) | Sign in with Apple kräver att capability:n slås på på App ID:t och att profilen regenereras. **Första bygget interaktivt** (`eas build -p ios --profile production`), redigera i Apple-portalen **på desktop**. Se `laga-app/CLAUDE.md`. |
| **Fel `aud` i token-verifieringen** | gymmas bundle-id är `nu.vadskavi.gymma`, inte laga:s. Egen login-endpoint som återanvänder verifierings-lib:et — kopiera inte laga:s förväntade `aud`. |
| **Otestade native-moduler** | Två incidenter hittills (NativeWind, ReanimatedSwipeable). `expo-apple-authentication` och `expo-secure-store` är dock bevisade i laga i produktion. **Kör ändå i simulatorn på Macen före TestFlight.** |
| **Servern ligger nere** | Appen måste fungera fullt ut utan nät — designprincip 3. Connected-delarna felar tyst och visar senast kända data. Detta är ett **krav**, inte en ambition. |
| **Integritet** | Publicering är alltid ett aktivt val. Ingen automatisk delning, någonsin. Behövs för App Store-granskningen om det blir kommersiellt. |
| **Barn/minderåriga i gruppen** | Om appen någon gång distribueras utanför familjen: åldersgräns och föräldrasamtycke är ett produktbeslut som måste tas *före* lansering. |

---

## Vad som INTE ändras

- Appen fungerar **fullt ut utan konto**. Det är inte en gratisnivå — det är standardläget.
- Loggning, förifyllning, planering och uppföljning är **oförändrat lokala**.
- Designprinciperna 1, 2, 4 och 5 gäller precis som förut.
- Princip 3 ("fungerar helt offline") skärps snarare än luckras upp: connected-delarna **får
  aldrig** stå i vägen för att logga ett set i en gymkällare utan täckning.
