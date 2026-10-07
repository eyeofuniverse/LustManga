/**
 * The core hard-exclusion terms. These are enforced from CODE, not the database:
 * the classifier always unions them into the QUARANTINE tier, the admin term
 * editor refuses to edit or delete them, and no code path publishes a work they
 * caught. Admins can ADD further quarantine terms (stricter) but not remove these.
 *
 * Whole-word matching, so "lolita fashion" and "Shotaro" do not trip them.
 */
export const CORE_QUARANTINE: readonly string[] = [
  "loli",
  "lolis",
  "lolicon",
  "shota",
  "shotas",
  "shotacon",
  "toddlercon",
];

export const isCoreTerm = (term: string): boolean => {
  const t = term
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return CORE_QUARANTINE.includes(t);
};
