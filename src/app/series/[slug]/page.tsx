import Link from "next/link";
import { notFound } from "next/navigation";

import { ScorersTable } from "@/components/ScorersTable";
import { TeamCrest } from "@/components/TeamCrest";
import { Badge, Card, CardHeader, EmptyState, PageTitle } from "@/components/ui";
import { formatDate, pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSeriesOverview, type SeasonRow } from "@/lib/series";
import { getPlayerStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await prisma.tournamentSeries.findUnique({
    where: { slug },
    select: { name: true },
  });
  return { title: series ? `${series.name} — история` : "Серия турниров" };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const series = await prisma.tournamentSeries.findUnique({
    where: { slug },
    select: { id: true, name: true, description: true },
  });
  if (!series) notFound();

  const overview = await getSeriesOverview(series.id);
  const scorers = await getPlayerStats({ tournamentIds: overview.tournamentIds, limit: 25 });

  const finished = overview.seasons.filter((s) => !s.provisional).length;

  return (
    <div className="space-y-4">
      <PageTitle
        title={series.name}
        subtitle={
          <>
            {pluralize(overview.seasons.length, "сезон", "сезона", "сезонов")}
            {finished > 0 ? ` · ${finished} завершено` : ""}
            {series.description ? ` · ${series.description}` : ""}
          </>
        }
      />

      {overview.seasons.length === 0 ? (
        <Card>
          <EmptyState
            title="В серии пока нет турниров"
            hint="Серия выбирается в настройках турнира"
          />
        </Card>
      ) : null}

      {overview.seasons.length > 0 ? (
        <Card>
          <CardHeader title="Сезоны" subtitle="Свежие сверху" />
          <ul className="divide-y divide-border">
            {overview.seasons.map((season) => (
              <SeasonLine key={season.tournament.id} season={season} />
            ))}
          </ul>
        </Card>
      ) : null}

      {scorers.length > 0 ? (
        <Card>
          <CardHeader title="Бомбардиры за все годы" subtitle="Учитываются все стадии" />
          <ScorersTable rows={scorers} />
        </Card>
      ) : null}

      {overview.teams.length > 0 ? (
        <Card>
          <CardHeader title="Команды серии" subtitle="Титулы считаются по завершённым сезонам" />
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-subtle">
                  <th className="px-2 py-2 text-left font-semibold">Команда</th>
                  <th className="w-14 px-1 py-2 text-center font-semibold" title="Сезонов">Сез.</th>
                  <th className="w-12 px-1 py-2 text-center font-semibold" title="Титулы">🥇</th>
                  <th className="w-14 px-1 py-2 text-center font-semibold" title="Призовых мест">Медали</th>
                  <th className="hidden w-16 px-1 py-2 text-center font-semibold sm:table-cell" title="Лучшее место">Лучшее</th>
                  <th className="w-10 px-1 py-2 text-center font-semibold" title="Игры">И</th>
                  <th className="w-10 px-1 py-2 text-center font-semibold" title="Победы">В</th>
                  <th className="w-10 px-1 py-2 text-center font-semibold" title="Ничьи">Н</th>
                  <th className="w-10 px-1 py-2 text-center font-semibold" title="Поражения">П</th>
                  <th className="hidden w-16 px-1 py-2 text-center font-semibold sm:table-cell">Мячи</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.teams.map((row) => (
                  <tr key={row.team.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-2 py-2">
                      <Link
                        href={`/teams/${row.team.slug}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <TeamCrest team={row.team} size="sm" />
                        <span className="truncate font-medium">{row.team.shortName}</span>
                      </Link>
                    </td>
                    <td className="px-1 py-2 text-center tabular-nums">{row.seasons}</td>
                    <td className="px-1 py-2 text-center font-bold tabular-nums">
                      {row.titles || "—"}
                    </td>
                    <td className="px-1 py-2 text-center tabular-nums">{row.medals || "—"}</td>
                    <td className="hidden px-1 py-2 text-center tabular-nums sm:table-cell">
                      {row.bestPlace ?? "—"}
                    </td>
                    <td className="px-1 py-2 text-center tabular-nums">{row.played}</td>
                    <td className="px-1 py-2 text-center tabular-nums">{row.won}</td>
                    <td className="px-1 py-2 text-center tabular-nums">{row.drawn}</td>
                    <td className="px-1 py-2 text-center tabular-nums">{row.lost}</td>
                    <td className="hidden px-1 py-2 text-center text-muted tabular-nums sm:table-cell">
                      {row.goalsFor}–{row.goalsAgainst}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SeasonLine({ season }: { season: SeasonRow }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <Link
        href={`/tournaments/${season.tournament.slug}`}
        className="font-semibold hover:underline"
      >
        {season.tournament.season}
      </Link>

      {season.tournament.status === "ONGOING" ? (
        <Badge tone="win">Идёт</Badge>
      ) : season.tournament.status === "UPCOMING" ? (
        <Badge tone="brand">С {formatDate(season.tournament.startDate)}</Badge>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {season.places.map((place) => (
          <Link
            key={place.entryId}
            href={`/teams/${place.team.slug}`}
            className="flex items-center gap-1.5 text-sm hover:underline"
          >
            <span>{MEDAL[place.place]}</span>
            <TeamCrest team={place.team} size="sm" />
            <span className="truncate">{place.team.shortName}</span>
          </Link>
        ))}
        {season.places.length === 0 ? (
          <span className="text-sm text-muted">{season.note ?? "Итоги ещё не подведены"}</span>
        ) : null}
      </div>

      <span className="text-xs text-subtle">
        {season.teamCount} команд · {season.playedCount} матчей · {season.goals} голов
        {season.provisional && season.places.length > 0 ? " · промежуточно" : ""}
        {season.placesDivisionName ? ` · по дивизиону «${season.placesDivisionName}»` : ""}
      </span>
    </li>
  );
}
