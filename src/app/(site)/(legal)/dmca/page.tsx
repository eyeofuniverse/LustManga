import type { Metadata } from "next";
import { staticMeta } from "@/lib/seo";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = staticMeta({ title: "DMCA and Takedown Requests", description: "How to send a copyright takedown notice to LustManga, what to include, and what happens next. We act promptly on valid requests.", path: "/dmca" });

export default function Page() {
  return (
    <>
      <h1>DMCA and takedown requests</h1>
      <p className="!text-muted">{SITE_NAME} respects the rights of creators. If you own a work shown here and want it removed, tell us and we will act promptly.</p>

      <h2>How to send a notice</h2>
      <p>
        Use the <Link href="/report-content">report form</Link> (choose &ldquo;Copyright / takedown request&rdquo;){CONTACT_EMAIL ? <> or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></> : null}. Please include:
      </p>
      <ol>
        <li>Your name and a way to contact you.</li>
        <li>Which work you own, and proof that it is yours or that you act for the owner.</li>
        <li>The address (URL) of each page on this site where it appears.</li>
        <li>A statement that you believe in good faith that the use is not authorised by the owner, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are authorised to act for the owner.</li>
        <li>Your physical or electronic signature.</li>
      </ol>

      <h2>What happens next</h2>
      <p>When a notice is complete we remove or disable access to the work and make sure it is not added again. We may pass your notice to the person who supplied the material.</p>

      <h2>Counter-notice</h2>
      <p>If you believe a work was removed by mistake, you may send a counter-notice with the same level of detail, including a statement under penalty of perjury that you believe the removal was a mistake.</p>

      <h2>Content involving minors or non-consent</h2>
      <p>
        If you see anything that depicts a real person without their consent, or anyone who is or appears to be a minor, report it right away through the <Link href="/report-content">report form</Link>. These reports are handled first.
      </p>
    </>
  );
}
