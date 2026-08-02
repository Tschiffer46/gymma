# Gymma

Gymlogg med **ett tryck per set**.

En iOS-app (Expo/React Native) för att logga styrketräning — maskiner, hantlar och skivstång.
All data ligger lokalt på telefonen i SQLite. Ingen inloggning, ingen server, fungerar helt
offline.

## Designprinciper

Dessa väger tyngre än varje enskild funktion. Vid konflikt vinner principen.

1. **Ett tryck per set.** Loggvyn är redan ifylld med förra passets siffror.
2. **Aldrig tangentbord under passet.** Endast stora +/– och bekräfta.
3. **Fungerar helt offline.** Gymkällare har usel täckning.
4. **Programmet växer fram.** Ingen "skapa program"-vy — övningar läggs till när de används.
5. **Tummen når allt.** Alla interaktiva element i nedre tredjedelen av skärmen.

## Kom igång

```bash
npm install
npx expo start
```

Se [`CLAUDE.md`](./CLAUDE.md) för arkitektur, datamodell och byggrutiner.

## Distribution

TestFlight. Merge till `main` → EAS bygger eller skickar en OTA-uppdatering automatiskt
(`.eas/workflows/deploy-ios.yml`).
