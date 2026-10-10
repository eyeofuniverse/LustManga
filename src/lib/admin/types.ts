/** Plain data shapes the admin screens render. No database or server-only imports, so views and previews can use them. */

export interface ReviewWork {
  id: string;
  publicId: number;
  language: string;
  title: string;
  reasons: string[];
  description: string | null;
  tags: string[];
  pageCount: number;
  coverUrl: string | null;
  previews: string[];
  sourceUrl: string | null;
  createdAt: Date;
}
export interface QuarantineRow {
  id: string;
  title: string;
  reasons: string[];
  site: string;
  externalId: string;
  confirmedAt: Date | null;
  createdAt: Date;
}
export type ReviewTab = "held" | "deferred" | "quarantined";
export interface ReviewData {
  tab: ReviewTab;
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  counts: Record<ReviewTab, number>;
  works: ReviewWork[];
  quarantined: QuarantineRow[];
}

export interface WorkRow {
  id: string;
  publicId: number;
  slug: string;
  title: string;
  language: string;
  kind: string;
  pageCount: number;
  publish: string;
  needsReview: boolean;
  deferFetch: boolean;
  coverUrl: string | null;
  createdAt: Date;
}
export interface WorksData {
  rows: WorkRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  q: string;
  publish: string;
  lang: string;
  langs: { language: string; count: number }[];
}

export interface ReportRow {
  id: string;
  kind: string;
  status: string;
  details: string;
  contact: string | null;
  workId: number | null;
  createdAt: Date;
}
export interface ReportsData {
  status: "open" | "closed";
  rows: ReportRow[];
  open: number;
  closed: number;
}

export interface DupSide {
  publicId: number;
  title: string;
  language: string;
  kind: string;
  pageCount: number;
  publish: string;
  coverUrl: string | null;
  sources: string[];
  artists: string[];
}
export interface DupPair {
  id: string;
  score: number;
  reasons: string[];
  a: DupSide;
  b: DupSide;
}
export interface DuplicatesData {
  pairs: DupPair[];
  open: number;
  merged: number;
}

export interface TagRow {
  id: number;
  name: string;
  type: string;
  count: number;
  hidden: boolean;
  featured: boolean;
  aliases: number;
}
export interface TermRow {
  id: string;
  term: string;
  tier: string;
  locked: boolean;
  caught: number;
}
export interface TagsData {
  view: "terms" | "tags";
  terms: TermRow[];
  tags: TagRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  q: string;
  type: string;
  sort: string;
  flag: string;
}

export interface RunDetail {
  id: string;
  site: string;
  mode: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  seen: number;
  created: number;
  held: number;
  quarantined: number;
  chapters: number;
  pages: number;
  errors: string[];
}
export interface FailedChapter {
  id: string;
  number: number;
  attempts: number;
  error: string | null;
  publicId: number;
  title: string;
  language: string;
}
export interface RunsData {
  runs: RunDetail[];
  failed: FailedChapter[];
  failedCount: number;
}

export interface AuditRow {
  id: string;
  at: Date;
  actor: string | null;
  action: string;
  targetType: string;
  targetId: string;
  diff: unknown;
}
export interface AuditData {
  rows: AuditRow[];
  q: string;
  actors: string[];
}
