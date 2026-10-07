import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function ConsoleAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await getAdminSession()) redirect("/console");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="font-display text-lg font-extrabold tracking-tight">
          Lust<span className="text-accent">Hentai</span>{" "}
          <span className="font-medium text-white/30">Console</span>
        </h1>
      </div>
      {children}
    </main>
  );
}
