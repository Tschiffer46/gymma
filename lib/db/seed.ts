import type { ExerciseType, WeightUnit } from "./types";

/**
 * Startbiblioteket: fria vikter som finns i varje gym.
 *
 * Maskiner seedas medvetet INTE — designprincip 4 säger att programmet ska växa
 * fram. Första gången en maskin loggas läggs den till, med rätt gym och rätt
 * viktsteg. Ett förseedat maskinbibliotek skulle mest bli fel.
 *
 * `per_hand` = vikten som skrivs in är per hantel. Volymen räknas ×2.
 */
export type SeedExercise = {
  name: string;
  type: ExerciseType;
  weightUnit: WeightUnit;
  primary: string[];
  secondary: string[];
};

/** Fria vikter går sällan i 5 kg-steg — hantelställ hoppar oftast 2 kg, stänger 2,5. */
export const FREEWEIGHT_STEP = 2.5;

export const SEED_EXERCISES: SeedExercise[] = [
  // --- Bröst ---
  { name: "Bänkpress", type: "freeweight", weightUnit: "total", primary: ["pectoralis"], secondary: ["triceps", "deltoid_anterior"] },
  { name: "Hantelpress", type: "freeweight", weightUnit: "per_hand", primary: ["pectoralis"], secondary: ["triceps", "deltoid_anterior"] },
  { name: "Lutande hantelpress", type: "freeweight", weightUnit: "per_hand", primary: ["pectoralis", "deltoid_anterior"], secondary: ["triceps"] },
  { name: "Hantelflyes", type: "freeweight", weightUnit: "per_hand", primary: ["pectoralis"], secondary: ["deltoid_anterior"] },

  // --- Rygg ---
  { name: "Marklyft", type: "freeweight", weightUnit: "total", primary: ["erector_spinae", "gluteus", "hamstrings"], secondary: ["trapezius", "forearm"] },
  { name: "Rumänsk marklyft", type: "freeweight", weightUnit: "total", primary: ["hamstrings", "gluteus"], secondary: ["erector_spinae"] },
  { name: "Skivstångsrodd", type: "freeweight", weightUnit: "total", primary: ["latissimus", "rhomboideus"], secondary: ["biceps", "trapezius"] },
  { name: "Enarmsrodd", type: "freeweight", weightUnit: "per_hand", primary: ["latissimus", "rhomboideus"], secondary: ["biceps"] },
  { name: "Shrugs", type: "freeweight", weightUnit: "per_hand", primary: ["trapezius"], secondary: ["forearm"] },

  // --- Ben ---
  { name: "Knäböj", type: "freeweight", weightUnit: "total", primary: ["quadriceps", "gluteus"], secondary: ["erector_spinae", "hamstrings"] },
  { name: "Frontböj", type: "freeweight", weightUnit: "total", primary: ["quadriceps"], secondary: ["core", "erector_spinae"] },
  { name: "Goblet squat", type: "freeweight", weightUnit: "total", primary: ["quadriceps", "gluteus"], secondary: ["core"] },
  { name: "Utfall", type: "freeweight", weightUnit: "per_hand", primary: ["quadriceps", "gluteus"], secondary: ["hamstrings"] },
  { name: "Bulgarsk split squat", type: "freeweight", weightUnit: "per_hand", primary: ["quadriceps", "gluteus"], secondary: ["hamstrings"] },
  { name: "Vadresning", type: "freeweight", weightUnit: "per_hand", primary: ["calves"], secondary: [] },

  // --- Axlar ---
  { name: "Axelpress", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_anterior", "deltoid_lateral"], secondary: ["triceps"] },
  { name: "Militärpress", type: "freeweight", weightUnit: "total", primary: ["deltoid_anterior"], secondary: ["triceps", "core"] },
  { name: "Sidolyft", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_lateral"], secondary: [] },
  { name: "Framåtlyft", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_anterior"], secondary: [] },
  { name: "Omvänd flyes", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_posterior", "rhomboideus"], secondary: [] },
  { name: "Upprätt rodd", type: "freeweight", weightUnit: "total", primary: ["deltoid_lateral", "trapezius"], secondary: ["biceps"] },

  // --- Armar ---
  { name: "Bicepscurl", type: "freeweight", weightUnit: "per_hand", primary: ["biceps"], secondary: ["forearm"] },
  { name: "Hammercurl", type: "freeweight", weightUnit: "per_hand", primary: ["biceps", "forearm"], secondary: [] },
  { name: "Skivstångscurl", type: "freeweight", weightUnit: "total", primary: ["biceps"], secondary: ["forearm"] },
  { name: "Fransk press", type: "freeweight", weightUnit: "total", primary: ["triceps"], secondary: [] },
  { name: "Tricepsextension", type: "freeweight", weightUnit: "total", primary: ["triceps"], secondary: [] },
  { name: "Tricepskickback", type: "freeweight", weightUnit: "per_hand", primary: ["triceps"], secondary: [] },
];

/** Två gym enligt specen: hemma + jobb/resa. Döps om i inställningar. */
export const SEED_GYMS = ["Hemmagym", "Gym (jobb/resa)"];
