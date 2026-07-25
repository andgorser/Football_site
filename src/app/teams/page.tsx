import Link from "next/link";

import { TeamCrest } from "@/components/TeamCrest";
import { Card, EmptyState, PageTitle } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Команды" };

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      logoUrl: true,
      primaryColor: true,
      faculty: { select: { shortName: true } },
      _count: { select: { entries: true } },
    },
  });

  return (
    <div>
      <PageTitle title="Команды" subtitle="Сборные факультетов и другие участники" />

      {teams.length === 0 ? (
        <Card>
          <EmptyState title="Команд пока нет" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link key={team.id} href={`/teams/${team.slug}`}>
              <Card className="flex h-full items-center gap-3 p-4 transition-colors hover:border-brand">
                <TeamCrest team={team} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{team.name}</p>
                  <p className="truncate text-xs text-muted">
                    {team.faculty?.shortName ?? "Без факультета"}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
