// Versionsmarkör som visas i inställningar. **Bumpa denna per release/OTA.**
//
// Avsiktligt en vanlig JS-konstant — INTE `app.json` `extra.release` — så att en
// bump garanterat går ut som en OTA och aldrig råkar ändra native-fingerprintet
// (vilket skulle tvinga fram ett nytt bygge i stället för en OTA). Markören är
// därmed ett pålitligt kvitto på vilken JS-uppdatering telefonen faktiskt kör.
export const RELEASE = "Polering 2 (startvyn)";
