import Link from "next/link";

import { TeamCrest } from "@/components/TeamCrest";
import { LiveBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  MATCH_STAGE_LABEL,
  PLAYOFF_STAGES,
  isLive,
  matchOutcome,
} from "@/lib/football";
import { formatShortDate, formatTime } from "@/lib/format";
import { awaySlotOf, homeSlotOf, slotLabel } from "@/lib/playoff";
import type { MatchCard } from "@/lib/queries";

/**
 * Сетка плей-офф колонками по стадиям.
 *
 * Соединительных линий нет намеренно: в нераскрытом слоте написано
 * «Победитель матча №12» — это точнее линии и не требует ни SVG, ни расчёта
 * координат. Горизонтальная прокрутка заодно решает мобильную вёрстку.
 */
export function PlayoffBracket({ matches }: { matches: MatchCard[] }) {
  const columns = PLAYOFF_STAGES.filter((stage) => stage !== "THIRD_PLACE")
    .map((stage) => ({
      stage,
      matches: matches
        .filter((match) => match.stage === stage)
        .sort((a, b) => a.bracketOrder - b.bracketOrder || a.id - b.id),
    }))
    .filter((column) => column.matches.length > 0);

  // Матч за 3-е место в колонку не ставим: одна карточка ломает ритм сетки
  const thirdPlace = matches.filter((match) => match.stage === "THIRD_PLACE");

  if (columns.length === 0 && thirdPlace.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted">
        Сетка плей-офф ещё не составлена
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="thin-scrollbar overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {columns.map((column) => (
            <section key={column.stage} className="flex w-60 shrink-0 flex-col">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {MATCH_STAGE_LABEL[column.stage]}
              </p>
              {/* justify-around ставит матчи напротив промежутков предыдущей
                  колонки — «ёлочка» получается без единой линии */}
              <div className="flex flex-1 flex-col justify-around gap-3">
                {column.matches.map((match) => (
                  <BracketMatch key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {thirdPlace.length > 0 ? (
        <div>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {MATCH_STAGE_LABEL.THIRD_PLACE}
          </p>
          <div className="grid gap-3 sm:max-w-xs">
            {thirdPlace.map((match) => (
              <BracketMatch key={match.id} match={match} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BracketMatch({ match }: { match: MatchCard }) {
  const outcome = matchOutcome(match);
  const live = isLive(match.status);

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block rounded-lg border border-border bg-surface p-2 transition-colors hover:bg-surface-2"
    >
      <p className="mb-1 flex items-center justify-between gap-2 text-[10px] text-subtle">
        <span>№{match.id}</span>
        {live ? (
          <LiveBadge />
        ) : (
          <span>
            {formatShortDate(match.kickoffAt)} · {formatTime(match.kickoffAt)}
          </span>
        )}
      </p>

      <BracketSlot
        team={match.homeTeam?.team ?? null}
        label={slotLabel(homeSlotOf(match))}
        score={match.homeScore}
        shootout={match.homeShootoutScore}
        won={outcome.winnerId !== null && outcome.winnerId === match.homeTeamId}
        lost={outcome.loserId !== null && outcome.loserId === match.homeTeamId}
      />
      <BracketSlot
        team={match.awayTeam?.team ?? null}
        label={slotLabel(awaySlotOf(match))}
        score={match.awayScore}
        shootout={match.awayShootoutScore}
        won={outcome.winnerId !== null && outcome.winnerId === match.awayTeamId}
        lost={outcome.loserId !== null && outcome.loserId === match.awayTeamId}
      />
    </Link>
  );
}

function BracketSlot({
  team,
  label,
  score,
  shootout,
  won,
  lost,
}: {
  team: { shortName: string; logoUrl: string | null; primaryColor: string | null } | null;
  label: string;
  score: number | null;
  shootout: number | null;
  won: boolean;
  lost: boolean;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-subtle">
          ?
        </span>
        <span className="min-w-0 flex-1 truncate text-xs italic text-muted">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <TeamCrest team={team} size="sm" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          won && "font-semibold",
          lost && "text-muted",
        )}
      >
        {team.shortName}
      </span>
      {shootout !== null ? <span className="text-[10px] text-subtle">({shootout})</span> : null}
      {score !== null ? (
        <span className={cn("text-xs tabular-nums", won ? "font-bold" : "text-muted")}>
          {score}
        </span>
      ) : null}
    </div>
  );
}
