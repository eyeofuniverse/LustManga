import type { Metadata } from "next";
import { SettingsPanel } from "@/components/site/SettingsPanel";
import { PageHeading } from "@/components/work/Section";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function Page() {
  return (
    <div className="container-x max-w-3xl py-6 sm:py-10">
      <PageHeading title="Settings" sub="Saved on this device. No account needed." />
      <SettingsPanel />
    </div>
  );
}
