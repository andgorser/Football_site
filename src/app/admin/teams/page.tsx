import Link from "next/link";

import { ActionForm } from "@/components/admin/ActionForm";
import { TeamFields } from "@/components/admin/EntityFields";
import { TeamCrest } from "@/components/TeamCrest";
import { Card, CardHeader, PageTitle } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { saveTeam } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Команды — управление" };

export default async function AdminTeamsPage() {
  const [teams, faculties] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        shortName: true,
        logoUrl: true,
        primaryColor: true,
        faculty: { select: { shortName: true } },
        _count: { select: { entries: true } },
      },
    }),
    prisma.faculty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle title="Команды" subtitle={pluralize(teams.length, "команда", "команды", "команд")} />

      <Card>
        <CardHeader title="Список команд" />
        <ul className="divide-y divide-border">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/admin/teams/${team.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
              >
                <TeamCrest team={team} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{team.name}</span>
                <span className="shrink-0 text-xs text-subtle">
                  {team.faculty?.shortName ?? "—"} · в {team._count.entries} турнирах
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Новая команда" />
        <div className="p-4">
          <ActionForm action={saveTeam.bind(null, null)} submitLabel="Создать команду" resetOnSuccess>
            <TeamFields faculties={faculties} />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
