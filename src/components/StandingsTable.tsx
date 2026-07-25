import Link from "next/link";

import { TeamCrest } from "@/components/TeamCrest";
import { cn } from "@/lib/cn";
import type { StandingsRow } from "@/lib/football";

const formColors = {
  В: "bg-win text-white",
  Н: "bg-draw text-white",
  П: "bg-loss text-white",
} as const;

/**
 * Турнирная таблица. На узких экранах прячем часть колонок, оставляя
 * главное: очки, разницу мячей и игры.
 */
export function StandingsTable({
  rows,
  highlightTeamId,
  showForm = true,
}: {
  rows: StandingsRow[];
  highlightTeamId?: string;
  showForm?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted">Команды ещё не заявлены</p>;
  }

  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-subtle">
            <th className="w-8 px-2 py-2 text-center font-semibold">#</th>
            <th className="px-2 py-2 text-left font-semibold">Команда</th>
            <th className="w-9 px-1 py-2 text-center font-semibold" title="Игры">И</th>
            <th className="w-9 px-1 py-2 text-center font-semibold" title="Победы">В</th>
            <th className="w-9 px-1 py-2 text-center font-semibold" title="Ничьи">Н</th>
            <th className="w-9 px-1 py-2 text-center font-semibold" title="Поражения">П</th>
            <th className="hidden w-16 px-1 py-2 text-center font-semibold sm:table-cell" title="Забитые и пропущенные">
              Мячи
            </th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Разница мячей">±</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Очки">О</th>
            {showForm ? (
              <th className="hidden w-28 px-2 py-2 text-left font-semibold md:table-cell">
                Форма
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={row.entryId}
              className={cn(
                "transition-colors hover:bg-surface-2",
                highlightTeamId === row.teamId && "bg-brand-soft",
              )}
            >
              <td className="px-2 py-2 text-center text-xs text-subtle tabular-nums">
                {row.place}
              </td>
              <td className="px-2 py-2">
                <Link
                  href={`/teams/${row.teamSlug}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <TeamCrest team={{ shortName: row.teamShortName, logoUrl: row.logoUrl }} size="sm" />
                  <span className="truncate font-medium">{row.teamShortName}</span>
                  {row.pointsAdjustment !== 0 ? (
                    <span className="text-[11px] font-semibold text-loss">
                      ({row.pointsAdjustment > 0 ? "+" : ""}
                      {row.pointsAdjustment})
                    </span>
                  ) : null}
                </Link>
              </td>
              <td className="px-1 py-2 text-center tabular-nums">{row.played}</td>
              <td className="px-1 py-2 text-center tabular-nums">{row.won}</td>
              <td className="px-1 py-2 text-center tabular-nums">{row.drawn}</td>
              <td className="px-1 py-2 text-center tabular-nums">{row.lost}</td>
              <td className="hidden px-1 py-2 text-center text-muted tabular-nums sm:table-cell">
                {row.goalsFor}–{row.goalsAgainst}
              </td>
              <td className="px-1 py-2 text-center text-muted tabular-nums">
                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
              </td>
              <td className="px-1 py-2 text-center font-bold tabular-nums">{row.points}</td>
              {showForm ? (
                <td className="hidden px-2 py-2 md:table-cell">
                  <div className="flex gap-0.5">
                    {row.form.map((result, i) => (
                      <span
                        key={i}
                        title={
                          result === "В" ? "Победа" : result === "Н" ? "Ничья" : "Поражение"
                        }
                        className={cn(
                          "flex size-4 items-center justify-center rounded text-[9px] font-bold",
                          formColors[result],
                        )}
                      >
                        {result}
                      </span>
                    ))}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
