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
  /**
   * Engelskt namn — samma ord som står på maskinskyltarna.
   *
   * Visas bredvid det svenska namnet och gör att sökningen träffar oavsett
   * vilket språk man tänker på. Blir också matchningsnyckel när kamera/OCR
   * kopplas in: Technogym-skyltarna säger "CHEST PRESS", inte "Bänkpress".
   */
  nameEn: string;
  type: ExerciseType;
  weightUnit: WeightUnit;
  primary: string[];
  secondary: string[];
};

/**
 * Viktsteget nya övningar får.
 *
 * 1 kg är det finaste steget och fungerar överallt — går magasinet i 5 kg
 * väljer man det ett tryck bort i loggvyn, och valet sparas per maskin. Att
 * börja grovt och tvinga fram ett byte är sämre än tvärtom.
 */
export const FREEWEIGHT_STEP = 1;

/**
 * Det gamla seed-steget. Finns kvar som måltavla för engångsjusteringen i
 * `normaliseWeightSteps` — telefoner som redan har biblioteket har 2,5 kg
 * sparat, och en ändrad konstant når dem aldrig av sig själv.
 */
export const LEGACY_FREEWEIGHT_STEP = 2.5;

export const SEED_EXERCISES: SeedExercise[] = [
  // --- Bröst ---
  { name: "Bänkpress", nameEn: "Bench Press", type: "freeweight", weightUnit: "total", primary: ["pectoralis"], secondary: ["triceps", "deltoid_anterior"] },
  { name: "Hantelpress", nameEn: "Dumbbell Bench Press", type: "freeweight", weightUnit: "per_hand", primary: ["pectoralis"], secondary: ["triceps", "deltoid_anterior"] },
  { name: "Lutande hantelpress", nameEn: "Incline Dumbbell Press", type: "freeweight", weightUnit: "per_hand", primary: ["pectoralis", "deltoid_anterior"], secondary: ["triceps"] },
  { name: "Hantelflyes", nameEn: "Dumbbell Fly", type: "freeweight", weightUnit: "per_hand", primary: ["pectoralis"], secondary: ["deltoid_anterior"] },

  // --- Rygg ---
  { name: "Marklyft", nameEn: "Deadlift", type: "freeweight", weightUnit: "total", primary: ["erector_spinae", "gluteus", "hamstrings"], secondary: ["trapezius", "forearm"] },
  { name: "Rumänsk marklyft", nameEn: "Romanian Deadlift", type: "freeweight", weightUnit: "total", primary: ["hamstrings", "gluteus"], secondary: ["erector_spinae"] },
  { name: "Skivstångsrodd", nameEn: "Barbell Row", type: "freeweight", weightUnit: "total", primary: ["latissimus", "rhomboideus"], secondary: ["biceps", "trapezius"] },
  { name: "Enarmsrodd", nameEn: "One-Arm Dumbbell Row", type: "freeweight", weightUnit: "per_hand", primary: ["latissimus", "rhomboideus"], secondary: ["biceps"] },
  { name: "Shrugs", nameEn: "Shrugs", type: "freeweight", weightUnit: "per_hand", primary: ["trapezius"], secondary: ["forearm"] },

  // --- Ben ---
  { name: "Knäböj", nameEn: "Squat", type: "freeweight", weightUnit: "total", primary: ["quadriceps", "gluteus"], secondary: ["erector_spinae", "hamstrings"] },
  { name: "Frontböj", nameEn: "Front Squat", type: "freeweight", weightUnit: "total", primary: ["quadriceps"], secondary: ["core", "erector_spinae"] },
  { name: "Goblet squat", nameEn: "Goblet Squat", type: "freeweight", weightUnit: "total", primary: ["quadriceps", "gluteus"], secondary: ["core"] },
  { name: "Utfall", nameEn: "Lunge", type: "freeweight", weightUnit: "per_hand", primary: ["quadriceps", "gluteus"], secondary: ["hamstrings"] },
  { name: "Bulgarsk split squat", nameEn: "Bulgarian Split Squat", type: "freeweight", weightUnit: "per_hand", primary: ["quadriceps", "gluteus"], secondary: ["hamstrings"] },
  { name: "Vadresning", nameEn: "Calf Raise", type: "freeweight", weightUnit: "per_hand", primary: ["calves"], secondary: [] },

  // --- Axlar ---
  { name: "Axelpress", nameEn: "Dumbbell Shoulder Press", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_anterior", "deltoid_lateral"], secondary: ["triceps"] },
  { name: "Militärpress", nameEn: "Overhead Press", type: "freeweight", weightUnit: "total", primary: ["deltoid_anterior"], secondary: ["triceps", "core"] },
  { name: "Sidolyft", nameEn: "Lateral Raise", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_lateral"], secondary: [] },
  { name: "Framåtlyft", nameEn: "Front Raise", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_anterior"], secondary: [] },
  { name: "Omvänd flyes", nameEn: "Reverse Fly", type: "freeweight", weightUnit: "per_hand", primary: ["deltoid_posterior", "rhomboideus"], secondary: [] },
  { name: "Upprätt rodd", nameEn: "Upright Row", type: "freeweight", weightUnit: "total", primary: ["deltoid_lateral", "trapezius"], secondary: ["biceps"] },

  // --- Armar ---
  { name: "Bicepscurl", nameEn: "Biceps Curl", type: "freeweight", weightUnit: "per_hand", primary: ["biceps"], secondary: ["forearm"] },
  { name: "Hammercurl", nameEn: "Hammer Curl", type: "freeweight", weightUnit: "per_hand", primary: ["biceps", "forearm"], secondary: [] },
  { name: "Skivstångscurl", nameEn: "Barbell Curl", type: "freeweight", weightUnit: "total", primary: ["biceps"], secondary: ["forearm"] },
  { name: "Fransk press", nameEn: "Skull Crusher", type: "freeweight", weightUnit: "total", primary: ["triceps"], secondary: [] },
  { name: "Tricepsextension", nameEn: "Triceps Extension", type: "freeweight", weightUnit: "total", primary: ["triceps"], secondary: [] },
  { name: "Tricepskickback", nameEn: "Triceps Kickback", type: "freeweight", weightUnit: "per_hand", primary: ["triceps"], secondary: [] },
];

/** Två gym enligt specen: hemma + jobb/resa. Döps om i inställningar. */
export const SEED_GYMS = ["Hemmagym", "Gym (jobb/resa)"];
