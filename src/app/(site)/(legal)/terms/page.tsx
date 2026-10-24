import type { Metadata } from "next";
import { staticMeta } from "@/lib/seo";
import Link from "@/components/site/Link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = staticMeta({ title: "Terms of Use", description: "The terms for using LustPages: adults only, community rules for comments and accounts, acceptable use, copyright, and how takedown requests are handled.", path: "/terms" });

export default function Page() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="!text-muted">By using {SITE_NAME} you agree to the following.</p>

      <h2>Adults only</h2>
      <p>You must be at least 18, or the age of majority where you live, and viewing adult material must be legal where you are. If either is not true, leave now.</p>

      <h2>Content</h2>
      <p>
        All works belong to their respective owners. They are provided as they are, without any promise about accuracy, availability or fitness for a purpose. If you own a work and want it removed, see the{" "}
        <Link href="/dmca">DMCA page</Link>.
      </p>

      <h2>What you agree not to do</h2>
      <ul>
        <li>Use the site where it is unlawful for you to do so, or let anyone under 18 use it.</li>
        <li>Attempt to disrupt the site, overload it with automated requests, or bypass its protections.</li>
        <li>Upload, or ask us to host, anything depicting a minor or a person without their consent.</li>
      </ul>

      <h2>Accounts and community rules</h2>
      <p>You do not need an account to read. If you create one, you are responsible for what you post with it and for keeping your password and recovery codes safe. These rules apply to comments, usernames and bios:</p>
      <ul>
        <li><b>Nothing involving minors.</b> No text that sexualises, or that describes anyone as, a child. Comments that mention such terms are refused, and an account that tries to post them can be banned.</li>
        <li>No harassment, hate, threats, or sharing anyone&apos;s private information.</li>
        <li>No advertising, spam, links, or contact details (other sites, chat handles, emails). Comments are for talking about the work.</li>
        <li>One account per person. Do not impersonate staff or other members.</li>
      </ul>
      <p>Anyone signed in can report a comment. We may hide or remove any comment, and suspend or delete any account, at any time and without notice. You own what you write, and you give us the right to show it on the site for as long as it is posted. You can delete your comments and your account yourself from your <Link href="/account">account page</Link>. Reports about a comment, or anything that should not be here, can also go through the <Link href="/report-content">report form</Link>.</p>

      <h2>Liability</h2>
      <p>To the fullest extent the law allows, we are not liable for any loss arising from your use of the site or from third-party content.</p>

      <h2>Changes</h2>
      <p>We may change these terms and the site at any time. Continuing to use the site means you accept the current terms.</p>
    </>
  );
}
