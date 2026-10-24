import Link from "@/components/site/Link";
import { Settings, UserRound } from "lucide-react";
import { getMember } from "@/lib/member/session";
import { Avatar } from "@/components/member/Avatar";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";

export async function Header() {
  // the account button must never be the reason a page fails
  const me = await getMember().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="container-x flex h-14 items-center gap-2 md:h-[68px] md:gap-5">
        <Logo />
        <NavLinks />
        <div className="flex-1" />
        <SearchBox />
        <ThemeToggle />
        <Link href="/settings" className="btn-icon hidden md:inline-flex" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </Link>
        {me ? (
          <Link href="/account" className="grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-line transition hover:ring-accent/60" aria-label={`Your account (${me.displayName})`}>
            <Avatar name={me.displayName} handle={me.handle} size={32} />
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn-soft hidden h-10 px-4 text-sm sm:inline-flex">
              Sign in
            </Link>
            <Link href="/login" className="btn-icon sm:hidden" aria-label="Sign in">
              <UserRound className="h-5 w-5" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
