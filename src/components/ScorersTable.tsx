import Link from "next/link";

import { TeamCrest } from "@/components/TeamCrest";
import type { PlayerStatRow } from "@/lib/football";

/** Таблица бомбардиров и ассистентов. */
export function ScorersTable({ rows }: { rows: PlayerStatRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted">Пока нет данных</p>;
  }

  return (
    <div className="thin-scrollbar overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-subtle">
            <th className="w-8 px-2 py-2 text-center font-semibold">#</th>
            <th className="px-2 py-2 text-left font-semibold">Игрок</th>
            <th className="px-2 py-2 text-left font-semibold">Команда</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Матчи">И</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Голы">Г</th>
            <th className="w-10 px-1 py-2 text-center font-semibold" title="Голевые передачи">
              П
            </th>
            <th className="hidden w-12 px-1 py-2 text-center font-semibold sm:table-cell" title="Гол + пас">
              Г+П
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={row.playerId} className="transition-colors hover:bg-surface-2">
              <td className="px-2 py-2 text-center text-xs text-subtle tabular-nums">
                {index + 1}
              </td>
              <td className="px-2 py-2">
                <Link href={`/players/${row.playerId}`} className="font-medium hover:underline">
                  {row.playerName}
                </Link>
              </td>
              <td className="px-2 py-2">
                <Link
                  href={`/teams/${row.teamSlug}`}
                  className="flex items-center gap-1.5 text-muted hover:underline"
                >
                  <TeamCrest team={{ shortName: row.teamShortName }} size="sm" />
                  <span className="truncate">{row.teamShortName}</span>
                </Link>
              </td>
              <td className="px-1 py-2 text-center text-muted tabular-nums">{row.matches}</td>
              <td className="px-1 py-2 text-center font-bold tabular-nums">{row.goals}</td>
              <td className="px-1 py-2 text-center tabular-nums">{row.assists}</td>
              <td className="hidden px-1 py-2 text-center text-muted tabular-nums sm:table-cell">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
