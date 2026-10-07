import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "LustManga", description: "Manga and doujinshi" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
