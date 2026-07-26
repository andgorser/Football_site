import Link from "next/link";
import { notFound } from "next/navigation";
import type { TournamentFormat } from "@prisma/client";

import { MatchList } from "@/components/MatchRow";
import { PlayoffBracket } from "@/components/PlayoffBracket";
import { ScorersTable } from "@/components/ScorersTable";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamCrest } from "@/components/TeamCrest";
import { Badge, Card, CardHeader, EmptyState, PageTitle, TabLinks } from "@/components/ui";
import { MATCH_STAGE_LABEL, halfDurationOf } from "@/lib/football";
import { formatDate, pluralize } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { matchCardArgs, type MatchCard } from "@/lib/queries";
import { getPlayerStats, getTournamentStandings } from "@/lib/stats";

export const dynamic = "force-dynamic";

const ALL_TABS = [
  { key: "table", label: "Таблица" },
  { key: "bracket", label: "Сетка" },
  { key: "schedule", label: "Расписание" },
  { key: "scorers", label: "Бомбардиры" },
  { key: "teams", label: "Команды" },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

/**
 * Набор вкладок зависит от турнира: у кубка на вылет круговая таблица всегда
 * пустая (в неё идут только матчи регулярного этапа), а сетка нужна лишь там,
 * где матчи плей-офф вообще есть.
 */
function tabsFor(format: TournamentFormat, hasPlayoff: boolean) {
  return ALL_TABS.filter((tab) => {
    if (tab.key === "table") return format !== "CUP";
    if (tab.key === "bracket") return hasPlayoff;
    return true;
  });
}

/**
 * Подпись про длительность тайма. Обычно она одна на турнир, но дивизионы
 * могут играть разными форматами (8×8 и 6×6) — тогда честнее перечислить.
 */
function halfDurationSummary(
  tournament: { halfDurationMin: number },
  divisions: { name: string; halfDurationMin: number | null }[],
) {
  const minutes = divisions.map((d) => halfDurationOf(d, tournament));
  const uniform = minutes.every((m) => m === minutes[0]);

  if (divisions.length === 0 || uniform) {
    const value = minutes[0] ?? tournament.halfDurationMin;
    return `2 тайма по ${value} мин`;
  }

  return `Тайм: ${divisions.map((d, i) => `${d.name} — ${minutes[i]} мин`).join(", ")}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    select: { name: true, season: true },
  });
  return { title: tournament ? `${tournament.name} ${tournament.season}` : "Турнир" };
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; division?: string }>;
}) {
  const { slug } = await params;
  const { tab, division } = await searchParams;

  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      season: true,
      status: true,
      format: true,
      startDate: true,
      endDate: true,
      description: true,
      halfDurationMin: true,
      pointsForWin: true,
      series: { select: { slug: true, name: true } },
      divisions: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, halfDurationMin: true },
      },
      _count: { select: { entries: true, matches: true } },
    },
  });

  if (!tournament) notFound();

  const playoffCount = await prisma.match.count({
    where: { tournamentId: tournament.id, stage: { not: "REGULAR" } },
  });

  const tabs = tabsFor(tournament.format, playoffCount > 0);
  const defaultTab = tabs[0].key;
  const activeTab: TabKey = tabs.some((t) => t.key === tab) ? (tab as TabKey) : defaultTab;

  return (
    <div>
      <PageTitle
        title={tournament.name}
        subtitle={
          <>
            Сезон {tournament.season} · {pluralize(tournament._count.entries, "команда", "команды", "команд")} ·{" "}
            {halfDurationSummary(tournament, tournament.divisions)} · победа {tournament.pointsForWin} очка
            {tournament.series ? (
              <>
                {" · "}
                <Link href={`/series/${tournament.series.slug}`} className="text-brand hover:underline">
                  все сезоны →
                </Link>
              </>
            ) : null}
          </>
        }
        action={
          tournament.status === "ONGOING" ? (
            <Badge tone="win">Идёт</Badge>
          ) : tournament.status === "UPCOMING" ? (
            <Badge tone="brand">Начнётся {formatDate(tournament.startDate)}</Badge>
          ) : (
            <Badge>Завершён</Badge>
          )
        }
      />

      <TabLinks
        items={tabs.map((t) => ({
          href: `/tournaments/${tournament.slug}${t.key === defaultTab ? "" : `?tab=${t.key}`}`,
          label: t.label,
          active: t.key === activeTab,
        }))}
      />

      {activeTab === "table" ? <StandingsTab tournamentId={tournament.id} /> : null}
      {activeTab === "bracket" ? <BracketTab tournamentId={tournament.id} /> : null}
      {activeTab === "schedule" ? (
        <ScheduleTab
          tournamentId={tournament.id}
          slug={tournament.slug}
          divisionFilter={division}
        />
      ) : null}
      {activeTab === "scorers" ? <ScorersTab tournamentId={tournament.id} /> : null}
      {activeTab === "teams" ? <TeamsTab tournamentId={tournament.id} /> : null}
    </div>
  );
}

async function StandingsTab({ tournamentId }: { tournamentId: number }) {
  const divisions = await getTournamentStandings(tournamentId);

  if (divisions.length === 0) {
    return (
      <Card>
        <EmptyState title="Команды ещё не заявлены" />
      </Card>
    );
  }

  // Дивизион, разделённый на половины, свой этап отыграл: его таблица уходит
  // вниз как архив, чтобы наверху были только те, кто играет сейчас.
  const current = divisions.filter((d) => !d.isArchived);
  const archived = divisions.filter((d) => d.isArchived);
  const hasCarry = divisions.some((d) => d.rows.some((r) => r.carriedPoints !== 0));

  return (
    <div className="space-y-4">
      {current.map((division) => (
        <Card key={division.divisionId ?? "all"}>
          <CardHeader
            title={division.divisionName}
            subtitle={
              division.parentDivisionName
                ? `Очки и статистика перенесены из таблицы «${division.parentDivisionName}»`
                : undefined
            }
          />
          <StandingsTable
            rows={division.rows}
            showCarried={division.rows.some((r) => r.carriedPoints !== 0)}
          />
        </Card>
      ))}

      {archived.length > 0 ? (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            Завершённые этапы ({archived.length})
          </summary>
          <div className="space-y-4 border-t border-border p-3">
            {archived.map((division) => (
              <Card key={division.divisionId ?? "all"}>
                <CardHeader
                  title={division.divisionName}
                  subtitle="Круговой этап завершён — таблица сохранена как есть"
                  action={<Badge>Архив</Badge>}
                />
                <StandingsTable rows={division.rows} />
              </Card>
            ))}
          </div>
        </details>
      ) : null}

      <p className="px-1 text-xs text-subtle">
        Места распределяются по очкам, затем по разнице мячей, забитым голам и личным встречам.
        {hasCarry
          ? " Колонка «Пер.» — очки, набранные на первом этапе; игры, мячи и разница тоже перенесены. Личные встречи учитываются только между матчами текущего этапа."
          : ""}
      </p>
    </div>
  );
}

async function BracketTab({ tournamentId }: { tournamentId: number }) {
  const matches = await prisma.match.findMany({
    where: { tournamentId, stage: { not: "REGULAR" } },
    orderBy: [{ stage: "asc" }, { bracketOrder: "asc" }, { id: "asc" }],
    ...matchCardArgs,
  });

  return (
    <Card className="p-3">
      <PlayoffBracket matches={matches} />
    </Card>
  );
}

async function ScheduleTab({
  tournamentId,
  slug,
  divisionFilter,
}: {
  tournamentId: number;
  slug: string;
  divisionFilter?: string;
}) {
  const [matches, divisions] = await Promise.all([
    prisma.match.findMany({
      where: { tournamentId },
      // Сначала дивизионы по порядку, внутри — регулярный этап и затем стадии
      // плей-офф в порядке объявления enum, внутри стадии — по времени.
      orderBy: [
        { division: { sortOrder: "asc" } },
        { stage: "asc" },
        { round: { sort: "asc", nulls: "last" } },
        { kickoffAt: "asc" },
        { id: "asc" },
      ],
      ...matchCardArgs,
    }),
    prisma.division.findMany({
      where: { tournamentId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (matches.length === 0) {
    return (
      <Card>
        <EmptyState title="Расписание ещё не составлено" />
      </Card>
    );
  }

  // Фильтр по дивизиону нужен, только если дивизионов реально несколько:
  // в обычной лиге лишняя строка вкладок только мешает.
  const usedDivisionIds = new Set(matches.map((m) => m.division?.id ?? null));
  const showDivisionFilter = divisions.filter((d) => usedDivisionIds.has(d.id)).length > 1;

  const selectedDivisionId =
    showDivisionFilter && divisionFilter && /^\d+$/.test(divisionFilter)
      ? Number(divisionFilter)
      : null;

  const visible = selectedDivisionId
    ? matches.filter((match) => match.division?.id === selectedDivisionId)
    : matches;

  // Ключ обязательно включает дивизион: иначе первые туры разных дивизионов
  // склеятся в одну карточку «1-й тур».
  const groups = new Map<
    string,
    { key: string; title: string; divisionName: string | null; matches: MatchCard[] }
  >();

  for (const match of visible) {
    const isRegularRound = match.stage === "REGULAR" && match.round;
    const key = `${match.division?.id ?? 0}:${isRegularRound ? `r${match.round}` : `s${match.stage}`}`;
    const title = isRegularRound ? `${match.round}-й тур` : MATCH_STAGE_LABEL[match.stage];

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title,
        // Общий плей-офф поверх дивизионов сам отделяется в свой блок
        divisionName:
          match.division?.name ?? (match.stage === "REGULAR" ? null : "Плей-офф турнира"),
        matches: [],
      });
    }
    groups.get(key)!.matches.push(match);
  }

  return (
    <div className="space-y-4">
      {showDivisionFilter ? (
        <TabLinks
          items={[
            {
              href: `/tournaments/${slug}?tab=schedule`,
              label: "Все дивизионы",
              active: selectedDivisionId === null,
            },
            ...divisions.map((division) => ({
              href: `/tournaments/${slug}?tab=schedule&division=${division.id}`,
              label: division.name,
              active: selectedDivisionId === division.id,
            })),
          ]}
        />
      ) : null}

      {groups.size === 0 ? (
        <Card>
          <EmptyState title="В этом дивизионе матчей нет" />
        </Card>
      ) : (
        [...groups.values()].map((group) => (
          <Card key={group.key}>
            <CardHeader
              title={group.title}
              subtitle={[
                selectedDivisionId === null ? group.divisionName : null,
                pluralize(group.matches.length, "матч", "матча", "матчей"),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <MatchList matches={group.matches} showDate />
          </Card>
        ))
      )}
    </div>
  );
}

async function ScorersTab({ tournamentId }: { tournamentId: number }) {
  const stats = await getPlayerStats({ tournamentId, limit: 50 });

  return (
    <Card>
      <CardHeader title="Бомбардиры" subtitle="Голы, передачи и сыгранные матчи" />
      <ScorersTable rows={stats} />
    </Card>
  );
}

async function TeamsTab({ tournamentId }: { tournamentId: number }) {
  const entries = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    orderBy: [{ division: { sortOrder: "asc" } }, { team: { name: "asc" } }],
    select: {
      id: true,
      division: { select: { id: true, name: true } },
      _count: { select: { roster: true } },
      team: {
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          logoUrl: true,
          primaryColor: true,
          faculty: { select: { shortName: true } },
        },
      },
    },
  });

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState title="Команды ещё не заявлены" />
      </Card>
    );
  }

  const byDivision = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.division?.name ?? "Участники";
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key)!.push(entry);
  }

  return (
    <div className="space-y-4">
      {[...byDivision.entries()].map(([divisionName, divisionEntries]) => (
        <Card key={divisionName}>
          <CardHeader title={divisionName} />
          <div className="grid gap-px bg-border sm:grid-cols-2">
            {divisionEntries.map((entry) => (
              <Link
                key={entry.id}
                href={`/teams/${entry.team.slug}`}
                className="flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <TeamCrest team={entry.team} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.team.name}</p>
                  <p className="text-xs text-muted">
                    {entry.team.faculty?.shortName ?? "Без факультета"} ·{" "}
                    {pluralize(entry._count.roster, "игрок", "игрока", "игроков")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
