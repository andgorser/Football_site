import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/ActionForm";
import { TeamFields } from "@/components/admin/EntityFields";
import { Card, CardHeader, PageTitle, buttonClass } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { saveTeam } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Команда — управление" };

export default async function AdminTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [team, faculties] = await Promise.all([
    prisma.team.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        shortName: true,
        facultyId: true,
        primaryColor: true,
        foundedYear: true,
        logoUrl: true,
        description: true,
        entries: {
          orderBy: { tournament: { startDate: "desc" } },
          select: {
            id: true,
            tournament: { select: { id: true, name: true, season: true } },
            division: { select: { name: true } },
            _count: { select: { roster: true } },
          },
        },
      },
    }),
    prisma.faculty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
  ]);

  if (!team) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle
        title={team.name}
        action={
          <Link href={`/teams/${team.slug}`} className={buttonClass("secondary")}>
            Открыть на сайте
          </Link>
        }
      />

      <Card className="p-4">
        <ActionForm action={saveTeam.bind(null, team.id)}>
          <TeamFields faculties={faculties} defaults={team} />
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Участие в турнирах" subtitle="Заявка состава редактируется в турнире" />
        {team.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Команда никуда не заявлена</p>
        ) : (
          <ul className="divide-y divide-border">
            {team.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link
                  href={`/admin/tournaments/${entry.tournament.id}`}
                  className="truncate hover:underline"
                >
                  {entry.tournament.name}
                  <span className="ml-2 text-xs text-muted">{entry.tournament.season}</span>
                </Link>
                <span className="shrink-0 text-xs text-subtle">
                  {entry.division?.name ?? "без дивизиона"} · {entry._count.roster} игроков
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
