import { faqLd, ldJson } from "@/lib/seo";

export type QA = { q: string; a: React.ReactNode; /** plain-text answer for the structured data */ text: string };

/**
 * A visible FAQ that also emits FAQPage structured data. Both come from the same list, so the markup can never
 * say something the page does not.
 */
export function Faq({ items, title = "Frequently asked questions" }: { items: QA[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="faq-title" className="container-x pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqLd(items.map((x) => ({ q: x.q, a: x.text })))) }} />
      <h2 id="faq-title" className="section-title mb-4">
        {title}
      </h2>
      <div className="card divide-y divide-line overflow-hidden">
        {items.map((x) => (
          <details key={x.q} className="group px-4 py-1 sm:px-5">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              {x.q}
              <span aria-hidden="true" className="shrink-0 text-xl leading-none text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="pb-4 text-[15px] leading-relaxed text-muted">{x.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
