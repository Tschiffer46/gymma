// Övningsidentitet.
//
// Två vägar leder in i appen (manuell inmatning nu, kamera/OCR och fritext i
// senare sprintar). Om de skapar olika poster för samma sak splittras
// månadstrenden i två halva serier som båda är oanvändbara. Därför får INGEN
// väg skapa en `exercise` utan att först ha gått via findByMatchKey().

// Explicit teckenkarta i stället för String.normalize("NFD") — Hermes stödjer
// normalize, men en karta är förutsägbar och täcker exakt de tecken svensk
// och engelsk skylttext faktiskt innehåller.
const FOLD: Record<string, string> = {
  å: "a", ä: "a", à: "a", á: "a", â: "a", ã: "a",
  ö: "o", ø: "o", ó: "o", ò: "o", ô: "o", õ: "o",
  é: "e", è: "e", ê: "e", ë: "e",
  ü: "u", ú: "u", ù: "u", û: "u",
  í: "i", ì: "i", î: "i",
  ç: "c", ñ: "n", ß: "ss",
};

/**
 * Normaliserar ett övningsnamn till en jämförbar nyckel.
 * "Bröst­press" / "brostpress" / "BRÖST PRESS" → "brostpress".
 *
 * Blanksteg tas bort helt, eftersom skyltar och handskriven text är
 * inkonsekventa med särskrivning ("chest press" vs "chestpress").
 */
export function normalizeName(name: string): string {
  let out = "";
  for (const ch of name.toLowerCase()) {
    const folded = FOLD[ch] ?? ch;
    for (const c of folded) {
      if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) out += c;
    }
  }
  return out;
}
