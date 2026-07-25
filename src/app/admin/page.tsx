import Link from "next/link";

import { Card, CardHeader, EmptyState, PageTitle } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Управление" };

export default async function AdminDashboard() {
  const [counts, recentLog, liveCount, unassigned] = await Promise.all([
    Promise.all([
      prisma.tournament.count(),
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.user.count(),
    ]),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        summary: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.match.count({
      where: { status: { in: ["FIRST_HALF", "HALF_TIME", "SECOND_HALF", "EXTRA_TIME"] } },
    }),
    prisma.match.count({ where: { refereeId: null, status: "SCHEDULED" } }),
  ]);

  const [tournaments, teams, players, matches, users] = counts;

  return (
    <div className="space-y-4">
      <PageTitle title="Управление" subtitle="Организация турниров и данных сайта" />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="Турниров" value={tournaments} href="/admin/tournaments" />
        <Tile label="Команд" value={teams} href="/admin/teams" />
        <Tile label="Игроков" value={players} href="/admin/players" />
        <Tile label="Матчей" value={matches} href="/admin/matches" />
        <Tile label="Аккаунтов" value={users} href="/admin/users" />
      </div>

      {(liveCount > 0 || unassigned > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {liveCount > 0 ? (
            <Card className="p-4">
              <p className="text-sm font-semibold text-live">Сейчас идёт матчей: {liveCount}</p>
              <Link href="/" className="text-xs text-brand hover:underline">
                Смотреть на главной →
              </Link>
            </Card>
          ) : null}
          {unassigned > 0 ? (
            <Card className="p-4">
              <p className="text-sm font-semibold text-warning">
                Матчей без судьи: {unassigned}
              </p>
              <Link href="/admin/matches" className="text-xs text-brand hover:underline">
                Назначить судей →
              </Link>
            </Card>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader title="Последние действия" subtitle="Кто и что менял в системе" />
        {recentLog.length === 0 ? (
          <EmptyState title="Пока ничего не происходило" />
        ) : (
          <ul className="divide-y divide-border">
            {recentLog.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{entry.summary}</span>
                <span className="shrink-0 text-xs text-subtle">
                  {entry.user?.fullName ?? "—"} · {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="px-3 py-2.5 transition-colors hover:border-brand">
        <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </Card>
    </Link>
  );
}
