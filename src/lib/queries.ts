import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LIVE_STATUSES } from "@/lib/football";

/**
 * Единый набор полей матча для всех списков и карточек. Держим его в одном
 * месте, чтобы карточка матча на главной, в турнире и в команде показывала
 * одинаковые данные и не приходилось дублировать select.
 */
export const matchCardArgs = {
  select: {
    id: true,
    kickoffAt: true,
    status: true,
    round: true,
    stage: true,
    homeScore: true,
    awayScore: true,
    homeShootoutScore: true,
    awayShootoutScore: true,
    periodStartedAt: true,
    clockOffsetSec: true,
    refereeId: true,
    bracketOrder: true,
    homeTeamId: true,
    awayTeamId: true,
    // Откуда придёт участник, если он ещё не определён. Матч-источник
    // сюда не тянем — спискам хватает подписи «Победитель матча №12».
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
    tournament: { select: { id: true, slug: true, name: true, season: true } },
    division: { select: { id: true, name: true } },
    venue: { select: { id: true, name: true } },
    homeTeam: {
      select: {
        id: true,
        team: { select: { id: true, slug: true, name: true, shortName: true, logoUrl: true, primaryColor: true } },
      },
    },
    awayTeam: {
      select: {
        id: true,
        team: { select: { id: true, slug: true, name: true, shortName: true, logoUrl: true, primaryColor: true } },
      },
    },
  },
} satisfies Prisma.MatchDefaultArgs;

export type MatchCard = Prisma.MatchGetPayload<typeof matchCardArgs>;

/**
 * Единый порядок игроков в заявке: сначала номера по возрастанию, затем
 * игроки без номера — по фамилии.
 *
 * Вторичный ключ обязателен: у всех безномерных игроков ключ сортировки
 * одинаковый (NULL), и без сортировки по фамилии база вправе возвращать их
 * в любом порядке — список «прыгает» между обновлениями страницы.
 */
export const rosterOrderBy = [
  { shirtNumber: { sort: "asc", nulls: "last" } },
  { player: { lastName: "asc" } },
  { player: { firstName: "asc" } },
  { id: "asc" },
] satisfies Prisma.RosterEntryOrderByWithRelationInput[];

/** Тот же порядок, но с группировкой по амплуа: вратари, защитники, и т. д. */
export const rosterByPositionOrderBy = [
  { position: { sort: "asc", nulls: "last" } },
  ...rosterOrderBy,
] satisfies Prisma.RosterEntryOrderByWithRelationInput[];

/** Матчи, идущие прямо сейчас. */
export function findLiveMatches() {
  return prisma.match.findMany({
    where: { status: { in: LIVE_STATUSES } },
    orderBy: { kickoffAt: "asc" },
    ...matchCardArgs,
  });
}

/** Все матчи за календарный день (границы считаются вызывающим кодом). */
export function findMatchesBetween(from: Date, to: Date) {
  return prisma.match.findMany({
    where: { kickoffAt: { gte: from, lt: to } },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    ...matchCardArgs,
  });
}

export function findActiveTournaments() {
  return prisma.tournament.findMany({
    where: { status: { in: ["ONGOING", "UPCOMING"] } },
    orderBy: [{ status: "asc" }, { startDate: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      season: true,
      status: true,
      format: true,
      _count: { select: { entries: true, matches: true } },
    },
  });
}
