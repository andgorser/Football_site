import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { TeamCrest } from "@/components/TeamCrest";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LiveBadge,
  PageTitle,
  TabLinks,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { LIVE_STATUSES, MATCH_STATUS_LABEL, OPEN_STATUSES, isLive } from "@/lib/football";
import { formatDayLabel, formatTimeOrTbd, moscowDayKey, moscowDayRange } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { awaySlotOf, homeSlotOf, slotLabel } from "@/lib/playoff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Мои матчи" };

const SCOPES = [
  { key: "mine", label: "Мои" },
  { key: "today", label: "Сегодня" },
  { key: "all", label: "Все ближайшие" },
] as const;

type ScopeKey = (typeof SCOPES)[number]["key"];

export default async function RefereeHomePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requireRole(["REFEREE"], "/referee");
  const { scope } = await searchParams;
  const activeScope: ScopeKey = SCOPES.some((s) => s.key === scope)
    ? (scope as ScopeKey)
    : "mine";

  const now = new Date();
  // Матч, начавшийся более шести часов назад, судить уже поздно —
  // но перенесённые показываем независимо от старой даты.
  const horizon = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const today = moscowDayRange(moscowDayKey(now));

  const scopeWhere: Record<ScopeKey, Prisma.MatchWhereInput> = {
    mine: { refereeId: user.id, status: { in: OPEN_STATUSES } },
    today: { kickoffAt: { gte: today.from, lt: today.to } },
    all: {
      status: { in: OPEN_STATUSES },
      OR: [{ kickoffAt: { gte: horizon } }, { status: "POSTPONED" }],
    },
  };

  const [live, scoped, past] = await Promise.all([
    prisma.match.findMany({
      where: { status: { in: LIVE_STATUSES } },
      orderBy: { kickoffAt: "asc" },
      ...listArgs,
    }),
    prisma.match.findMany({
      where: scopeWhere[activeScope],
      orderBy: { kickoffAt: "asc" },
      take: 60,
      ...listArgs,
    }),
    activeScope === "mine"
      ? prisma.match.findMany({
          where: { refereeId: user.id, status: { in: ["FINISHED", "WALKOVER", "CANCELLED"] } },
          orderBy: { kickoffAt: "desc" },
          take: 10,
          ...listArgs,
        })
      : Promise.resolve([]),
  ]);

  // Перенесённые отделяем: иначе матч с датой месячной давности навсегда
  // осядет первой строкой списка ближайших.
  const postponed = scoped.filter((match) => match.status === "POSTPONED");
  const upcoming = scoped.filter((match) => match.status !== "POSTPONED");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Матчи"
        subtitle="Вести протокол может любой судья — назначенный или подменяющий"
      />

      {live.length > 0 ? (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Идут сейчас <LiveBadge />
              </span>
            }
          />
          <MatchLinks matches={live} currentUserId={user.id} />
        </Card>
      ) : null}

      <TabLinks
        items={SCOPES.map((s) => ({
          href: s.key === "mine" ? "/referee" : `/referee?scope=${s.key}`,
          label: s.label,
          active: s.key === activeScope,
        }))}
      />

      {postponed.length > 0 ? (
        <Card>
          <CardHeader
            title="Перенесены — ждут новой даты"
            subtitle="Новую дату назначает организатор"
          />
          <MatchLinks matches={postponed} currentUserId={user.id} />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={
            activeScope === "mine"
              ? "Мои матчи"
              : activeScope === "today"
                ? "Сегодня"
                : "Все ближайшие"
          }
        />
        {upcoming.length === 0 ? (
          <EmptyState
            title={activeScope === "mine" ? "Назначений нет" : "Матчей нет"}
            hint={
              activeScope === "mine"
                ? "Загляните во вкладку «Сегодня» — вести можно любой матч."
                : undefined
            }
          />
        ) : (
          <MatchLinks matches={upcoming} currentUserId={user.id} />
        )}
      </Card>

      {past.length > 0 ? (
        <Card>
          <CardHeader title="Сыгранные" subtitle="Протокол можно дополнить или исправить" />
          <MatchLinks matches={past} currentUserId={user.id} />
        </Card>
      ) : null}
    </div>
  );
}

const listArgs = {
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
    tournament: { select: { name: true } },
    division: { select: { name: true } },
    venue: { select: { name: true } },
    referee: { select: { fullName: true } },
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
} satisfies Prisma.MatchDefaultArgs;

type RefereeMatch = Prisma.MatchGetPayload<typeof listArgs>;

function MatchLinks({
  matches,
  currentUserId,
}: {
  matches: RefereeMatch[];
  currentUserId: string;
}) {
  return (
    <ul className="divide-y divide-border">
      {matches.map((match) => (
        <li key={match.id}>
          <Link
            href={`/referee/${match.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <div className="min-w-0 flex-1">
              <p className="mb-1 truncate text-[11px] text-subtle">
                {match.tournament.name}
                {match.division ? ` · ${match.division.name}` : ""}
                {match.round ? ` · ${match.round}-й тур` : ""}
              </p>
              <div className="flex items-center gap-2">
                <TeamCrest team={match.homeTeam?.team ?? { shortName: "?" }} size="sm" />
                <span className="truncate text-sm font-medium">{match.homeTeam?.team.shortName ?? slotLabel(homeSlotOf(match))}</span>
                <span className="text-xs text-muted">—</span>
                <TeamCrest team={match.awayTeam?.team ?? { shortName: "?" }} size="sm" />
                <span className="truncate text-sm font-medium">{match.awayTeam?.team.shortName ?? slotLabel(awaySlotOf(match))}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted">
                {formatDayLabel(match.kickoffAt)},{" "}
                {formatTimeOrTbd(match.kickoffAt, match.kickoffTbd)}
                {match.venue ? ` · ${match.venue.name}` : ""}
              </p>
              {match.notes ? (
                <p className="mt-0.5 truncate text-xs text-warning">{match.notes}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {match.homeScore !== null && match.awayScore !== null ? (
                <p className="text-lg font-bold tabular-nums">
                  {match.homeScore}:{match.awayScore}
                </p>
              ) : null}
              {isLive(match.status) ? (
                <LiveBadge label={MATCH_STATUS_LABEL[match.status]} />
              ) : (
                <Badge tone={match.status === "POSTPONED" ? "warning" : "neutral"}>
                  {MATCH_STATUS_LABEL[match.status] || "Вести"}
                </Badge>
              )}
              {match.refereeId === currentUserId ? (
                <Badge tone="brand">Ваш матч</Badge>
              ) : match.referee ? (
                <Badge tone="warning">Судья: {match.referee.fullName}</Badge>
              ) : (
                <Badge tone="warning">Без судьи</Badge>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
