import Link from "next/link";
import { notFound } from "next/navigation";

import { RosterManager, type RosterEntryData } from "@/components/RosterManager";
import { PageTitle, buttonClass } from "@/components/ui";
import { shortName } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { rosterOrderBy } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Заявка команды" };

export default async function AdminRosterPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  const tournamentId = Number(id);
  const tournamentTeamId = Number(entryId);
  if (!Number.isInteger(tournamentId) || !Number.isInteger(tournamentTeamId)) notFound();

  const entry = await prisma.tournamentTeam.findUnique({
    where: { id: tournamentTeamId },
    select: {
      id: true,
      tournamentId: true,
      division: { select: { name: true } },
      team: { select: { name: true } },
      tournament: { select: { name: true, season: true } },
      roster: {
        orderBy: rosterOrderBy,
        select: {
          id: true,
          shirtNumber: true,
          position: true,
          isCaptain: true,
          _count: { select: { events: true, lineups: true } },
          player: { select: { id: true, firstName: true, lastName: true, course: true } },
        },
      },
    },
  });

  if (!entry || entry.tournamentId !== tournamentId) notFound();

  const takenIds = new Set(entry.roster.map((r) => r.player.id));
  const allPlayers = await prisma.player.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  const roster: RosterEntryData[] = entry.roster.map((r) => ({
    id: r.id,
    shirtNumber: r.shirtNumber,
    position: r.position,
    isCaptain: r.isCaptain,
    locked: r._count.events > 0 || r._count.lineups > 0,
    player: { id: r.player.id, name: shortName(r.player), course: r.player.course },
  }));

  return (
    <div>
      <PageTitle
        title={`Заявка: ${entry.team.name}`}
        subtitle={`${entry.tournament.name} ${entry.tournament.season}${
          entry.division ? ` · ${entry.division.name}` : ""
        }`}
        action={
          <Link href={`/admin/tournaments/${tournamentId}`} className={buttonClass("secondary")}>
            К турниру
          </Link>
        }
      />
      <RosterManager
        tournamentTeamId={entry.id}
        title="Состав команды"
        roster={roster}
        availablePlayers={allPlayers
          .filter((player) => !takenIds.has(player.id))
          .map((player) => ({ id: player.id, name: shortName(player) }))}
      />
    </div>
  );
}
