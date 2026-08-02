// Muskelnycklar lagras i databasen (stabila, språkoberoende) och översätts till
// svenska först vid visning. Samma mönster som onboarding-copyn i laga-app:
// ingen visningstext i datalagret.

export const MUSCLES = {
  pectoralis: "Bröst",
  latissimus: "Lats",
  trapezius: "Kappmuskel",
  rhomboideus: "Romboider",
  erector_spinae: "Ryggsträckare",
  deltoid_anterior: "Främre axel",
  deltoid_lateral: "Sidoaxel",
  deltoid_posterior: "Bakre axel",
  biceps: "Biceps",
  triceps: "Triceps",
  forearm: "Underarm",
  quadriceps: "Framsida lår",
  hamstrings: "Baksida lår",
  gluteus: "Säte",
  adductor: "Insida lår",
  calves: "Vader",
  core: "Bål",
} as const;

export type MuscleKey = keyof typeof MUSCLES;

export function muscleName(key: string): string {
  return (MUSCLES as Record<string, string>)[key] ?? key;
}

export function muscleNames(keys: string[]): string {
  return keys.map(muscleName).join(", ");
}
