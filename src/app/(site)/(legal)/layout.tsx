export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <article className="container-x max-w-3xl py-8 sm:py-12 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:no-underline [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-extrabold [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:mb-1.5 [&_li]:text-[15px] [&_li]:leading-relaxed [&_li]:text-text/85 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:text-text/85 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </article>
  );
}
