// Designtokens — mörkt tema, byggt för gymbelysning och svettiga händer.
//
// Varför mörkt: appen används i källarlokaler med dålig belysning och tidiga
// morgnar. Hög kontrast mellan siffra och bakgrund är viktigare än varm känsla.
// Accenten är släkt med Lagas terrakotta men klarare, så apparna går att skilja
// åt på hemskärmen.
//
// Tailwind-tokens i tailwind.config.js hålls i synk med dessa värden.
export const colors = {
  bg: "#131316", // sidbakgrund (nästan svart)
  card: "#1d1d22", // kort/ytor
  cardHi: "#26262d", // upphöjd yta (stepper-knappar)
  ink: "#f2f1ee", // primär text
  muted: "#8f8c86", // sekundär text
  line: "#31313a", // kortkant
  chip: "#26262d",
  chipFg: "#b3afa8",
  accent: "#f0603c", // varm orange (primär)
  accentDark: "#c94a2b",
  accentSoft: "#3a2019", // tonad accentyta
  ok: "#4ea87a", // avbockat/klart/PB
  danger: "#e0524a",
  white: "#ffffff",
  /** Dimmad muted — framtida och inaktiva rader, en nivå under `muted`. */
  mutedDim: "#6d6a65",
} as const;

/**
 * Tonade brickor. Skrivs som rgba eftersom de ligger ovanpå olika underlag och
 * ska släppa igenom dem — en opak token hade gett fel resultat på `card`.
 */
export const tint = {
  accent: "rgba(240,96,60,0.14)",
  ok: "rgba(78,168,122,0.16)",
} as const;

/**
 * Radieskala. Poleringen använder större radier än den ursprungliga 15:an, och
 * skillnaden mellan ytorna är avsiktlig — tryckytan i loggvyn (xl) ska kännas
 * mjukare än ett listkort (md).
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 18,
  xl: 20,
  pill: 9999,
} as const;

/**
 * Måttet som gör appen användbar med en hand: minsta tryckyta.
 * Apples HIG säger 44pt — vi tar i ordentligt eftersom målet trycks på med
 * svettiga fingrar mellan set.
 */
export const TAP = 64;
