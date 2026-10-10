import type { Metadata } from "next";
import { ConsoleProvider } from "@/components/console/Toast";

export const metadata: Metadata = {
  title: { default: "Console", template: "%s | Console" },
  robots: { index: false, follow: false, nocache: true },
};

// Applies a saved light/dark choice before the first paint, so there is no flash. The panel defaults to dark.
const THEME_SCRIPT = `try{var t=localStorage.getItem("lm-console-theme");if(t==="light"||t==="dark")document.getElementById("console-root").setAttribute("data-theme",t)}catch(e){}`;

export default function ConsoleRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="console-root" data-theme="dark" suppressHydrationWarning className="min-h-screen bg-bg text-text">
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <ConsoleProvider>{children}</ConsoleProvider>
    </div>
  );
}
