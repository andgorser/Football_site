import Link from "next/link";

import { MatchList } from "@/components/MatchRow";
import { RosterManager, type RosterEntryData } from "@/components/RosterManager";
import { TeamCrest } from "@/components/TeamCrest";
import { Card, CardHeader, EmptyState, PageTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { shortName } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { matchCardArgs, rosterOrderBy } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Моя команда" };

export default async function CaptainPage() {
  const user = await requireRole(["CAPTAIN"], "/captain");

  if (!user.teamId) {
    return (
      <Card>
        <EmptyState
          title="Аккаунт не привязан к команде"
          hint="Попросите организатора привязать ваш аккаунт к команде."
        />
      </Card>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: user.teamId },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      logoUrl: true,
      primaryColor: true,
      entries: {
        orderBy: { tournament: { startDate: "desc" } },
        select: {
          id: true,
          tournament: { select: { id: true, name: true, season: true, status: true } },
          division: { select: { name: true } },
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
      },
    },
  });

  if (!team) {
    return (
      <Card>
        <EmptyState title="Команда не найдена" />
      </Card>
    );
  }

  const [allPlayers, matches] = await Promise.all([
    prisma.player.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.match.findMany({
      where: { OR: [{ homeTeam: { teamId: team.id } }, { awayTeam: { teamId: team.id } }] },
      orderBy: { kickoffAt: "desc" },
      take: 10,
      ...matchCardArgs,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TeamCrest team={team} size="lg" />
        <PageTitle
          title={team.name}
          subtitle={
            <Link href={`/teams/${team.slug}`} className="text-brand hover:underline">
              Страница команды на сайте →
            </Link>
          }
        />
      </div>

      {team.entries.length === 0 ? (
        <Card>
          <EmptyState
            title="Команда не заявлена ни в один турнир"
            hint="Как только организатор заявит команду, здесь появится заявка состава."
          />
        </Card>
      ) : (
        team.entries.map((entry) => {
          const takenIds = new Set(entry.roster.map((r) => r.player.id));
          const roster: RosterEntryData[] = entry.roster.map((r) => ({
            id: r.id,
            shirtNumber: r.shirtNumber,
            position: r.position,
            isCaptain: r.isCaptain,
            locked: r._count.events > 0 || r._count.lineups > 0,
            player: {
              id: r.player.id,
              name: shortName(r.player),
              course: r.player.course,
            },
          }));

          return (
            <RosterManager
              key={entry.id}
              tournamentTeamId={entry.id}
              title={`${entry.tournament.name} ${entry.tournament.season}`}
              subtitle={`${entry.division?.name ?? "без дивизиона"} · ${entry.roster.length} игроков`}
              roster={roster}
              availablePlayers={allPlayers
                .filter((player) => !takenIds.has(player.id))
                .map((player) => ({ id: player.id, name: shortName(player) }))}
            />
          );
        })
      )}

      <Card>
        <CardHeader title="Матчи команды" />
        {matches.length === 0 ? (
          <EmptyState title="Матчей пока нет" />
        ) : (
          <MatchList matches={matches} showDate showTournament highlightTeamId={team.id} />
        )}
      </Card>
    </div>
  );
}
