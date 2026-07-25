import Link from "next/link";

import { Badge, Card, EmptyState, PageTitle, buttonClass } from "@/components/ui";
import { formatDate, pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Турниры — управление" };

export default async function AdminTournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      season: true,
      status: true,
      startDate: true,
      _count: { select: { entries: true, matches: true, divisions: true } },
    },
  });

  return (
    <div>
      <PageTitle
        title="Турниры"
        action={
          <Link href="/admin/tournaments/new" className={buttonClass("primary")}>
            + Новый турнир
          </Link>
        }
      />

      {tournaments.length === 0 ? (
        <Card>
          <EmptyState title="Турниров нет" hint="Создайте первый турнир, чтобы начать." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {tournaments.map((tournament) => (
              <li key={tournament.id}>
                <Link
                  href={`/admin/tournaments/${tournament.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {tournament.name}
                      <span className="ml-2 text-xs text-muted">{tournament.season}</span>
                    </p>
                    <p className="text-xs text-subtle">
                      старт {formatDate(tournament.startDate)} ·{" "}
                      {pluralize(tournament._count.entries, "команда", "команды", "команд")} ·{" "}
                      {pluralize(tournament._count.matches, "матч", "матча", "матчей")} ·{" "}
                      {pluralize(tournament._count.divisions, "дивизион", "дивизиона", "дивизионов")}
                    </p>
                  </div>
                  <Badge
                    tone={
                      tournament.status === "ONGOING"
                        ? "win"
                        : tournament.status === "UPCOMING"
                          ? "brand"
                          : "neutral"
                    }
                  >
                    {tournament.status === "ONGOING"
                      ? "Идёт"
                      : tournament.status === "UPCOMING"
                        ? "Скоро"
                        : "Завершён"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
