import Link from "next/link";

import { LiveMinute } from "@/components/LiveMinute";
import { TeamCrest } from "@/components/TeamCrest";
import { cn } from "@/lib/cn";
import { currentMinute, isLive, isPlayed, MATCH_STATUS_SHORT } from "@/lib/football";
import { formatShortDate, formatTime, TBD_TIME_SHORT } from "@/lib/format";
import { awaySlotOf, homeSlotOf, slotLabel } from "@/lib/playoff";
import type { MatchCard } from "@/lib/queries";

/**
 * Строка матча в списке — основной «кирпич» всего сайта.
 * Слева время или статус, справа две команды со счётом.
 * Победитель выделен жирным, как на привычных футбольных сайтах.
 */
export function MatchRow({
  match,
  showDate = false,
  showTournament = false,
  highlightTeamId,
}: {
  match: MatchCard;
  showDate?: boolean;
  showTournament?: boolean;
  /** id команды (Team.id), который нужно выделить — для страницы команды */
  highlightTeamId?: string;
}) {
  const live = isLive(match.status);
  const played = isPlayed(match.status);
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  const homeWon = hasScore && match.homeScore! > match.awayScore!;
  const awayWon = hasScore && match.awayScore! > match.homeScore!;

  const cancelled = match.status === "CANCELLED" || match.status === "POSTPONED";

  return (
    <Link
      href={`/matches/${match.id}`}
      className="flex items-stretch gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      {/* Левая колонка: время / статус */}
      <div className="flex w-14 shrink-0 flex-col items-start justify-center gap-0.5 border-r border-border pr-2 text-xs">
        {live ? (
          <>
            <span className="font-semibold text-live">{MATCH_STATUS_SHORT[match.status]}</span>
            <LiveMinute
              status={match.status}
              periodStartedAt={match.periodStartedAt?.toISOString() ?? null}
              clockOffsetSec={match.clockOffsetSec}
              initialMinute={currentMinute(match)}
              className="live-dot font-semibold text-live"
            />
          </>
        ) : (
          <>
            {showDate ? (
              <span className="text-subtle">{formatShortDate(match.kickoffAt)}</span>
            ) : null}
            <span className={cn(played ? "text-subtle" : "font-medium text-muted")}>
              {match.kickoffTbd ? TBD_TIME_SHORT : formatTime(match.kickoffAt)}
            </span>
            {match.kickoffTbd ? (
              <span className="text-[10px] leading-tight text-subtle">уточняется</span>
            ) : null}
            {cancelled ? (
              <span className="text-[10px] font-semibold text-warning">
                {MATCH_STATUS_SHORT[match.status]}
              </span>
            ) : null}
          </>
        )}
      </div>

      {/* Команды */}
      <div className="min-w-0 flex-1">
        {showTournament ? (
          <p className="mb-1 truncate text-[11px] text-subtle">
            {match.tournament.name}
            {match.division ? ` · ${match.division.name}` : ""}
            {match.round ? ` · ${match.round}-й тур` : ""}
          </p>
        ) : null}

        <TeamLine
          team={match.homeTeam?.team ?? null}
          placeholder={slotLabel(homeSlotOf(match))}
          score={match.homeScore}
          shootout={match.homeShootoutScore}
          dimmed={played && !homeWon && !!hasScore && match.homeScore !== match.awayScore}
          bold={homeWon || (live && !!highlightTeamId)}
          highlighted={highlightTeamId === match.homeTeam?.team.id}
          showScore={hasScore || live}
        />
        <TeamLine
          team={match.awayTeam?.team ?? null}
          placeholder={slotLabel(awaySlotOf(match))}
          score={match.awayScore}
          shootout={match.awayShootoutScore}
          dimmed={played && !awayWon && !!hasScore && match.homeScore !== match.awayScore}
          bold={awayWon || (live && !!highlightTeamId)}
          highlighted={highlightTeamId === match.awayTeam?.team.id}
          showScore={hasScore || live}
        />
      </div>
    </Link>
  );
}

function TeamLine({
  team,
  placeholder,
  score,
  shootout,
  dimmed,
  bold,
  highlighted,
  showScore,
}: {
  /** null — участник плей-офф ещё не определился */
  team: NonNullable<MatchCard["homeTeam"]>["team"] | null;
  placeholder: string;
  score: number | null;
  shootout: number | null;
  dimmed: boolean;
  bold: boolean;
  highlighted: boolean;
  showScore: boolean;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-subtle">
          ?
        </span>
        <span className="min-w-0 flex-1 truncate text-sm italic text-muted">{placeholder}</span>
        <span className="w-5 shrink-0" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      <TeamCrest team={team} size="sm" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          dimmed ? "text-muted" : "text-fg",
          (bold || highlighted) && "font-semibold",
        )}
      >
        {team.shortName}
      </span>
      {shootout !== null ? (
        <span className="text-xs text-subtle">({shootout})</span>
      ) : null}
      {showScore ? (
        <span
          className={cn(
            "w-5 shrink-0 text-right text-sm tabular-nums",
            dimmed ? "text-muted" : "font-bold text-fg",
          )}
        >
          {score ?? 0}
        </span>
      ) : (
        <span className="w-5 shrink-0" />
      )}
    </div>
  );
}

/** Обёртка со списком матчей и разделителями. */
export function MatchList({
  matches,
  showDate,
  showTournament,
  highlightTeamId,
}: {
  matches: MatchCard[];
  showDate?: boolean;
  showTournament?: boolean;
  highlightTeamId?: string;
}) {
  return (
    <div className="divide-y divide-border">
      {matches.map((match) => (
        <MatchRow
          key={match.id}
          match={match}
          showDate={showDate}
          showTournament={showTournament}
          highlightTeamId={highlightTeamId}
        />
      ))}
    </div>
  );
}
