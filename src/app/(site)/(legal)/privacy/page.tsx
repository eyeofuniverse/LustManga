import type { Metadata } from "next";
import { staticMeta } from "@/lib/seo";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = staticMeta({ title: "Privacy Policy", description: "LustManga has no accounts and keeps very little: what is stored in your browser, what we log, and how to clear it.", path: "/privacy" });

export default function Page() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="!text-muted">The short version: there are no accounts, and we keep very little.</p>

      <h2>What stays on your device</h2>
      <ul>
        <li>Your saved works, reading history, reader settings and theme are stored in your browser only. We never receive them.</li>
        <li>
          A few cookies make the site work: one remembers that you confirmed you are an adult, one remembers your language and hidden-tag choices (so lists can be filtered before they are sent to you), and a short-lived one stops the same work being counted as viewed twice.
        </li>
      </ul>

      <h2>What our servers see</h2>
      <ul>
        <li>Like every web server, ours and our hosting providers&apos; process your IP address and request details to deliver pages and protect the site. Logs are kept briefly.</li>
        <li>Reports you submit are stored with the details you type. A one-way hash of your IP address is kept only to limit abuse.</li>
        <li>We count how many times a work is viewed. This is not tied to you.</li>
      </ul>

      <h2>Third parties</h2>
      <p>Pages are delivered through our hosting and content-delivery providers. We do not run advertising or analytics trackers at the moment; if that changes, this page will say so before it does.</p>

      <h2>Your choices</h2>
      <p>
        You can clear everything we store about you from <Link href="/settings">Settings</Link>, or by clearing your browser data. To ask about anything else, {CONTACT_EMAIL ? <>write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></> : <>use the <Link href="/report-content">report form</Link></>}. {SITE_NAME} is for adults only.
      </p>
    </>
  );
}
