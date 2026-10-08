import type { Metadata } from "next";
import { SavedGrid } from "@/components/work/SavedGrid";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default function Page() {
  return <SavedGrid kind="favorites" />;
}
