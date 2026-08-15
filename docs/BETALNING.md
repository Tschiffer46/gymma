# Gymma — betalmodell

**Status:** beslutad design, inget är byggt. Skrivet 2026-08-15.
**Pris:** 39 kr/månad, 299 kr/år. **Leverantör:** RevenueCat.
**Portalstegen:** se `docs/APP-STORE-CHECKLIST.md`. Det här dokumentet är *varför* och *hur*.

---

## Det avgörande: gymma behöver ingen backend för att ta betalt

Det var inte självklart, eftersom appen medvetet saknar konton. Men RevenueCat fungerar
**utan inloggning**:

1. SDK:n skapar ett **anonymt app-user-id** (`$RCAnonymousID:…`) och sparar det på enheten.
2. Själva köpet går via **StoreKit** och knyts till användarens **Apple-id**, inte till oss.
3. RevenueCat validerar kvittot på sin sida och svarar med vilka *entitlements* som gäller.
4. **"Återställ köp"** hämtar tillbaka rättigheten på ny telefon eller efter ominstallation,
   eftersom Apple-id:t bär köpet.

**Ingen server, inga konton, ingen `User`-tabell.** Betalningen är därmed helt frikopplad
från Connected (`docs/CONNECTED.md`) — de två kan byggas i vilken ordning som helst, och
lanseringen behöver inte vänta på backend.

`react-native-purchases@10.7.1` kräver `react-native >= 0.73` ⇒ passar RN 0.85.3.
RevenueCats gratisnivå täcker den här storleken med god marginal.

> **Varför inte StoreKit rakt av?** Utan server måste man då validera kvitton på enheten och
> själv hålla reda på förnyelser, betalningsproblem, respitperioder och återbetalningar. Det
> är precis den sortens tyst trasiga tillstånd som är svårast att felsöka på någon annans
> telefon. RevenueCat gör det åt oss gratis i den här volymen.

> **Varför inte Purchasely?** `laga-app` bytte spår. Att köra samma leverantör i båda
> apparna ger en konsol, ett kontrakt och en uppsättning lärdomar i stället för två.

---

## Provperioden är appstyrd, inte Apples

Två saker heter "provperiod" och de känns helt olika:

| | Apples introduktionserbjudande | **Appstyrd (vald)** |
|---|---|---|
| Kräver betalkort direkt | Ja | Nej |
| App Store-dialog innan man får prova | Ja | Nej |
| Går att nollställa med ominstallation | Nej | Ja |
| Kostar oss | Inget | Inget |

"Prova en månad" i vardagsspråk betyder *prova utan att binda sig*. Därför:
**30 dagar från första start, inget kort, ingen dialog.** Först därefter visas paywallen.

Mekaniken är nästan gratis här — första starttidpunkten sparas i `app_setting`, samma
generella nyckel/värde-tabell som redan finns. Ingen ny tabell, ingen migration.

Att någon kan installera om för att nollställa är en läcka jag medvetet accepterar i den
här storleken; att bygga bort den kräver just den serverside-identitet vi valt bort. Apples
introduktionserbjudande ligger kvar som extra spak den dagen det behövs.

### Regeln som inte får tummas på

> **Paywallen får aldrig hålla din egen loggbok som gisslan.**

Efter att provperioden gått ut ska du fortfarande kunna **läsa hela din historik** och
**exportera den**. Det som låses är att logga nya pass.

Det är dels rätt — datan är användarens, och den ligger på användarens telefon — dels tar
det bort en verklig avslagsrisk hos Apple. Det tvingar också fram JSON-exporten före
lansering, vilket appen ändå behöver (se `docs/APP-STORE-CHECKLIST.md`).

---

## Vad som låses

| Yta | Under provperioden | Efter, utan abonnemang |
|---|---|---|
| Logga set, starta/avsluta pass | ✅ | 🔒 |
| Planera dagar och rutiner | ✅ | 🔒 |
| Följ upp (brickor, rekord, kalender) | ✅ | ✅ läsning |
| Loggboken — läsa och rätta gamla pass | ✅ | ✅ |
| JSON-export | ✅ | ✅ |
| Inställningar, bibliotek, gym | ✅ | ✅ |

Gränsen går vid **att skapa nytt**, inte vid att komma åt det man redan gjort.

---

## Två saker som är riktiga pengar

### App Store Small Business Program — 15 % i stället för 30 %

Anmälan görs **en gång per utvecklarkonto** och gäller alla appar under det, alltså **både
gymma och laga**. Gränsen är 1 MUSD i intäkt per år, vilket vi inte är i närheten av.
Skillnaden är halva Apples avgift — det är den enskilt mest lönsamma kvarten i hela
lanseringen.

### Family Sharing på prenumerationen

En bock i App Store Connect. Ett köp täcker då **upp till sex personer i familjedelningen**.

För en app som byggts för en familj är det precis rätt modell, och det löser frågan "hur får
familjen appen utan att betala sex gånger" utan promokoder eller specialfall i koden.
RevenueCat rapporterar `ownershipType: FAMILY_SHARED` — vi behöver inte skilja på dem.

---

## Vad koden behöver (native-omgången)

Allt nedan kräver `react-native-purchases`, alltså en native-modul, alltså **ett EAS-bygge**.
Bunta det med övriga native-ändringar enligt fingerprint-avsnittet i `CLAUDE.md`.

- **`lib/purchases.ts`** — seam med samma form som `laga-app` redan har: `initPurchases()`,
  `isSubscribed()`, `presentPaywall()`, `restorePurchases()`. No-ops bakom en
  `PURCHASES_ENABLED`-flagga tills konsolen är klar, så appen går att köra hela tiden.
- **`lib/trial.ts`** — första starttidpunkt i `app_setting`, `trialDaysLeft()`.
  Rent JS ⇒ kan byggas och testas som OTA i förväg.
- **Paywall-skärm.** App Store-regel 3.1.2 kräver **fyra** saker synliga: pris, period,
  **Återställ köp**, samt länkar till **villkor och integritetspolicy**. Saknas något är det
  en garanterad avslagsanledning.
- **Grind** på loggning och planering enligt tabellen ovan.
- **Uppdaterat privacy manifest.** `plugins/withPrivacyManifest.js` deklarerar i dag tomma
  arrayer, vilket stämmer — men RevenueCat samlar köpdata. Både manifestet och
  App Privacy-formuläret måste skrivas om i samma omgång. **Detta är lätt att missa** och
  ger avslag i granskningen.

### Entitlement och produkt-id

| Sak | Värde |
|---|---|
| Entitlement | `premium` |
| Månad | `gymma_monthly` — 39 kr |
| År | `gymma_yearly` — 299 kr |
| Offering | `default` |

Produkt-id går **inte** att ändra i efterhand. Skriv exakt så i App Store Connect.

---

## Risker

| Risk | Hantering |
|---|---|
| **`react-native-purchases` har öppet peer-intervall** (`react-native >= 0.73`) — samma sorts oprövade kombination som kraschade appen med `ReanimatedSwipeable` | **Kör i iOS-simulatorn på Macen före TestFlight.** Icke förhandlingsbart; det här är tredje gången ett körtidsberoende kan kosta en release. |
| Sandbox-köp beter sig annorlunda än skarpa | Testa köp, förnyelse *och* "Återställ köp" med ett sandbox-konto innan inskick. Förnyelser går mycket snabbare i sandbox — en månad blir minuter. |
| Provperioden räknas fel över tidszoner | Spara ISO-8601 i UTC och jämför i UTC. Datumgruppering med `'localtime'` gäller statistik, inte den här. |
| Betalvägg möter en tom app | Provperioden är en månad — värdet hinner byggas upp innan frågan ställs. |
| Familjen fastnar bakom betalväggen | Family Sharing, se ovan. Verifiera med en riktig familjemedlem före lansering. |
