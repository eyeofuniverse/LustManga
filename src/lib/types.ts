export interface WorkCard {
  publicId: number;
  slug: string;
  title: string;
  language: string;
  category: string;
  kind: string;
  pageCount: number;
  coverKey: string | null;
  createdAt: Date | string;
}

export interface TagLite {
  id: number;
  type: string;
  name: string;
  slug: string;
  count: number;
  /** an admin has hidden it from public pages */
  hidden?: boolean;
}

export interface SuggestResult {
  tags: { id: number; type: string; name: string; slug: string; count: number }[];
  works: { publicId: number; slug: string; title: string; language: string; coverKey: string | null }[];
}
