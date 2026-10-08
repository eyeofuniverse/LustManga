import type { Metadata } from "next";
import { ReportForm } from "@/components/site/ReportForm";
import { PageHeading } from "@/components/work/Section";

export const metadata: Metadata = { title: "Report content", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const w = Number.parseInt(String((await searchParams).work ?? ""), 10);
  return (
    <div className="container-x max-w-2xl py-6 sm:py-10">
      <PageHeading title="Report content" sub="Broken pages, copyright claims, or anything that should not be here." />
      <ReportForm work={Number.isInteger(w) && w > 0 ? w : undefined} />
    </div>
  );
}
