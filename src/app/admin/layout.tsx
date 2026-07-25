import Link from "next/link";

import { requireRole } from "@/lib/auth";

const SECTIONS = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/tournaments", label: "Турниры" },
  { href: "/admin/matches", label: "Матчи" },
  { href: "/admin/teams", label: "Команды" },
  { href: "/admin/players", label: "Игроки" },
  { href: "/admin/users", label: "Пользователи" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole([], "/admin");

  return (
    <div>
      <nav className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {section.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
