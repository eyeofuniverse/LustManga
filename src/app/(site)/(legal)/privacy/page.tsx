import type { Metadata } from "next";
import { staticMeta } from "@/lib/seo";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { RETENTION_DAYS } from "@/lib/analytics/config";
import { adsInUse } from "@/lib/ads/serve";

export const metadata: Metadata = staticMeta({ title: "Privacy Policy", description: "What LustPages keeps: what is stored in your browser, a small record if you create an account, what we log, and how to clear it.", path: "/privacy" });

export default async function Page() {
  const ads = await adsInUse().catch(() => false);
  return (
    <>
      <h1>Privacy</h1>
      <p className="!text-muted">The short version: we keep very little.</p>

      <h2>What stays on your device</h2>
      <ul>
        <li>Your saved works, reading history, reader settings and theme are stored in your browser only. We never receive them.</li>
        <li>
          A few cookies make the site work: one remembers that you confirmed you are an adult, one remembers your language and hidden-tag choices (so lists can be filtered before they are sent to you), a short-lived one stops the same work being counted as viewed twice, and one more (until you close the browser) stops the reader making room for ads between pages when your browser keeps showing none.
        </li>
      </ul>

      <h2>If you create an account</h2>
      <p>If you create an account (to comment on and rate works) we store:</p>
      <ul>
        <li>your <b>username</b> (public: it is shown next to your comments and on your profile) and, if you write one, a short bio;</li>
        <li>a <b>scrambled (bcrypt) copy of your password</b>, never the password itself, and scrambled copies of your recovery codes. We cannot read either, so we cannot recover an account whose password and codes are both lost;</li>
        <li>your <b>email address, if you choose to add one</b>. It is kept private and is not used to contact you;</li>
        <li>your <b>ratings</b> (private unless you choose to show them on your profile) and your <b>comments</b> (public, with the votes and reports they receive);</li>
        <li>a <b>sign-in cookie</b> (a random token; we keep only its hash) and, for each signed-in browser, the browser type and when it was last used.</li>
      </ul>
      <p>To slow down password guessing and spam we also keep a one-way hash of your connection with the time of each sign-in, sign-up, comment and report attempt for 30 days. You can change your profile, change your password or delete your account at any time from your <Link href="/account">account page</Link>. Deleting it removes your profile, your ratings and your sign-in; your comments are emptied, and one that has replies stays as &ldquo;[deleted]&rdquo; so the conversation still reads.</p>

      <h2>What our servers see</h2>
      <ul>
        <li>Like every web server, ours and our hosting providers&apos; process your IP address and request details to deliver pages and protect the site. Logs are kept briefly.</li>
        <li>Reports you submit are stored with the details you type. A one-way hash of your IP address is kept only to limit abuse.</li>
        <li>We count how many times a work is viewed. This is not tied to you, whether or not you have an account.</li>
      </ul>

      <h2>Anonymous statistics</h2>
      <p>We measure how the site is used so we can fix what is slow and add what is missing. This is our own system, not a third-party tracker, and it is built to know as little as possible:</p>
      <ul>
        <li>It sets <b>no cookie</b> and stores nothing in your browser. It does not keep your IP address. A one-way hash of your connection and browser, mixed with a secret and today&apos;s date, tells two of today&apos;s visitors apart; it changes every day, so you cannot be followed from one day to the next and it cannot be turned back into an address.</li>
        <li>For each page we keep the page address (without any search words in it), your country (from the network, not a lookup of your address), the kind of device, browser and system, your browser&apos;s language, the website you came from, and how long the page was in use.</li>
        <li>We also keep what you did on the site: the words you searched for, which chapters you opened and how far you read, saves, follows, downloads and shares, passing the age check, pages that did not exist, and how fast pages loaded for you.</li>
        <li>Statistics older than {RETENTION_DAYS} days are deleted.</li>
        <li>If your browser sends <b>Do Not Track</b> or <b>Global Privacy Control</b>, nothing is measured at all.</li>
      </ul>

      <h2>Third parties</h2>
      <p>Pages are delivered through our hosting and content-delivery providers, who see your requests as any network does.{" "}
        {ads
          ? <><b>Advertising.</b> This site shows advertisements supplied by advertising networks. When an ad loads, the network receives your IP address and browser details and may set its own cookies and measure whether you saw or clicked the ad; we do not control that, and we give them nothing about you beyond what your browser sends. Ads are only loaded after you have confirmed you are an adult. Separately, we count (in total, never per person) how many times each ad was shown and clicked, and nothing is counted if your browser sends Do Not Track or Global Privacy Control. A content blocker stops ads from loading at all. </>
          : <>We do not run advertising trackers. </>}
        {process.env.NEXT_PUBLIC_GA_ID
          ? <>We also use <b>Google Analytics</b>, which sets cookies and sends Google information about your visit (pages viewed, device, approximate location) once you have confirmed you are an adult. It is not loaded at all if your browser sends Do Not Track or Global Privacy Control. You can block it with any content blocker or Google&apos;s opt-out add-on without affecting the site.</>
          : <>We do not use third-party analytics. If that changes, this page will say so before it does.</>}
      </p>

      <h2>Your choices</h2>
      <p>
        You can clear everything we store about you from <Link href="/settings">Settings</Link>, or by clearing your browser data. To ask about anything else, {CONTACT_EMAIL ? <>write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></> : <>use the <Link href="/report-content">report form</Link></>}. {SITE_NAME} is for adults only.
      </p>
    </>
  );
}
