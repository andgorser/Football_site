import Link from "next/link";

import { Badge, Card, EmptyState, PageTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatDate, pluralize } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Турниры" };

const STATUS_TONE = {
  ONGOING: "win",
  UPCOMING: "brand",
  FINISHED: "neutral",
} as const;

const STATUS_LABEL = {
  ONGOING: "Идёт",
  UPCOMING: "Скоро",
  FINISHED: "Завершён",
} as const;

const FORMAT_LABEL = {
  LEAGUE: "Круговой турнир",
  GROUPS_PLAYOFF: "Группы + плей-офф",
  CUP: "Кубок на вылет",
} as const;

export default async function TournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      season: true,
      status: true,
      format: true,
      startDate: true,
      endDate: true,
      description: true,
      _count: { select: { entries: true, matches: true } },
    },
  });

  return (
    <div>
      <PageTitle title="Турниры" subtitle="Все соревнования университета" />

      {tournaments.length === 0 ? (
        <Card>
          <EmptyState title="Турниров пока нет" hint="Организатор ещё не создал ни одного турнира." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tournaments.map((tournament) => (
            <Link key={tournament.id} href={`/tournaments/${tournament.slug}`}>
              <Card className="h-full p-4 transition-colors hover:border-brand">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-tight">{tournament.name}</h2>
                  <Badge tone={STATUS_TONE[tournament.status]}>
                    {STATUS_LABEL[tournament.status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  Сезон {tournament.season} · {FORMAT_LABEL[tournament.format]}
                </p>
                {tournament.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{tournament.description}</p>
                ) : null}
                <p className="mt-3 text-xs text-subtle">
                  {pluralize(tournament._count.entries, "команда", "команды", "команд")} ·{" "}
                  {pluralize(tournament._count.matches, "матч", "матча", "матчей")} · старт{" "}
                  {formatDate(tournament.startDate)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
