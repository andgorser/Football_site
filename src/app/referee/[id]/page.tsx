import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { MatchEventType } from "@prisma/client";

import {
  RefereeConsole,
  type ConsoleEvent,
  type ConsoleRoster,
  type ConsoleTeam,
} from "@/app/referee/[id]/RefereeConsole";
import { Card, buttonClass } from "@/components/ui";
import { canEditMatch, isAssignedReferee, requireUser } from "@/lib/auth";
import { compareEvents, halfDurationOf, shortName } from "@/lib/football";
import { formatDateTimeOrTbd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { rosterOrderBy } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ведение матча" };

/** Кто сейчас на поле: старт минус удалённые и заменённые плюс вышедшие. */
function computeOnPitch(
  roster: { id: number }[],
  starters: Set<number>,
  events: { type: MatchEventType; playerId: number | null; relatedPlayerId: number | null }[],
  hasLineup: boolean,
): Set<number> {
  // Если состав не заполнен, считаем доступными всех заявленных —
  // иначе судья не сможет записать вообще ничего.
  const onPitch = hasLineup ? new Set(starters) : new Set(roster.map((r) => r.id));

  for (const event of events) {
    if (event.type === "SUBSTITUTION") {
      if (event.relatedPlayerId) onPitch.delete(event.relatedPlayerId);
      if (event.playerId) onPitch.add(event.playerId);
    }
    if (event.type === "RED_CARD" || event.type === "SECOND_YELLOW_CARD") {
      if (event.playerId) onPitch.delete(event.playerId);
    }
  }
  return onPitch;
}

export default async function RefereeMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const user = await requireUser(`/referee/${id}`);

  const found = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      tournament: { select: { name: true, season: true, halfDurationMin: true } },
      division: { select: { name: true, halfDurationMin: true } },
      venue: { select: { name: true } },
      referee: { select: { fullName: true } },
      homeTeam: {
        select: {
          id: true,
          team: { select: { name: true, shortName: true, logoUrl: true, primaryColor: true } },
          roster: {
            orderBy: rosterOrderBy,
            select: {
              id: true,
              shirtNumber: true,
              position: true,
              player: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          team: { select: { name: true, shortName: true, logoUrl: true, primaryColor: true } },
          roster: {
            orderBy: rosterOrderBy,
            select: {
              id: true,
              shirtNumber: true,
              position: true,
              player: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      lineups: { select: { rosterEntryId: true, isStarting: true } },
      events: {
        include: {
          player: { select: { player: { select: { firstName: true, lastName: true } } } },
          assistPlayer: { select: { player: { select: { firstName: true, lastName: true } } } },
          relatedPlayer: { select: { player: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });

  if (!found) notFound();
  if (!canEditMatch(user)) redirect("/403");

  // Матч плей-офф может быть создан заранее, когда участники ещё не известны.
  // Протокол вести нечем, поэтому объясняем это вместо ошибки.
  if (!found.homeTeam || !found.awayTeam) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="p-6 text-center">
          <p className="text-lg font-semibold">Участники матча ещё не определены</p>
          <p className="mt-2 text-sm text-muted">
            Это матч плей-офф: команды подставятся автоматически, как только определятся
            их источники — места в дивизионах или результаты предыдущих матчей.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href={`/matches/${found.id}`} className={buttonClass("secondary")}>
              Открыть страницу матча
            </Link>
            <Link href="/referee" className={buttonClass("outline")}>
              К списку матчей
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const match = { ...found, homeTeam: found.homeTeam, awayTeam: found.awayTeam };
  const sortedEvents = [...match.events].sort(compareEvents);

  function buildTeam(side: typeof match.homeTeam): ConsoleTeam {
    const lineupIds = new Set(
      match.lineups
        .filter((l) => side.roster.some((r) => r.id === l.rosterEntryId))
        .map((l) => l.rosterEntryId),
    );
    const starters = new Set(
      match.lineups.filter((l) => l.isStarting && lineupIds.has(l.rosterEntryId)).map((l) => l.rosterEntryId),
    );
    const onPitch = computeOnPitch(side.roster, starters, sortedEvents, lineupIds.size > 0);

    const roster: ConsoleRoster[] = side.roster.map((entry) => ({
      id: entry.id,
      shirtNumber: entry.shirtNumber,
      position: entry.position,
      name: shortName(entry.player),
      onPitch: onPitch.has(entry.id),
    }));

    return {
      entryId: side.id,
      name: side.team.name,
      shortName: side.team.shortName,
      logoUrl: side.team.logoUrl,
      primaryColor: side.team.primaryColor,
      roster,
    };
  }

  const events: ConsoleEvent[] = sortedEvents.map((event) => ({
    id: event.id,
    type: event.type,
    minute: event.minute,
    extraMinute: event.extraMinute,
    tournamentTeamId: event.tournamentTeamId,
    playerId: event.playerId,
    assistPlayerId: event.assistPlayerId,
    relatedPlayerId: event.relatedPlayerId,
    playerName: event.player ? shortName(event.player.player) : null,
    assistName: event.assistPlayer ? shortName(event.assistPlayer.player) : null,
    relatedName: event.relatedPlayer ? shortName(event.relatedPlayer.player) : null,
  }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted">
          <p>{formatDateTimeOrTbd(match.kickoffAt, match.kickoffTbd)}</p>
          {match.venue ? <p>{match.venue.name}</p> : null}
        </div>
        <div className="flex gap-2">
          <Link href={`/referee/${match.id}/lineup`} className={buttonClass("outline", "text-xs")}>
            Составы
          </Link>
          <Link href={`/matches/${match.id}`} className={buttonClass("secondary", "text-xs")}>
            Как видят зрители
          </Link>
        </div>
      </div>

      <RefereeConsole
        match={{
          id: match.id,
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeShootoutScore: match.homeShootoutScore,
          awayShootoutScore: match.awayShootoutScore,
          periodStartedAt: match.periodStartedAt?.toISOString() ?? null,
          clockOffsetSec: match.clockOffsetSec,
          halfDurationMin: halfDurationOf(match.division, match.tournament),
          kickoffAt: match.kickoffAt.toISOString(),
          tournamentName: `${match.tournament.name}${match.division ? ` · ${match.division.name}` : ""}${
            match.round ? ` · ${match.round}-й тур` : ""
          }`,
          notes: match.notes,
          home: buildTeam(match.homeTeam),
          away: buildTeam(match.awayTeam),
          events,
        }}
        assignment={{
          assigned: isAssignedReferee(user, match),
          refereeName: match.referee?.fullName ?? null,
        }}
      />
    </div>
  );
}
