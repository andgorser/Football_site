import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/ActionForm";
import { PlayerFields } from "@/components/admin/EntityFields";
import { Card, CardHeader, PageTitle, buttonClass } from "@/components/ui";
import { fullName } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { savePlayer } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Игрок — управление" };

export default async function AdminPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [player, faculties] = await Promise.all([
    prisma.player.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        birthDate: true,
        facultyId: true,
        course: true,
        msuStatus: true,
        preferredPosition: true,
        photoUrl: true,
        rosterEntries: {
          select: {
            id: true,
            shirtNumber: true,
            tournamentTeam: {
              select: {
                team: { select: { name: true } },
                tournament: { select: { id: true, name: true, season: true } },
              },
            },
          },
        },
      },
    }),
    prisma.faculty.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
  ]);

  if (!player) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle
        title={fullName(player)}
        action={
          <Link href={`/players/${player.id}`} className={buttonClass("secondary")}>
            Открыть на сайте
          </Link>
        }
      />

      <Card className="p-4">
        <ActionForm action={savePlayer.bind(null, player.id)}>
          <PlayerFields faculties={faculties} defaults={player} />
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Заявки" />
        {player.rosterEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Игрок нигде не заявлен</p>
        ) : (
          <ul className="divide-y divide-border">
            {player.rosterEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">
                  {entry.tournamentTeam.team.name}
                  {entry.shirtNumber ? <span className="ml-2 text-xs text-muted">№{entry.shirtNumber}</span> : null}
                </span>
                <Link
                  href={`/admin/tournaments/${entry.tournamentTeam.tournament.id}`}
                  className="shrink-0 text-xs text-brand hover:underline"
                >
                  {entry.tournamentTeam.tournament.name} {entry.tournamentTeam.tournament.season}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
