import type { Metadata, Viewport } from "next";

import { SiteHeader } from "@/components/SiteHeader";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Футбол МГУ — турниры, результаты, статистика",
    template: "%s — Футбол МГУ",
  },
  description:
    "Результаты матчей, турнирные таблицы и статистика игроков студенческих футбольных турниров МГУ.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

// Применяем сохранённую тему до первой отрисовки, иначе страница моргает.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("msu-football-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
        <footer className="mx-auto mt-8 w-full max-w-6xl px-4 pb-10 text-center text-xs text-subtle">
          <p>Студенческие футбольные турниры МГУ имени М. В. Ломоносова</p>
        </footer>
      </body>
    </html>
  );
}
