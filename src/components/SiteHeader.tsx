import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/football";
import { logoutAction } from "@/server/auth-actions";

const PUBLIC_LINKS = [
  { href: "/", label: "Матчи" },
  { href: "/tournaments", label: "Турниры" },
  { href: "/teams", label: "Команды" },
  { href: "/stats", label: "Статистика" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();

  const roleLinks = [
    user?.role === "ADMIN" && { href: "/admin", label: "Управление" },
    (user?.role === "REFEREE" || user?.role === "ADMIN") && {
      href: "/referee",
      label: "Мои матчи",
    },
    user?.role === "CAPTAIN" && { href: "/captain", label: "Моя команда" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-sm font-black text-brand-fg">
            М
          </span>
          <span className="hidden text-base font-bold tracking-tight sm:block">
            Футбол МГУ
          </span>
        </Link>

        <nav className="no-scrollbar hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
          {[...PUBLIC_LINKS, ...roleLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p className="max-w-[10rem] truncate text-xs font-semibold leading-tight">
                  {user.fullName}
                </p>
                <p className="text-[11px] leading-tight text-subtle">{ROLE_LABEL[user.role]}</p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  Выйти
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
            >
              Войти
            </Link>
          )}
        </div>
      </div>

      {/* Мобильная навигация — вторая строка шапки */}
      <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-1.5 md:hidden">
        {[...PUBLIC_LINKS, ...roleLinks].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-lg px-3 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
