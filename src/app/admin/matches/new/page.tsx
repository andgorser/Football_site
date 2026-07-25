import Link from "next/link";

import { ActionForm } from "@/components/admin/ActionForm";
import { MatchFields } from "@/components/admin/MatchFields";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { saveMatch } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Новый матч" };

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ tournament?: string }>;
}) {
  const { tournament: tournamentParam } = await searchParams;
  const tournamentId = tournamentParam ? Number(tournamentParam) : null;

  const tournaments = await prisma.tournament.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, season: true },
  });

  // Сначала турнир — от него зависит список команд, поэтому выбираем его отдельно.
  if (!tournamentId) {
    return (
      <div className="max-w-2xl">
        <PageTitle title="Новый матч" subtitle="Сначала выберите турнир" />
        <Card>
          {tournaments.length === 0 ? (
            <EmptyState title="Сначала создайте турнир" />
          ) : (
            <ul className="divide-y divide-border">
              {tournaments.map((tournament) => (
                <li key={tournament.id}>
                  <Link
                    href={`/admin/matches/new?tournament=${tournament.id}`}
                    className="block px-4 py-3 text-sm transition-colors hover:bg-surface-2"
                  >
                    {tournament.name}
                    <span className="ml-2 text-xs text-muted">{tournament.season}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  const [tournament, venues, referees] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        season: true,
        divisions: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
        entries: {
          orderBy: { team: { name: "asc" } },
          select: { id: true, team: { select: { name: true } } },
        },
      },
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: { in: ["REFEREE", "ADMIN"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  if (!tournament) {
    return (
      <Card>
        <EmptyState title="Турнир не найден" />
      </Card>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageTitle title="Новый матч" subtitle={`${tournament.name} ${tournament.season}`} />
      <Card className="p-4">
        {tournament.entries.length < 2 ? (
          <EmptyState
            title="В турнире меньше двух команд"
            hint="Сначала заявите команды на странице турнира."
          />
        ) : (
          <ActionForm action={saveMatch.bind(null, null)} submitLabel="Создать матч">
            <MatchFields
              data={{
                tournamentId: tournament.id,
                divisions: tournament.divisions,
                entries: tournament.entries,
                venues,
                referees,
              }}
            />
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
