/**
 * Default term lists. These seed the SafetyTerm table (npm run db:setup); after
 * that, admins edit the lists from the console (Tags, then Safety terms) and the
 * database is the source of truth. The core quarantine terms live in core.ts.
 *
 *   QUARANTINE  (core.ts + admin additions) metadata only, no images, no publish
 *   DEFER       explicit age markers: held for an admin, NOT downloaded until approved
 *   REVIEW      ambiguous markers: held for an admin, downloaded so they can inspect
 *   ALLOWED     normal adult phrases containing a flagged word (suppresses a match)
 *
 * Matching is on whole normalised words / phrases, never substrings.
 */
export const DEFAULT_DEFER: string[] = [
  "underage",
  "under age",
  "preteen",
  "pre teen",
  "toddler",
  "infant",
  "kindergarten",
  "kindergartener",
  "elementary school",
  "primary school",
];

export const DEFAULT_REVIEW: string[] = [
  "little girl",
  "little boy",
  "young girl",
  "young boy",
  "schoolgirl",
  "schoolboy",
  "school uniform",
  "school swimsuit",
  "gym uniform",
  "high school",
  "middle school",
  "junior high",
  "student",
  "teen",
  "teens",
  "teenager",
  "petite",
  "flat chest",
  "younger sister",
  "little sister",
  "age regression",
  "babysitter",
  "young",
];

export const DEFAULT_ALLOWED: string[] = [
  "college student",
  "university student",
  "graduate student",
  "grad student",
  "student council president",
  "young wife",
  "young widow",
  "young woman",
  "young man",
  "young adult",
  "young mother",
  "young lady",
  "young master",
  "young madam",
  "young husband",
  "lolita fashion",
  "gothic lolita",
  "sweet lolita",
];
