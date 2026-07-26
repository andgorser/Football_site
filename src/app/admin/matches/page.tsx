import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { ActionButton } from "@/components/admin/ActionForm";
import { RefereeSelect } from "@/components/admin/RefereeSelect";
import { TeamCrest } from "@/components/TeamCrest";
import { Badge, Card, EmptyState, PageTitle, TabLinks, buttonClass } from "@/components/ui";
import { MATCH_STATUS_LABEL, isLive } from "@/lib/football";
import { formatDateTimeOrTbd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { awaySlotOf, homeSlotOf, slotLabel } from "@/lib/playoff";
import { deleteMatch } from "@/server/admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Матчи — управление" };

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ tournament?: string; filter?: string }>;
}) {
  const { tournament: tournamentParam, filter } = await searchParams;
  const tournamentId = tournamentParam ? Number(tournamentParam) : null;

  const [tournaments, referees] = await Promise.all([
    prisma.tournament.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, season: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["REFEREE", "ADMIN"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  // Рабочий список организатора: что осталось переназначить
  const postponedCount = await prisma.match.count({
    where: { status: "POSTPONED", ...(tournamentId ? { tournamentId } : {}) },
  });

  const statusFilter: Prisma.MatchWhereInput =
    filter === "postponed"
      ? { status: "POSTPONED" }
      : filter === "played"
      ? { status: { in: ["FINISHED", "WALKOVER"] } }
      : filter === "all"
        ? {}
        : {
            status: {
              in: [
                "SCHEDULED",
                "POSTPONED",
                "FIRST_HALF",
                "HALF_TIME",
                "SECOND_HALF",
                "EXTRA_TIME",
                "PENALTY_SHOOTOUT",
              ],
            },
          };

  const matches = await prisma.match.findMany({
    where: {
      ...(tournamentId ? { tournamentId } : {}),
      ...statusFilter,
    },
    // Второй ключ обязателен: у матчей одного тура время часто совпадает
    // (а у несогласованных — совпадает всегда), и без него база вправе
    // возвращать их в любом порядке — список «прыгает» между обновлениями.
    orderBy: [{ kickoffAt: filter === "played" ? "desc" : "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      kickoffAt: true,
      kickoffTbd: true,
      status: true,
      round: true,
      refereeId: true,
      notes: true,
      homeScore: true,
      awayScore: true,
      tournament: { select: { id: true, name: true } },
      division: { select: { name: true } },
      venue: { select: { name: true } },
      homeSource: true,
      homeSourcePlace: true,
      homeSourceLabel: true,
      homeSourceMatchId: true,
      homeSourceDivision: { select: { name: true } },
      awaySource: true,
      awaySourcePlace: true,
      awaySourceLabel: true,
      awaySourceMatchId: true,
      awaySourceDivision: { select: { name: true } },
      homeTeam: { select: { team: { select: { shortName: true, logoUrl: true, primaryColor: true } } } },
      awayTeam: { select: { team: { select: { shortName: true, logoUrl: true, primaryColor: true } } } },
    },
  });

  const query = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (tournamentId) params.set("tournament", String(tournamentId));
    if (filter) params.set("filter", filter);
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    return `/admin/matches${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Матчи"
        subtitle="Расписание, назначение судей и результаты"
        action={
          <Link
            href={`/admin/matches/new${tournamentId ? `?tournament=${tournamentId}` : ""}`}
            className={buttonClass("primary")}
          >
            + Новый матч
          </Link>
        }
      />

      <TabLinks
        items={[
          { href: query({ filter: undefined }), label: "Предстоящие", active: !filter },
          {
            href: query({ filter: "postponed" }),
            label: postponedCount ? `Перенесённые (${postponedCount})` : "Перенесённые",
            active: filter === "postponed",
          },
          { href: query({ filter: "played" }), label: "Сыгранные", active: filter === "played" },
          { href: query({ filter: "all" }), label: "Все", active: filter === "all" },
        ]}
      />

      <TabLinks
        items={[
          { href: query({ tournament: undefined }), label: "Все турниры", active: !tournamentId },
          ...tournaments.map((t) => ({
            href: query({ tournament: String(t.id) }),
            label: `${t.name} ${t.season}`,
            active: tournamentId === t.id,
          })),
        ]}
      />

      {matches.length === 0 ? (
        <Card>
          <EmptyState title="Матчей нет" hint="Создайте матч вручную или сгенерируйте расписание в турнире." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {matches.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-[14rem] flex-1">
                  <p className="mb-1 truncate text-[11px] text-subtle">
                    {match.tournament.name}
                    {match.division ? ` · ${match.division.name}` : ""}
                    {match.round ? ` · ${match.round}-й тур` : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <TeamCrest team={match.homeTeam?.team ?? { shortName: "?" }} size="sm" />
                    <span className="truncate text-sm font-medium">{match.homeTeam?.team.shortName ?? slotLabel(homeSlotOf(match))}</span>
                    <span className="text-xs font-bold tabular-nums">
                      {match.homeScore !== null && match.awayScore !== null
                        ? `${match.homeScore}:${match.awayScore}`
                        : "—"}
                    </span>
                    <TeamCrest team={match.awayTeam?.team ?? { shortName: "?" }} size="sm" />
                    <span className="truncate text-sm font-medium">{match.awayTeam?.team.shortName ?? slotLabel(awaySlotOf(match))}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatDateTimeOrTbd(match.kickoffAt, match.kickoffTbd)}
                    {match.venue ? ` · ${match.venue.name}` : ""}
                  </p>
                  {match.notes ? (
                    <p className="mt-0.5 text-xs text-warning">{match.notes}</p>
                  ) : null}
                </div>

                <Badge
                  tone={
                    isLive(match.status)
                      ? "live"
                      : match.status === "POSTPONED" || match.status === "CANCELLED"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {MATCH_STATUS_LABEL[match.status]}
                </Badge>

                <RefereeSelect
                  matchId={match.id}
                  refereeId={match.refereeId}
                  referees={referees}
                />

                <div className="flex gap-1">
                  <Link href={`/admin/matches/${match.id}`} className={buttonClass("secondary", "py-1 text-xs")}>
                    Изменить
                  </Link>
                  <Link href={`/referee/${match.id}`} className={buttonClass("outline", "py-1 text-xs")}>
                    Протокол
                  </Link>
                  <ActionButton
                    action={deleteMatch.bind(null, match.id)}
                    label="Удалить"
                    variant="ghost"
                    className="py-1 text-xs"
                    confirmText="Удалить матч вместе со всеми событиями?"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
