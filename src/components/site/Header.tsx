import Link from "next/link";
import { Settings } from "lucide-react";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
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
      </div>
    </header>
  );
}
