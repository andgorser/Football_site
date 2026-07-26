import "server-only";

import { revalidatePath } from "next/cache";
import type { MatchStatus } from "@prisma/client";

import { matchOutcome, placeIsTight, type StandingsRow } from "@/lib/football";
import { prisma } from "@/lib/prisma";
import { getTournamentStandings } from "@/lib/stats";

/**
 * Подстановка участников в сетку плей-офф.
 *
 * Матч плей-офф создаётся заранее, а вместо команды у него записан источник:
 * «1-е место дивизиона А» или «победитель матча №12». Эти функции превращают
 * источники в конкретные команды, как только те определяются.
 *
 * Главное свойство — обратимость. Функция не «дописывает» участников, а
 * приводит сетку в соответствие с текущими результатами: если судья откатил
 * статус или удалил победный гол, слот снова становится пустым. Иначе в финале
 * навсегда повисла бы команда, которая на самом деле не проходила дальше.
 */

type SlotSide = "home" | "away";

export type SlotState = "resolved" | "cleared" | "pending" | "locked" | "conflict";

export type SlotReport = {
  matchId: number;
  side: SlotSide;
  state: SlotState;
  teamId: number | null;
  /** Готовый русский текст для организатора */
  message: string;
};

type SlotMatch = {
  id: number;
  status: MatchStatus;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeShootoutScore: number | null;
  awayShootoutScore: number | null;
  homeSource: "TEAM" | "DIVISION_PLACE" | "MATCH_WINNER" | "MATCH_LOSER";
  homeSourceDivisionId: number | null;
  homeSourcePlace: number | null;
  homeSourceMatchId: number | null;
  awaySource: "TEAM" | "DIVISION_PLACE" | "MATCH_WINNER" | "MATCH_LOSER";
  awaySourceDivisionId: number | null;
  awaySourcePlace: number | null;
  awaySourceMatchId: number | null;
  eventCount: number;
  lineupCount: number;
};

const matchSelect = {
  id: true,
  status: true,
  homeTeamId: true,
  awayTeamId: true,
  homeScore: true,
  awayScore: true,
  homeShootoutScore: true,
  awayShootoutScore: true,
  homeSource: true,
  homeSourceDivisionId: true,
  homeSourcePlace: true,
  homeSourceMatchId: true,
  awaySource: true,
  awaySourceDivisionId: true,
  awaySourcePlace: true,
  awaySourceMatchId: true,
  _count: { select: { events: true, lineups: true } },
} as const;

/**
 * Дивизионы, где регулярный этап полностью доигран.
 *
 * Отменённый матч подведению итогов не мешает — он не будет сыгран никогда.
 * А вот перенесённый и любой идущий прямо сейчас мешают: места ещё могут
 * поменяться, и подставлять по ним участника рано.
 */
export async function completedDivisionIds(tournamentId: number): Promise<Set<number>> {
  const rows = await prisma.match.groupBy({
    by: ["divisionId", "status"],
    where: { tournamentId, stage: "REGULAR", divisionId: { not: null } },
    _count: { _all: true },
  });

  const blocking: MatchStatus[] = [
    "SCHEDULED",
    "POSTPONED",
    "FIRST_HALF",
    "HALF_TIME",
    "SECOND_HALF",
    "EXTRA_TIME",
    "PENALTY_SHOOTOUT",
  ];

  const seen = new Set<number>();
  const pending = new Set<number>();
  for (const row of rows) {
    if (row.divisionId === null) continue;
    seen.add(row.divisionId);
    if (blocking.includes(row.status)) pending.add(row.divisionId);
  }

  return new Set([...seen].filter((id) => !pending.has(id)));
}

type Resolution =
  | { kind: "team"; teamId: number }
  | { kind: "empty"; reason: string }
  | { kind: "skip" };

/** Кого источник даёт прямо сейчас. */
function resolveSide(
  match: SlotMatch,
  side: SlotSide,
  byId: Map<number, SlotMatch>,
  standings: Map<number, StandingsRow[]>,
  completedDivisions: Set<number>,
  divisionNames: Map<number, string>,
): Resolution {
  const source = side === "home" ? match.homeSource : match.awaySource;
  if (source === "TEAM") return { kind: "skip" };

  if (source === "DIVISION_PLACE") {
    const divisionId = side === "home" ? match.homeSourceDivisionId : match.awaySourceDivisionId;
    const place = side === "home" ? match.homeSourcePlace : match.awaySourcePlace;
    if (!divisionId || !place) return { kind: "empty", reason: "Источник заполнен не полностью" };

    const name = divisionNames.get(divisionId) ?? `дивизион №${divisionId}`;
    if (!completedDivisions.has(divisionId)) {
      return { kind: "empty", reason: `${name} ещё не доигран` };
    }

    const rows = standings.get(divisionId) ?? [];
    const row = rows[place - 1];
    if (!row) {
      return { kind: "empty", reason: `В дивизионе «${name}» нет ${place}-го места` };
    }
    return { kind: "team", teamId: row.entryId };
  }

  // MATCH_WINNER / MATCH_LOSER
  const sourceMatchId = side === "home" ? match.homeSourceMatchId : match.awaySourceMatchId;
  if (!sourceMatchId) return { kind: "empty", reason: "Матч-источник не выбран" };

  const sourceMatch = byId.get(sourceMatchId);
  if (!sourceMatch) return { kind: "empty", reason: `Матч №${sourceMatchId} не найден` };

  const outcome = matchOutcome(sourceMatch);
  switch (outcome.reason) {
    case "not_played":
      return { kind: "empty", reason: `Матч №${sourceMatchId} ещё не сыгран` };
    case "no_teams":
      return { kind: "empty", reason: `У матча №${sourceMatchId} ещё нет участников` };
    case "draw":
      return {
        kind: "empty",
        reason: `Матч №${sourceMatchId} завершился вничью — внесите серию пенальти в протоколе`,
      };
    default:
      break;
  }

  const teamId = source === "MATCH_WINNER" ? outcome.winnerId : outcome.loserId;
  return teamId === null
    ? { kind: "empty", reason: `Не удалось определить исход матча №${sourceMatchId}` }
    : { kind: "team", teamId };
}

/**
 * Приводит все слоты турнира в соответствие с текущими результатами.
 *
 * Каскад «1/4 → 1/2 → финал» разрешается методом неподвижной точки: проходы
 * повторяются, пока хоть один слот меняется. Матчей в сетке единицы, поэтому
 * это дешевле и понятнее топологической сортировки и заодно не зацикливается.
 */
export async function resolvePlayoffSlots(tournamentId: number): Promise<SlotReport[]> {
  const raw = await prisma.match.findMany({
    where: { tournamentId },
    select: matchSelect,
  });

  const matches: SlotMatch[] = raw.map(({ _count, ...rest }) => ({
    ...rest,
    eventCount: _count.events,
    lineupCount: _count.lineups,
  }));

  const slotMatches = matches.filter((m) => m.homeSource !== "TEAM" || m.awaySource !== "TEAM");
  if (slotMatches.length === 0) return [];

  const byId = new Map(matches.map((m) => [m.id, m]));

  // Таблицы считаем один раз и только если они кому-то нужны
  const needsStandings = slotMatches.some(
    (m) => m.homeSource === "DIVISION_PLACE" || m.awaySource === "DIVISION_PLACE",
  );
  const standings = new Map<number, StandingsRow[]>();
  const divisionNames = new Map<number, string>();
  let completedDivisions = new Set<number>();

  if (needsStandings) {
    const [divisions, completed] = await Promise.all([
      getTournamentStandings(tournamentId),
      completedDivisionIds(tournamentId),
    ]);
    for (const division of divisions) {
      if (division.divisionId === null) continue;
      standings.set(division.divisionId, division.rows);
      divisionNames.set(division.divisionId, division.divisionName);
    }
    completedDivisions = completed;
  }

  const reports: SlotReport[] = [];
  const changed = new Map<number, { homeTeamId?: number | null; awayTeamId?: number | null }>();

  let iterations = 0;
  let dirty = true;
  while (dirty && iterations <= matches.length + 1) {
    dirty = false;
    iterations++;

    for (const match of slotMatches) {
      for (const side of ["home", "away"] as const) {
        const resolution = resolveSide(
          match,
          side,
          byId,
          standings,
          completedDivisions,
          divisionNames,
        );
        if (resolution.kind === "skip") continue;

        const current = side === "home" ? match.homeTeamId : match.awayTeamId;
        const want = resolution.kind === "team" ? resolution.teamId : null;
        if (want === current) continue;

        // Матч уже начался или в нём есть протокол — участника не подменяем
        const locked =
          match.status !== "SCHEDULED" || match.eventCount > 0 || match.lineupCount > 0;
        if (locked) {
          reports.push({
            matchId: match.id,
            side,
            state: "locked",
            teamId: current,
            message: `Матч №${match.id} уже начался — участник не пересчитан`,
          });
          continue;
        }

        const otherSide = side === "home" ? match.awayTeamId : match.homeTeamId;
        if (want !== null && want === otherSide) {
          reports.push({
            matchId: match.id,
            side,
            state: "conflict",
            teamId: current,
            message: `В матче №${match.id} обе стороны дают одну и ту же команду`,
          });
          continue;
        }

        if (side === "home") match.homeTeamId = want;
        else match.awayTeamId = want;

        const patch = changed.get(match.id) ?? {};
        if (side === "home") patch.homeTeamId = want;
        else patch.awayTeamId = want;
        changed.set(match.id, patch);
        dirty = true;
      }
    }
  }

  // Итоговый отчёт по слотам, которые остались пустыми
  for (const match of slotMatches) {
    for (const side of ["home", "away"] as const) {
      const source = side === "home" ? match.homeSource : match.awaySource;
      if (source === "TEAM") continue;
      const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
      if (teamId !== null) {
        if (changed.get(match.id)?.[side === "home" ? "homeTeamId" : "awayTeamId"] !== undefined) {
          reports.push({
            matchId: match.id,
            side,
            state: "resolved",
            teamId,
            message: `Матч №${match.id}: участник определён`,
          });
        }
        continue;
      }
      if (reports.some((r) => r.matchId === match.id && r.side === side)) continue;

      const resolution = resolveSide(match, side, byId, standings, completedDivisions, divisionNames);
      reports.push({
        matchId: match.id,
        side,
        state: changed.has(match.id) ? "cleared" : "pending",
        teamId: null,
        message:
          resolution.kind === "empty"
            ? `Матч №${match.id}: ${resolution.reason}`
            : `Матч №${match.id}: участник не определён`,
      });
    }
  }

  if (changed.size > 0) {
    await prisma.$transaction(
      [...changed.entries()].map(([id, data]) => prisma.match.update({ where: { id }, data })),
    );

    revalidatePath("/");
    revalidatePath("/tournaments", "layout");
    for (const id of changed.keys()) {
      revalidatePath(`/matches/${id}`);
      revalidatePath(`/referee/${id}`);
    }
  }

  // Предупреждение о спорном месте: слот заполняем, но просим перепроверить
  for (const match of slotMatches) {
    for (const side of ["home", "away"] as const) {
      const source = side === "home" ? match.homeSource : match.awaySource;
      if (source !== "DIVISION_PLACE") continue;
      const divisionId = side === "home" ? match.homeSourceDivisionId : match.awaySourceDivisionId;
      const place = side === "home" ? match.homeSourcePlace : match.awaySourcePlace;
      if (!divisionId || !place) continue;
      const rows = standings.get(divisionId);
      if (rows && placeIsTight(rows, place)) {
        reports.push({
          matchId: match.id,
          side,
          state: "resolved",
          teamId: side === "home" ? match.homeTeamId : match.awayTeamId,
          message: `Места ${place} и ${place + 1} в дивизионе «${divisionNames.get(divisionId)}» делятся по личным встречам — проверьте`,
        });
      }
    }
  }

  return reports;
}

/**
 * Пересчёт сетки после изменения результата матча.
 *
 * Никогда не бросает исключение: сетка не должна мешать судье вести матч.
 * Если у турнира нет слотовых матчей, выходим сразу — обычной лиге эта
 * работа не нужна вовсе.
 */
export async function propagateAfterResult(matchId: number): Promise<void> {
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { tournamentId: true },
    });
    if (!match) return;

    const slots = await prisma.match.count({
      where: {
        tournamentId: match.tournamentId,
        OR: [{ homeSource: { not: "TEAM" } }, { awaySource: { not: "TEAM" } }],
      },
    });
    if (slots === 0) return;

    await resolvePlayoffSlots(match.tournamentId);
  } catch (error) {
    console.error("playoff: не удалось пересчитать сетку", error);
  }
}
