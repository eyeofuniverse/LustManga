import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "18 U.S.C. 2257 statement", alternates: { canonical: "/2257" } };

export default function Page() {
  return (
    <>
      <h1>18 U.S.C. 2257 statement</h1>
      <p className="!text-muted">Last reviewed: when this page was last published. This text is a general statement, not legal advice.</p>

      <p>
        {SITE_NAME} does not produce any of the material it lists. It is an index of third-party works, most of which are illustrated (manga, doujinshi and computer graphics) and do not depict real people. Record-keeping duties under 18 U.S.C. 2257 concern the production of
        sexually explicit depictions of real persons, and are the responsibility of the producers of such material.
      </p>
      <p>
        Some categories (for example western comics or image sets) can include material that was produced by others. If you believe any item here depicts a real person who is under 18, or a real person who did not consent, report it immediately through the{" "}
        <Link href="/report-content">report form</Link>. We act on these reports first and remove the item.
      </p>
      <p>
        Questions about this statement: {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <Link href="/report-content">use the report form</Link>}.
      </p>
    </>
  );
}
