import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchList } from "@/components/MatchRow";
import { ScorersTable } from "@/components/ScorersTable";
import { TeamCrest } from "@/components/TeamCrest";
import { Card, CardHeader, EmptyState, PageTitle } from "@/components/ui";
import { POSITION_LABEL, POSITION_SHORT, shortName } from "@/lib/football";
import { pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { matchCardArgs, rosterByPositionOrderBy } from "@/lib/queries";
import { getPlayerStats, getTeamSummary } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await prisma.team.findUnique({ where: { slug }, select: { name: true } });
  return { title: team?.name ?? "Команда" };
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const team = await prisma.team.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      logoUrl: true,
      primaryColor: true,
      description: true,
      foundedYear: true,
      faculty: { select: { name: true, shortName: true } },
      entries: {
        orderBy: { tournament: { startDate: "desc" } },
        select: {
          id: true,
          tournament: { select: { slug: true, name: true, season: true, status: true } },
          division: { select: { name: true } },
          roster: {
            orderBy: rosterByPositionOrderBy,
            select: {
              id: true,
              shirtNumber: true,
              position: true,
              isCaptain: true,
              player: { select: { id: true, firstName: true, lastName: true, course: true } },
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const [matches, summary, stats] = await Promise.all([
    prisma.match.findMany({
      where: { OR: [{ homeTeam: { teamId: team.id } }, { awayTeam: { teamId: team.id } }] },
      orderBy: { kickoffAt: "desc" },
      take: 20,
      ...matchCardArgs,
    }),
    getTeamSummary(team.id),
    getPlayerStats({ teamId: team.id, limit: 15 }),
  ]);

  // Действующая заявка — из самого свежего турнира, где команда участвует
  const currentEntry = team.entries[0];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <TeamCrest team={team} size="xl" />
        <div className="min-w-0 flex-1">
          <PageTitle
            title={team.name}
            subtitle={
              <>
                {team.faculty?.name ?? "Без факультета"}
                {team.foundedYear ? ` · основана в ${team.foundedYear}` : ""}
              </>
            }
          />
          {team.description ? <p className="text-sm text-muted">{team.description}</p> : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Матчей" value={summary.played} />
        <StatTile label="Победы" value={summary.won} tone="text-win" />
        <StatTile label="Ничьи" value={summary.drawn} />
        <StatTile label="Поражения" value={summary.lost} tone="text-loss" />
        <StatTile label="Забито" value={summary.goalsFor} />
        <StatTile label="Пропущено" value={summary.goalsAgainst} />
        <StatTile label="Разница" value={summary.goalsFor - summary.goalsAgainst} />
        <StatTile label="Сухие матчи" value={summary.cleanSheets} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Состав"
            subtitle={
              currentEntry
                ? `${currentEntry.tournament.name} ${currentEntry.tournament.season}`
                : undefined
            }
          />
          {!currentEntry || currentEntry.roster.length === 0 ? (
            <EmptyState title="Заявка не подана" hint="Капитан команды ещё не заявил игроков." />
          ) : (
            <RosterList roster={currentEntry.roster} />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Матчи" />
            {matches.length === 0 ? (
              <EmptyState title="Матчей пока нет" />
            ) : (
              <MatchList matches={matches} showDate showTournament highlightTeamId={team.id} />
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Лучшие игроки" subtitle="По сумме всех турниров" />
        <ScorersTable rows={stats} />
      </Card>

      {team.entries.length > 0 ? (
        <Card>
          <CardHeader title="Турниры" />
          <ul className="divide-y divide-border">
            {team.entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/tournaments/${entry.tournament.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="truncate">
                    {entry.tournament.name}
                    <span className="ml-2 text-xs text-muted">{entry.tournament.season}</span>
                  </span>
                  <span className="shrink-0 text-xs text-subtle">
                    {entry.division?.name ?? "—"} ·{" "}
                    {pluralize(entry.roster.length, "игрок", "игрока", "игроков")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card className="px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
    </Card>
  );
}

type RosterRow = {
  id: number;
  shirtNumber: number | null;
  position: keyof typeof POSITION_LABEL | null;
  isCaptain: boolean;
  player: { id: string; firstName: string; lastName: string; course: number | null };
};

function RosterList({ roster }: { roster: RosterRow[] }) {
  const groups: { position: keyof typeof POSITION_LABEL; rows: RosterRow[] }[] = (
    ["GK", "DF", "MF", "FW"] as const
  ).map((position) => ({
    position,
    rows: roster.filter((r) => r.position === position),
  }));
  const unknown = roster.filter((r) => !r.position);

  return (
    <div className="py-1">
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.position}>
            <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {POSITION_LABEL[group.position]}
            </p>
            <ul>
              {group.rows.map((row) => (
                <PlayerLine key={row.id} row={row} />
              ))}
            </ul>
          </div>
        ),
      )}
      {unknown.length > 0 ? (
        <ul>
          {unknown.map((row) => (
            <PlayerLine key={row.id} row={row} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PlayerLine({ row }: { row: RosterRow }) {
  return (
    <li>
      <Link
        href={`/players/${row.player.id}`}
        className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-surface-2"
      >
        <span className="w-6 shrink-0 text-right text-xs text-subtle tabular-nums">
          {row.shirtNumber ?? "—"}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {shortName(row.player)}
          {row.isCaptain ? (
            <span className="ml-1.5 rounded bg-surface-3 px-1 text-[10px] font-bold text-muted">
              К
            </span>
          ) : null}
        </span>
        {row.player.course ? (
          <span className="shrink-0 text-xs text-subtle">{row.player.course} курс</span>
        ) : null}
        {row.position ? (
          <span className="w-6 shrink-0 text-right text-[11px] font-semibold text-subtle">
            {POSITION_SHORT[row.position]}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
