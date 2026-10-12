/** Numbers and lists the browser also needs (kept apart from rules.ts, which carries the word filters and stays on the server side of the bundle). */
export const COMMENT_MAX = 2000;

export const REPORT_REASONS = [
  { value: "SPAM", label: "Spam or advertising" },
  { value: "ABUSE", label: "Harassment or hate" },
  { value: "MINORS", label: "Mentions minors" },
  { value: "PRIVATE", label: "Shares private information" },
  { value: "OTHER", label: "Something else" },
] as const;
