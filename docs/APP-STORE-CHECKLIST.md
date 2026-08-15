# Gymma på App Store — steg för steg

> Guiden täcker **de manuella stegen i Apples och RevenueCats webbportaler**. Koden gör jag.
> Designen bakom betalmodellen står i **`docs/BETALNING.md`** — läs den först om du undrar
> *varför* något ser ut som det gör.
>
> **Så här läser du:**
> - `[ ]` = en sak att bocka av.
> - **Varför:** vad kravet är till för.
> - **Så vet du att det funkade:** ett konkret tecken att titta efter.
> - Bankuppgifter och skattenummer fyller bara du i — inget sådant står i den här filen.

---

## Ordningen spelar roll

1. **Fas 1 (Paid Apps Agreement) tar längst tid** — Apple ska godkänna, ofta någon eller
   några dagar. **Starta den först**, hoppa sedan vidare medan du väntar. Utan avtalet går
   det inte att skapa prenumerationsprodukterna.
2. **Fas 2 (namn + ikon)** kan göras parallellt och blockerar inskicket, inte varandra.
3. **Fas 4 (RevenueCat)** kräver att Fas 3 (produkterna) är klar.
4. **Sista steget — att installera betalbiblioteket i appen** — är en kodändring, inte ditt
   jobb här. **Säg till mig när Fas 4 är klar**, så gör jag den delen. Det blir automatiskt
   ett nytt TestFlight-bygge.

Ungefärlig tid: Fas 1 ~20 min + väntan · Fas 2 ~30 min · Fas 3 ~20 min · Fas 4 ~30–45 min ·
Fas 5 ~15 min · Fas 6 ~45 min · Fas 7 ~15 min + Apples granskningstid.

---

## Fas 1 — Paid Apps Agreement + Small Business Program

**Varför:** Apple kräver ett separat juridiskt och ekonomiskt avtal innan en app får ta
betalt. Small Business Program halverar Apples avgift från 30 % till 15 %.

### 1.1 Avtalet

- [ ] Öppna [appstoreconnect.apple.com](https://appstoreconnect.apple.com), logga in.
- [ ] Klicka **Business** (heter **Agreements, Tax, and Banking** på vissa kontotyper).
- [ ] Öppna **Paid Applications Agreement** och **acceptera villkoren**.
- [ ] Fyll i bankkontouppgifter, skatteinformation och kontaktperson enligt Apples flöde.
- [ ] Skicka in och **vänta**. Statusen står på samma sida.

**Så vet du att det funkade:** avtalet visar **Active** (grönt), och Fas 3 går att göra utan
felmeddelande om saknat avtal.

### 1.2 Small Business Program

**Varför:** 15 % i stället för 30 % i avgift. Anmälan görs **en gång per utvecklarkonto** och
gäller alla appar under det — alltså **både Gymma och VadSkaVi Laga**. Gränsen är 1 MUSD per
år, långt över vad vi kommer i närheten av. Det här är den mest lönsamma kvarten i hela
lanseringen.

- [ ] I App Store Connect: **Business** → leta upp **App Store Small Business Program**.
- [ ] Klicka **Enroll** och följ formuläret.

**Så vet du att det funkade:** statusen visar att kontot är enrollat. Ändringen slår igenom
från nästkommande kalenderkvartal — anmäl därför tidigt, inte "när det börjar sälja".

---

## Fas 2 — Namn och ikon (blockerar inskicket)

### 2.1 Appens namn i App Store

**Varför:** appen heter i dag **`Gymma (08b912)`** i App Store Connect. Det är inte ett
internt id — **det är den publika titeln som skulle synas i App Store.** Namnet fick den
formen när projektet sattes upp, eftersom "Gymma" redan var upptaget av någon annan.

- [ ] Bestäm ett ledigt namn. Förslag som brukar gå igenom: `Gymma – styrketräning`,
      `Gymma träningslogg`, `Gymma gymlogg`. Namnet måste vara globalt unikt i App Store,
      max 30 tecken.
- [ ] App Store Connect → appen → **App Information** → fältet **Name** → skriv in det nya
      namnet → **Save**.

**Så vet du att det funkade:** namnet syns utan `(08b912)` på appens sida. Går det inte att
spara är namnet taget — prova nästa förslag.

> **Hemskärmen påverkas inte.** Ikonens text under appen styrs av `expo.name` i `app.json`
> och är fortfarande **"Gymma"**. Det behöver inte vara unikt. Du kan alltså ha en längre
> titel i App Store och ett kort namn på telefonen.

### 2.2 Riktig ikon

**Varför:** ikonen är i dag en **platshållare** — en mörk platta med en ritad hantel,
genererad av `scripts/make-icon.cjs`. Den är gjord för att bygget ska gå igenom, inget annat.
Ikonen är det mest synliga i hela listningen.

- [ ] Ta fram en riktig ikon, **1024 × 1024 px, PNG, utan alfakanal** (Apple avvisar
      transparens).
- [ ] Skicka den till mig så lägger jag in den — den ligger i native-fingerprintet och ska
      buntas med övriga byggändringar, inte skickas separat.

**Så vet du att det funkade:** du ser den på hemskärmen efter nästa TestFlight-bygge.

---

## Fas 3 — Prenumerationsprodukter

**Varför:** det här är produkterna användaren faktiskt köper. Kräver att Fas 1 är godkänd.

- [ ] App Store Connect → appen → **Monetization** → **Subscriptions**.
- [ ] Klicka **+** vid *Subscription Groups*, skapa gruppen `Gymma Premium` (internt namn).
- [ ] Skapa den första prenumerationen i gruppen:
      - **Reference Name:** `Premium månad`
      - **Product ID:** `gymma_monthly` — **skriv exakt så, det går aldrig att ändra**
      - **Duration:** 1 Month
      - **Price:** 39 kr (Apple har numera väldigt finmaskiga prissteg; finns inte exakt 39
        väljer du närmaste)
      - **Localization (Swedish):** visningsnamn `Gymma Premium`, beskrivning t.ex.
        "Logga dina pass, planera träningen och följ utvecklingen."
- [ ] Skapa den andra:
      - **Reference Name:** `Premium år` · **Product ID:** `gymma_yearly`
      - **Duration:** 1 Year · **Price:** 299 kr
- [ ] **Family Sharing — viktigt.** På *båda* produkterna: leta upp **Family Sharing** och
      slå på den. Ett köp täcker då upp till sex personer i familjedelningen. Det är så
      familjen får appen utan att betala sex gånger.
- [ ] Under **App Information → EULA**: låt Apples standard-EULA vara förvald.

**Så vet du att det funkade:** båda produkterna står som **Ready to Submit**, och Family
Sharing visas som påslagen på var och en. (Grön "Approved" kommer först när appen skickats
in — det är normalt.)

---

## Fas 4 — RevenueCat

**Varför:** RevenueCat sköter kvittovalidering, förnyelser och "Återställ köp" åt oss.
Utan det skulle vi behöva en egen server — och hela poängen med gymma är att den inte har en.

- [ ] Skapa konto på [app.revenuecat.com](https://app.revenuecat.com) och ett nytt projekt,
      `Gymma`.
- [ ] Lägg till en **iOS-app** i projektet med bundle-id `nu.vadskavi.gymma`.
- [ ] RevenueCat ber om en **App Store Connect API-nyckel** (eller *In-App Purchase Key*).
      Deras onboarding visar exakt vilken typ och var i App Store Connect den skapas — följ
      deras skärmbilder, de är aktuella. Klistra in nyckeln i RevenueCat.
- [ ] Under **Products**: lägg till `gymma_monthly` och `gymma_yearly` (samma id som i
      Fas 3 — de hämtas oftast automatiskt när nyckeln fungerar).
- [ ] Under **Entitlements**: skapa ett entitlement som heter **`premium`** och koppla båda
      produkterna till det.
- [ ] Under **Offerings**: skapa en offering som heter **`default`** med båda produkterna,
      årsvalet först.
- [ ] Kopiera **Public SDK Key** (börjar med `appl_…`) och skicka den till mig.
      Den är publik och hör hemma i appen — inte en hemlighet, men skicka den ändå bara till
      mig och lägg den inte i något offentligt dokument.

**Så vet du att det funkade:** produkterna visas som *linked* i RevenueCat och entitlementet
`premium` listar båda.

- [ ] **Säg till mig när den här fasen är klar.** Då kopplar jag in SDK:n, paywallen och
      provperioden — det blir ett nytt TestFlight-bygge automatiskt.

---

## Fas 5 — Policy-sidor på webben

**Varför:** App Store kräver en integritetspolicy-URL, och paywallen kräver enligt regel
3.1.2 länkar till **både** villkor och policy. Gymmas policy blir ovanligt kort — appen
skickar ingen träningsdata någonstans.

- [ ] Det här är en kodändring i `reza` (webbsidan). **Säg till mig** så lägger jag upp
      `vadskavi.nu/gymma/integritetspolicy` och `vadskavi.nu/gymma/anvandarvillkor`.
- [ ] När de ligger uppe: fyll i **Privacy Policy URL** i App Store Connect →
      **App Information**.

**Så vet du att det funkade:** båda sidorna laddar i en webbläsare, och fältet i
App Store Connect är ifyllt utan varningstriangel.

---

## Fas 6 — App Store-metadata

### 6.1 App Privacy

**Varför:** Apple kräver ett svar på vad appen samlar in. Gymma har det ovanligt lätt.

- [ ] App Store Connect → appen → **App Privacy** → **Get Started**.
- [ ] **Innan RevenueCat är inkopplad:** svara **"Data Not Collected"**. Det är sant — all
      träningsdata ligger i SQLite på telefonen och lämnar den aldrig.
- [ ] **Efter att RevenueCat är inkopplad** måste svaret uppdateras:

  | Data Type | Samlas in? | Kopplad till dig? | Används till |
  | --- | --- | --- | --- |
  | Purchases → Purchase History | Ja | Nej | App Functionality |
  | Identifiers → Device ID | Ja | Nej | App Functionality |

  För båda: **Nej** på "Used for Tracking" och **Nej** på annonsering.

> **Missa inte det här.** Att svara "Data Not Collected" när betalbiblioteket väl ligger inne
> är fel, och det är en av de vanligare avslagsanledningarna. Jag uppdaterar samtidigt
> `plugins/withPrivacyManifest.js` i koden.

### 6.2 Grunduppgifter

- [ ] **Kategori:** Health & Fitness (Hälsa och träning).
- [ ] **Age Rating:** svara på formuläret. Gymma har inget användargenererat innehåll,
      inget socialt, inga annonser ⇒ landar på 4+.
- [ ] **Support URL:** `https://vadskavi.nu/kontakt`
- [ ] **Primärt språk:** Svenska. Appen är enbart på svenska — släpp den gärna bara i
      Sverige till att börja med, det gör granskningen enklare.
- [ ] **Beskrivning:** måste nämna att appen har en **auto-förnyande prenumeration**, med
      pris och period. Apple kräver att det står i metadatan, inte bara i appen.

### 6.3 Skärmbilder

- [ ] Ta bilder i storleken **6,9"** (iPhone 16 Pro Max eller motsvarande — App Store
      Connect säger exakt vilken storlek som krävs vid uppladdning).
- [ ] Föreslagna vyer: **loggvyn** (den stora siffran — det är appens kärna), **Gymma-fliken**
      med snabbstart, **Planera** med kalendern, **Följ upp** med månadsbrickorna.
- [ ] Ladda upp under **App Store → [version] → App Previews and Screenshots**.

### 6.4 App Review Information

- [ ] **Sign-In Required: Nej.** Gymma har ingen inloggning — det gör granskningen enklare
      än för Laga.
- [ ] I **Notes**, klistra in ungefär:
      > Appen kräver inget konto. All träningsdata lagras lokalt på enheten (SQLite) och
      > skickas aldrig till någon server. Efter 30 dagars gratis provperiod krävs en
      > prenumeration för att logga nya pass; tidigare loggad data går alltid att läsa och
      > exportera. Provperioden kan återställas för granskning genom att avinstallera och
      > installera om appen.

---

## Fas 7 — Generalrepetition och inskick

### 7.1 Sandbox-test av köpen

- [ ] Skapa ett **Sandbox-testkonto**: App Store Connect → **Users and Access** →
      **Sandbox** → **Test Accounts** → **+**. Använd en e-postadress som inte redan är ett
      Apple-id.
- [ ] På telefonen: **Inställningar → App Store → Sandbox-konto** → logga in med testkontot.
- [ ] I appen: gå till paywallen och genomför ett köp. Testa **båda** produkterna,
      **förnyelse** (går mycket fortare i sandbox — en månad blir minuter) och
      **"Återställ köp"**.

**Så vet du att det funkade:** appen visar Premium efter köpet, och efter "Återställ köp" på
en ominstallerad app kommer Premium tillbaka.

### 7.2 Extern TestFlight-grupp

**Varför:** en gratis förhandsgranskning (Beta App Review), oftast klar inom ett dygn.
Fångar uppenbara problem innan det skarpa inskicket.

- [ ] App Store Connect → **TestFlight** → **External Testing** → **+** → skapa gruppen
      `Externa testare`, koppla senaste bygget, bjud in testarna.
- [ ] Skicka in för **Beta App Review**.

### 7.3 Sista koll

- [ ] Öppna appen på en **helt ny installation** — se att provperioden startar och att inget
      ser trasigt ut i tomt läge.
- [ ] Öppna villkors- och policylänkarna från paywallen — båda ska ladda.
- [ ] Kontrollera att **Återställ köp** finns synlig på paywallen (App Store-krav).
- [ ] Kolla att **versionsmarkören** under Inställningar visar rätt release.

### 7.4 Skicka in

- [ ] Kontrollera att alla sektioner har grön bock, inga varningstrianglar.
- [ ] Klicka **Submit for Review**.
- [ ] Vid avslag: läs motiveringen. Mest sannolika kvarvarande risker är regel **3.1.2**
      (något saknas på paywallen — pris, period, Återställ köp eller länkarna) och
      **App Privacy** som inte matchar att RevenueCat är inkopplad. Båda är snabba att rätta.

---

## Vad som redan är klart i kod

| Krav | Var |
| --- | --- |
| Privacy manifest (Apple-krav sedan 2024) | `plugins/withPrivacyManifest.js` — uppdateras när RevenueCat kopplas in |
| Ikon utan alfakanal | `scripts/make-icon.cjs` (platshållare — se Fas 2.2) |
| Ingen spårning, ingen annonsering | Appen har aldrig haft något av det |
| Build numbers | EAS sköter dem automatiskt (`appVersionSource: "remote"`) |
| ASC Apple ID | `6797230599`, ligger i `eas.json` |

## Vad som fortfarande saknas i kod

Byggs i **native-omgången**, allt i en commit (se `CLAUDE.md` om fingerprintet):

- RevenueCat-SDK, paywall och 30-dagarsprovperiod (`docs/BETALNING.md`)
- Påminnelse kvällen innan en planerad träningsdag (`expo-notifications`)
- Kraschrapportering (Sentry)
- JSON-export till Filer — behövs för löftet "din data är din" i `docs/BETALNING.md`
- Riktig ikon och uppdaterat privacy manifest
