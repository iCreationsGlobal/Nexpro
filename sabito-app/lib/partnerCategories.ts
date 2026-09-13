export const SABITO_CATEGORY_CHIPS = [
  { id: "all", label: "All categories" },
  { id: "retail", label: "Retail" },
  { id: "print_photo", label: "Print & branding" },
  { id: "beauty", label: "Beauty" },
  { id: "auto", label: "Auto" },
  { id: "food", label: "Food" },
  { id: "health", label: "Health" },
  { id: "rental", label: "Rental" },
] as const;

export type SabitoCategoryChipId = (typeof SABITO_CATEGORY_CHIPS)[number]["id"];

/** Query value sent to GET /public/sabito-partners?category= */
export function sabitoCategoryQuery(chipId: SabitoCategoryChipId): string | undefined {
  if (!chipId || chipId === "all") return undefined;
  return chipId;
}
