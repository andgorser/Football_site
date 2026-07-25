import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamCrest } from "@/components/TeamCrest";
import { Card, CardHeader, EmptyState, PageTitle } from "@/components/ui";
import {
  EVENT_ICON,
  EVENT_LABEL,
  MSU_STATUS_LABEL,
  POSITION_LABEL,
  ageFrom,
  compareEvents,
  formatMinute,
  fullName,
} from "@/lib/football";
import { formatShortDate, pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getPlayerStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await prisma.player.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: player ? `${player.lastName} ${player.firstName}` : "Игрок" };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const player = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      birthDate: true,
      photoUrl: true,
      course: true,
      msuStatus: true,
      preferredPosition: true,
      faculty: { select: { name: true, shortName: true } },
      rosterEntries: {
        orderBy: { tournamentTeam: { tournament: { startDate: "desc" } } },
        select: {
          id: true,
          shirtNumber: true,
          position: true,
          isCaptain: true,
          tournamentTeam: {
            select: {
              team: {
                select: { id: true, slug: true, name: true, shortName: true, logoUrl: true, primaryColor: true },
              },
              tournament: { select: { slug: true, name: true, season: true } },
            },
          },
        },
      },
    },
  });

  if (!player) notFound();

  const rosterIds = player.rosterEntries.map((entry) => entry.id);

  const [stats, events] = await Promise.all([
    getPlayerStats({ playerId: player.id }),
    prisma.matchEvent.findMany({
      where: {
        OR: [{ playerId: { in: rosterIds } }, { assistPlayerId: { in: rosterIds } }],
        match: { status: { in: ["FINISHED", "WALKOVER"] } },
      },
      orderBy: { match: { kickoffAt: "desc" } },
      take: 40,
      select: {
        id: true,
        type: true,
        minute: true,
        extraMinute: true,
        playerId: true,
        assistPlayerId: true,
        match: {
          select: {
            id: true,
            kickoffAt: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { team: { select: { shortName: true } } } },
            awayTeam: { select: { team: { select: { shortName: true } } } },
          },
        },
      },
    }),
  ]);

  const total = stats[0] ?? {
    matches: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
  };

  const age = ageFrom(player.birthDate);
  const currentEntry = player.rosterEntries[0];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        {player.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.photoUrl} alt="" className="size-20 rounded-full object-cover" />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full bg-surface-3 text-2xl font-bold text-muted">
            {player.lastName.charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <PageTitle
            title={fullName(player)}
            subtitle={
              <>
                {player.preferredPosition ? POSITION_LABEL[player.preferredPosition] : "Позиция не указана"}
                {age !== null ? ` · ${pluralize(age, "год", "года", "лет")}` : ""}
                {currentEntry?.shirtNumber ? ` · №${currentEntry.shirtNumber}` : ""}
              </>
            }
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>{MSU_STATUS_LABEL[player.msuStatus]}</span>
            {player.faculty ? <span>{player.faculty.name}</span> : null}
            {player.course ? <span>{player.course} курс</span> : null}
          </div>
          {currentEntry ? (
            <Link
              href={`/teams/${currentEntry.tournamentTeam.team.slug}`}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-3"
            >
              <TeamCrest team={currentEntry.tournamentTeam.team} size="sm" />
              {currentEntry.tournamentTeam.team.name}
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Матчей" value={total.matches} />
        <StatTile label="Голов" value={total.goals} tone="text-win" />
        <StatTile label="Передач" value={total.assists} />
        <StatTile label="Жёлтых" value={total.yellowCards} tone="text-warning" />
        <StatTile label="Красных" value={total.redCards} tone="text-loss" />
      </div>

      <Card>
        <CardHeader title="Последние события" subtitle="Голы, передачи и карточки в сыгранных матчах" />
        {events.length === 0 ? (
          <EmptyState title="Событий пока нет" />
        ) : (
          <ul className="divide-y divide-border">
            {[...events].sort(compareEvents).map((event) => {
              const isAssist =
                event.assistPlayerId !== null && rosterIds.includes(event.assistPlayerId);
              const label = isAssist && !rosterIds.includes(event.playerId ?? -1)
                ? "Голевая передача"
                : EVENT_LABEL[event.type];
              return (
                <li key={event.id}>
                  <Link
                    href={`/matches/${event.match.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-2"
                  >
                    <span className="shrink-0 text-base">
                      {isAssist ? "🅰" : EVENT_ICON[event.type]}
                    </span>
                    <span className="w-11 shrink-0 text-xs text-muted tabular-nums">
                      {formatMinute(event)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{label}</span>
                      <span className="ml-2 text-muted">
                        {event.match.homeTeam?.team.shortName ?? "?"} {event.match.homeScore}:
                        {event.match.awayScore} {event.match.awayTeam?.team.shortName ?? "?"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-subtle">
                      {formatShortDate(event.match.kickoffAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {player.rosterEntries.length > 0 ? (
        <Card>
          <CardHeader title="Заявки по турнирам" />
          <ul className="divide-y divide-border">
            {player.rosterEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <Link
                  href={`/tournaments/${entry.tournamentTeam.tournament.slug}`}
                  className="truncate hover:underline"
                >
                  {entry.tournamentTeam.tournament.name}
                  <span className="ml-2 text-xs text-muted">
                    {entry.tournamentTeam.tournament.season}
                  </span>
                </Link>
                <Link
                  href={`/teams/${entry.tournamentTeam.team.slug}`}
                  className="flex shrink-0 items-center gap-1.5 text-muted hover:underline"
                >
                  <TeamCrest team={entry.tournamentTeam.team} size="sm" />
                  {entry.tournamentTeam.team.shortName}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
    </Card>
  );
}
