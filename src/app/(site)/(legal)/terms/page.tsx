import type { Metadata } from "next";
import { staticMeta } from "@/lib/seo";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = staticMeta({ title: "Terms of Use", description: "The terms for using LustManga: adults only, acceptable use, copyright, and how takedown requests are handled.", path: "/terms" });

export default function Page() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="!text-muted">By using {SITE_NAME} you agree to the following.</p>

      <h2>Adults only</h2>
      <p>You must be at least 18, or the age of majority where you live, and viewing adult material must be legal where you are. If either is not true, leave now.</p>

      <h2>Content</h2>
      <p>
        The works listed here are created and owned by others. We do not claim ownership of them. They are provided as they are, without any promise about accuracy, availability or fitness for a purpose. If you own a work and want it removed, see the{" "}
        <Link href="/dmca">DMCA page</Link>.
      </p>

      <h2>What you agree not to do</h2>
      <ul>
        <li>Use the site where it is unlawful for you to do so, or let anyone under 18 use it.</li>
        <li>Attempt to disrupt the site, overload it with automated requests, or bypass its protections.</li>
        <li>Upload, or ask us to host, anything depicting a minor or a person without their consent.</li>
      </ul>

      <h2>Liability</h2>
      <p>To the fullest extent the law allows, we are not liable for any loss arising from your use of the site or from third-party content.</p>

      <h2>Changes</h2>
      <p>We may change these terms and the site at any time. Continuing to use the site means you accept the current terms.</p>
    </>
  );
}
