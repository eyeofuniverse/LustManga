/**
 * Term lists for the ingest safety gate. Edit here (it is config, not logic).
 * Matching is on whole normalised words / phrases, never substrings, so
 * "childhood friend" does not trip "child" and "lolita fashion" does not trip
 * "loli".
 *
 * Three tiers:
 *   QUARANTINE  the source itself tags the work as child sexualisation. Metadata
 *               only, no images, no publish path.
 *   DEFER       explicit age markers. Held as DRAFT for an admin; images are NOT
 *               downloaded until the admin approves (a rejected work never has
 *               its images stored).
 *   REVIEW      ambiguous markers. Held as DRAFT for an admin; images are
 *               downloaded so the admin can inspect, then publish or reject.
 * Everything that is not QUARANTINE is decided by an admin, never by this list.
 */

/**
 * QUARANTINE: genre tags that identify child / child-like sexual content.
 * Matched against TAGS and TITLES only (never the description, so a "no loli"
 * disclaimer cannot suppress a work). Deliberately kept to these few exact tags.
 */
export const QUARANTINE_TERMS: string[] = [
  "loli",
  "lolis",
  "lolicon",
  "shota",
  "shotas",
  "shotacon",
  "toddlercon",
];

/**
 * DEFER: explicit age markers. Matched against tags and titles (not description).
 */
export const DEFER_TERMS: string[] = [
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

/**
 * REVIEW: ambiguous markers. Matched against tags, titles and the description.
 */
export const REVIEW_TERMS: string[] = [
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

/**
 * Phrases that contain a flagged word but are normal adult context. Any match of
 * a flagged term that sits inside one of these phrases is ignored.
 */
export const ALLOWED_CONTEXT: string[] = [
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
