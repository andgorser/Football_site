import Link from "next/link";
import { notFound } from "next/navigation";

import { LiveMinute } from "@/components/LiveMinute";
import { LiveRefresher } from "@/components/LiveRefresher";
import { TeamCrest } from "@/components/TeamCrest";
import { Badge, Card, CardHeader, EmptyState, LiveBadge, buttonClass } from "@/components/ui";
import { canEditMatch, getCurrentUser, isAssignedReferee } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  EVENT_ICON,
  EVENT_LABEL,
  MATCH_STAGE_LABEL,
  MATCH_STATUS_LABEL,
  POSITION_SHORT,
  compareEvents,
  currentMinute,
  formatMinute,
  isLive,
  shortName,
} from "@/lib/football";
import { formatDateTimeOrTbd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { slotLabel } from "@/lib/playoff";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id: Number(id) },
    select: {
      homeTeam: { select: { team: { select: { shortName: true } } } },
      awayTeam: { select: { team: { select: { shortName: true } } } },
      homeScore: true,
      awayScore: true,
    },
  });
  if (!match) return { title: "Матч" };
  const score =
    match.homeScore !== null && match.awayScore !== null
      ? ` ${match.homeScore}:${match.awayScore}`
      : "";
  return {
    title: `${match.homeTeam?.team.shortName ?? "?"} — ${match.awayTeam?.team.shortName ?? "?"}${score}`,
  };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const [match, user] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: { select: { slug: true, name: true, season: true } },
        division: { select: { name: true } },
        venue: { select: { name: true, address: true } },
        referee: { select: { fullName: true } },
        homeSourceDivision: { select: { name: true } },
        awaySourceDivision: { select: { name: true } },
        homeSourceMatch: { select: { id: true, stage: true } },
        awaySourceMatch: { select: { id: true, stage: true } },
        homeTeam: { select: { id: true, team: true } },
        awayTeam: { select: { id: true, team: true } },
        events: {
          include: {
            player: { select: { player: true } },
            assistPlayer: { select: { player: true } },
            relatedPlayer: { select: { player: true } },
          },
        },
        lineups: {
          // Без явного порядка база возвращает состав как придётся.
          // Номер берём из снапшота состава, поэтому и сортируем по нему.
          orderBy: [
            { isStarting: "desc" },
            { shirtNumber: { sort: "asc", nulls: "last" } },
            { rosterEntry: { player: { lastName: "asc" } } },
            { id: "asc" },
          ],
          include: {
            rosterEntry: {
              select: {
                id: true,
                shirtNumber: true,
                position: true,
                tournamentTeamId: true,
                player: true,
              },
            },
          },
        },
      },
    }),
    getCurrentUser(),
  ]);

  if (!match) notFound();

  const live = isLive(match.status);
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const events = [...match.events].sort(compareEvents);
  const canEdit = canEditMatch(user);
  const assigned = isAssignedReferee(user, match);

  const homeSlot = {
    source: match.homeSource,
    divisionName: match.homeSourceDivision?.name,
    place: match.homeSourcePlace,
    sourceMatchId: match.homeSourceMatchId,
    sourceMatchStage: match.homeSourceMatch?.stage,
    label: match.homeSourceLabel,
  };
  const awaySlot = {
    source: match.awaySource,
    divisionName: match.awaySourceDivision?.name,
    place: match.awaySourcePlace,
    sourceMatchId: match.awaySourceMatchId,
    sourceMatchStage: match.awaySourceMatch?.stage,
    label: match.awaySourceLabel,
  };

  return (
    <div className="space-y-4">
      {live ? <LiveRefresher /> : null}

      {/* Шапка матча */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
          <Link href={`/tournaments/${match.tournament.slug}`} className="truncate text-muted hover:underline">
            {match.tournament.name}
            {match.division ? ` · ${match.division.name}` : ""}
            {match.round ? ` · ${match.round}-й тур` : ""}
            {match.stage !== "REGULAR" ? ` · ${MATCH_STAGE_LABEL[match.stage]}` : ""}
          </Link>
          {canEdit ? (
            <Link href={`/referee/${match.id}`} className={buttonClass("secondary", "px-2 py-1 text-xs")}>
              {assigned ? "Вести матч" : "Открыть протокол"}
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-5 sm:gap-4 sm:px-6">
          <TeamColumn entry={match.homeTeam} placeholder={slotLabel(homeSlot)} />

          <div className="flex flex-col items-center gap-1">
            {hasScore || live ? (
              <p className="text-4xl font-black tabular-nums sm:text-5xl">
                {match.homeScore ?? 0}
                <span className="mx-1 text-muted">:</span>
                {match.awayScore ?? 0}
              </p>
            ) : (
              <p className="text-2xl font-bold text-muted">—</p>
            )}

            {match.homeShootoutScore !== null && match.awayShootoutScore !== null ? (
              <p className="text-xs text-muted">
                по пенальти {match.homeShootoutScore}:{match.awayShootoutScore}
              </p>
            ) : null}

            {live ? (
              <div className="flex items-center gap-1.5">
                <LiveBadge label={MATCH_STATUS_LABEL[match.status]} />
                <LiveMinute
                  status={match.status}
                  periodStartedAt={match.periodStartedAt?.toISOString() ?? null}
                  clockOffsetSec={match.clockOffsetSec}
                  initialMinute={currentMinute(match)}
                  className="text-sm font-bold text-live"
                />
              </div>
            ) : (
              <Badge tone={match.status === "FINISHED" ? "neutral" : "warning"}>
                {MATCH_STATUS_LABEL[match.status]}
              </Badge>
            )}
          </div>

          <TeamColumn entry={match.awayTeam} placeholder={slotLabel(awaySlot)} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted">
          <span>{formatDateTimeOrTbd(match.kickoffAt, match.kickoffTbd)}</span>
          {match.venue ? <span>{match.venue.name}</span> : null}
          {match.referee ? <span>Судья: {match.referee.fullName}</span> : null}
          {match.notes ? <span className="text-warning">{match.notes}</span> : null}
        </div>
      </Card>

      {/* Хроника */}
      <Card>
        <CardHeader title="Хроника матча" />
        {events.length === 0 ? (
          <EmptyState
            title={live ? "Пока без событий" : "Событий не зафиксировано"}
            hint={live ? "Как только что-то произойдёт, оно появится здесь." : undefined}
          />
        ) : (
          <ol className="divide-y divide-border">
            {events.map((event) => {
              const isHome = event.tournamentTeamId === match.homeTeam?.id;
              return (
                <li
                  key={event.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 text-sm",
                    !isHome && "flex-row-reverse text-right",
                  )}
                >
                  <span className="w-11 shrink-0 text-xs font-semibold text-muted tabular-nums">
                    {formatMinute(event)}
                  </span>
                  <span className="shrink-0 text-base" title={EVENT_LABEL[event.type]}>
                    {EVENT_ICON[event.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {event.player ? (
                        <Link href={`/players/${event.player.player.id}`} className="hover:underline">
                          {shortName(event.player.player)}
                        </Link>
                      ) : (
                        EVENT_LABEL[event.type]
                      )}
                      {event.type === "OWN_GOAL" ? (
                        <span className="ml-1 text-xs font-normal text-loss">(в свои)</span>
                      ) : null}
                      {event.type === "PENALTY_GOAL" ? (
                        <span className="ml-1 text-xs font-normal text-muted">(пен.)</span>
                      ) : null}
                    </p>
                    {event.assistPlayer ? (
                      <p className="truncate text-xs text-muted">
                        пас: {shortName(event.assistPlayer.player)}
                      </p>
                    ) : null}
                    {event.type === "SUBSTITUTION" && event.relatedPlayer ? (
                      <p className="truncate text-xs text-muted">
                        вместо {shortName(event.relatedPlayer.player)}
                      </p>
                    ) : null}
                    {event.note ? (
                      <p className="truncate text-xs text-subtle">{event.note}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Составы */}
      <div className="grid gap-4 md:grid-cols-2">
        <LineupCard
          title={match.homeTeam?.team.name ?? slotLabel(homeSlot)}
          lineups={match.lineups.filter((l) => l.rosterEntry.tournamentTeamId === match.homeTeam?.id)}
        />
        <LineupCard
          title={match.awayTeam?.team.name ?? slotLabel(awaySlot)}
          lineups={match.lineups.filter((l) => l.rosterEntry.tournamentTeamId === match.awayTeam?.id)}
        />
      </div>
    </div>
  );
}

function TeamColumn({
  entry,
  placeholder,
}: {
  entry: {
    team: { slug: string; name: string; shortName: string; logoUrl: string | null; primaryColor: string | null };
  } | null;
  placeholder: string;
}) {
  // Участник плей-офф ещё не определился — показываем, откуда он придёт
  if (!entry) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-border text-2xl text-subtle">
          ?
        </span>
        <span className="text-xs italic leading-tight text-muted">{placeholder}</span>
      </div>
    );
  }

  return (
    <Link
      href={`/teams/${entry.team.slug}`}
      className="flex flex-col items-center gap-2 text-center hover:underline"
    >
      <TeamCrest team={entry.team} size="xl" />
      <span className="text-sm font-semibold leading-tight">{entry.team.shortName}</span>
    </Link>
  );
}

type LineupRow = {
  id: number;
  isStarting: boolean;
  // Номер и позиция — снапшот на момент подачи состава: если игроку потом
  // сменят номер в заявке, протокол сыгранного матча не должен переписаться.
  shirtNumber: number | null;
  position: string | null;
  rosterEntry: {
    shirtNumber: number | null;
    position: string | null;
    player: { id: string; firstName: string; lastName: string };
  };
};

function LineupCard({ title, lineups }: { title: string; lineups: LineupRow[] }) {
  const starters = lineups.filter((l) => l.isStarting);
  const bench = lineups.filter((l) => !l.isStarting);

  return (
    <Card>
      <CardHeader title={title} subtitle="Состав на матч" />
      {lineups.length === 0 ? (
        <EmptyState title="Состав не заявлен" />
      ) : (
        <div className="px-2 py-2">
          <PlayerGroup label="Стартовый состав" rows={starters} />
          {bench.length > 0 ? <PlayerGroup label="Запасные" rows={bench} muted /> : null}
        </div>
      )}
    </Card>
  );
}

function PlayerGroup({
  label,
  rows,
  muted,
}: {
  label: string;
  rows: LineupRow[];
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {label}
      </p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/players/${row.rosterEntry.player.id}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2",
                muted && "text-muted",
              )}
            >
              <span className="w-6 shrink-0 text-right text-xs text-subtle tabular-nums">
                {row.shirtNumber ?? row.rosterEntry.shirtNumber ?? "—"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {shortName(row.rosterEntry.player)}
              </span>
              {(row.position ?? row.rosterEntry.position) ? (
                <span className="shrink-0 text-[11px] font-semibold text-subtle">
                  {
                    POSITION_SHORT[
                      (row.position ?? row.rosterEntry.position) as keyof typeof POSITION_SHORT
                    ]
                  }
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
