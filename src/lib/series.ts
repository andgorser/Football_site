import "server-only";

import type { TournamentFormat, TournamentStatus } from "@prisma/client";

import { computeStandings, matchOutcome, PLAYED_STATUSES, TABLE_STAGES } from "@/lib/football";
import { prisma } from "@/lib/prisma";

/**
 * История серии турниров: сезоны по годам, чемпионы и сводка команд.
 *
 * Ничего не хранится готовыми числами — как и везде в проекте, всё считается
 * из матчей. Ради этого запросов ровно три независимо от числа сезонов:
 * `getTournamentStandings` здесь намеренно не переиспользуется, иначе на
 * странице с десятью сезонами вышло бы тридцать запросов.
 */

type TeamInfo = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

export type SeasonPlace = {
  place: 1 | 2 | 3;
  entryId: number;
  team: TeamInfo;
};

export type SeasonRow = {
  tournament: {
    id: number;
    slug: string;
    name: string;
    season: string;
    format: TournamentFormat;
    status: TournamentStatus;
    startDate: Date;
  };
  /** Призёры. Пусто, если итоги ещё нельзя подвести */
  places: SeasonPlace[];
  /** Итоги предварительные — сезон ещё идёт */
  provisional: boolean;
  /** Откуда взяты призёры */
  source: "table" | "playoff" | "none";
  /** По какому дивизиону определён чемпион, если их несколько */
  placesDivisionName: string | null;
  /** Почему призёров нет — готовый текст для подсказки */
  note: string | null;
  teamCount: number;
  playedCount: number;
  goals: number;
};

export type SeriesTeamRow = {
  team: TeamInfo;
  seasons: number;
  titles: number;
  medals: number;
  bestPlace: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type SeriesOverview = {
  /** Отдаём наружу для getPlayerStats */
  tournamentIds: number[];
  /** Сезоны, свежие первыми */
  seasons: SeasonRow[];
  teams: SeriesTeamRow[];
};

export async function getSeriesOverview(seriesId: number): Promise<SeriesOverview> {
  const tournaments = await prisma.tournament.findMany({
    where: { seriesId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      season: true,
      format: true,
      status: true,
      startDate: true,
      pointsForWin: true,
      pointsForDraw: true,
      pointsForLoss: true,
    },
  });

  const ids = tournaments.map((t) => t.id);
  if (ids.length === 0) return { tournamentIds: [], seasons: [], teams: [] };

  const [entries, matches] = await Promise.all([
    prisma.tournamentTeam.findMany({
      where: { tournamentId: { in: ids } },
      select: {
        id: true,
        tournamentId: true,
        divisionId: true,
        pointsAdjustment: true,
        division: { select: { id: true, name: true, sortOrder: true } },
        team: {
          select: {
            id: true,
            slug: true,
            name: true,
            shortName: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
      },
    }),
    // Берём все матчи, а не только сыгранные: нужно отличать «финала в сетке
    // нет вовсе» от «финал ещё не сыгран» — это разные подписи на странице.
    prisma.match.findMany({
      where: { tournamentId: { in: ids } },
      select: {
        tournamentId: true,
        divisionId: true,
        stage: true,
        status: true,
        kickoffAt: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homeShootoutScore: true,
        awayShootoutScore: true,
      },
    }),
  ]);

  const entriesByTournament = new Map<number, typeof entries>();
  for (const entry of entries) {
    const list = entriesByTournament.get(entry.tournamentId) ?? [];
    list.push(entry);
    entriesByTournament.set(entry.tournamentId, list);
  }

  const matchesByTournament = new Map<number, typeof matches>();
  for (const match of matches) {
    const list = matchesByTournament.get(match.tournamentId) ?? [];
    list.push(match);
    matchesByTournament.set(match.tournamentId, list);
  }

  const entryById = new Map(entries.map((e) => [e.id, e]));

  const seasons: SeasonRow[] = tournaments.map((tournament) => {
    const seasonEntries = entriesByTournament.get(tournament.id) ?? [];
    const seasonMatches = matchesByTournament.get(tournament.id) ?? [];
    const played = seasonMatches.filter((m) => PLAYED_STATUSES.includes(m.status));

    const outcome = seasonPlaces(tournament, seasonEntries, seasonMatches, entryById);

    return {
      tournament: {
        id: tournament.id,
        slug: tournament.slug,
        name: tournament.name,
        season: tournament.season,
        format: tournament.format,
        status: tournament.status,
        startDate: tournament.startDate,
      },
      ...outcome,
      provisional: outcome.provisional || tournament.status !== "FINISHED",
      teamCount: seasonEntries.length,
      playedCount: played.length,
      goals: played.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0),
    };
  });

  return {
    tournamentIds: ids,
    seasons,
    teams: buildTeamRows(seasons, entries, matches, entryById),
  };
}

// ───────────────────────────── Призёры сезона ───────────────────────────────

type SeasonInput = {
  id: number;
  format: TournamentFormat;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
};

/**
 * Кто выиграл сезон.
 *
 * Если в турнире есть сыгранный финал — берём его: это покрывает и кубок,
 * и группы с плей-офф, и лигу с суперфиналом, так что проверять формат не надо.
 * Иначе — первое место таблицы.
 */
function seasonPlaces(
  tournament: SeasonInput,
  seasonEntries: Array<{
    id: number;
    divisionId: number | null;
    pointsAdjustment: number;
    division: { id: number; name: string; sortOrder: number } | null;
    team: TeamInfo;
  }>,
  seasonMatches: Array<{
    divisionId: number | null;
    stage: string;
    status: string;
    kickoffAt: Date;
    homeTeamId: number | null;
    awayTeamId: number | null;
    homeScore: number | null;
    awayScore: number | null;
    homeShootoutScore: number | null;
    awayShootoutScore: number | null;
  }>,
  entryById: Map<number, { id: number; team: TeamInfo }>,
): Pick<SeasonRow, "places" | "provisional" | "source" | "placesDivisionName" | "note"> {
  const empty = {
    places: [] as SeasonPlace[],
    provisional: false,
    source: "none" as const,
    placesDivisionName: null,
    note: null as string | null,
  };

  const placeOf = (entryId: number | null, place: 1 | 2 | 3): SeasonPlace | null => {
    const entry = entryId === null ? undefined : entryById.get(entryId);
    return entry ? { place, entryId: entry.id, team: entry.team } : null;
  };

  const final = seasonMatches.find((m) => m.stage === "FINAL");
  if (final) {
    const result = matchOutcome({
      status: final.status as never,
      homeTeamId: final.homeTeamId,
      awayTeamId: final.awayTeamId,
      homeScore: final.homeScore,
      awayScore: final.awayScore,
      homeShootoutScore: final.homeShootoutScore,
      awayShootoutScore: final.awayShootoutScore,
    });

    if (result.reason === "draw") {
      return {
        ...empty,
        provisional: true,
        note: "Финал завершился вничью — внесите серию пенальти в протоколе",
      };
    }
    if (result.winnerId === null) {
      // Финал ещё впереди. У лиги с заранее собранной сеткой полезнее показать
      // текущих лидеров таблицы, чем пустую строку, — но пометить как
      // промежуточные, чтобы никто не записал их в чемпионы раньше времени.
      const table = placesFromTable(tournament, seasonEntries, seasonMatches);
      if (table.places.length > 0) {
        return {
          ...table,
          provisional: true,
          note: "Финал ещё не сыгран — показаны лидеры таблицы",
        };
      }
      return { ...empty, provisional: true, note: "Финал ещё не сыгран" };
    }

    const places = [placeOf(result.winnerId, 1), placeOf(result.loserId, 2)].filter(
      (p): p is SeasonPlace => p !== null,
    );

    const third = seasonMatches.find((m) => m.stage === "THIRD_PLACE");
    if (third) {
      const thirdResult = matchOutcome({
        status: third.status as never,
        homeTeamId: third.homeTeamId,
        awayTeamId: third.awayTeamId,
        homeScore: third.homeScore,
        awayScore: third.awayScore,
        homeShootoutScore: third.homeShootoutScore,
        awayShootoutScore: third.awayShootoutScore,
      });
      const bronze = placeOf(thirdResult.winnerId, 3);
      if (bronze) places.push(bronze);
    }

    return { ...empty, places, source: "playoff" };
  }

  if (tournament.format === "CUP") {
    return { ...empty, provisional: true, note: "Сетка ещё не построена" };
  }

  return placesFromTable(tournament, seasonEntries, seasonMatches);
}

/** Призёры по круговой таблице: первый дивизион по sortOrder — высший. */
function placesFromTable(
  tournament: SeasonInput,
  seasonEntries: Array<{
    id: number;
    divisionId: number | null;
    pointsAdjustment: number;
    division: { id: number; name: string; sortOrder: number } | null;
    team: TeamInfo;
  }>,
  seasonMatches: Array<{
    divisionId: number | null;
    stage: string;
    status: string;
    kickoffAt: Date;
    homeTeamId: number | null;
    awayTeamId: number | null;
    homeScore: number | null;
    awayScore: number | null;
  }>,
): Pick<SeasonRow, "places" | "provisional" | "source" | "placesDivisionName" | "note"> {
  const empty = {
    places: [] as SeasonPlace[],
    provisional: false,
    source: "none" as const,
    placesDivisionName: null,
    note: null as string | null,
  };

  // Дивизионы группируем так же, как getTournamentStandings
  const byDivision = new Map<number | null, typeof seasonEntries>();
  for (const entry of seasonEntries) {
    const list = byDivision.get(entry.divisionId) ?? [];
    list.push(entry);
    byDivision.set(entry.divisionId, list);
  }
  if (byDivision.size === 0) return { ...empty, note: "Команды ещё не заявлены" };

  const ordered = [...byDivision.entries()].sort(
    (a, b) => (a[1][0].division?.sortOrder ?? 0) - (b[1][0].division?.sortOrder ?? 0),
  );
  const [divisionId, divisionEntries] = ordered[0];
  const entryIds = new Set(divisionEntries.map((e) => e.id));

  const tableMatches = seasonMatches.filter((m) => {
    if (!TABLE_STAGES.includes(m.stage as never)) return false;
    if (m.homeTeamId === null || m.awayTeamId === null) return false;
    if (m.divisionId !== null) return m.divisionId === divisionId;
    return entryIds.has(m.homeTeamId) && entryIds.has(m.awayTeamId);
  });

  const rows = computeStandings(
    divisionEntries,
    tableMatches.map((m) => ({
      status: m.status as never,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      kickoffAt: m.kickoffAt,
    })),
    tournament,
  );

  if (rows.length === 0 || rows.every((r) => r.played === 0)) {
    return { ...empty, provisional: true, note: "Матчи ещё не сыграны" };
  }

  return {
    places: rows.slice(0, 3).map((row, index) => ({
      place: (index + 1) as 1 | 2 | 3,
      entryId: row.entryId,
      team: divisionEntries.find((e) => e.id === row.entryId)!.team,
    })),
    provisional: false,
    source: "table",
    placesDivisionName: ordered.length > 1 ? (divisionEntries[0].division?.name ?? null) : null,
    note: null,
  };
}

// ───────────────────────────── Сводка команд ────────────────────────────────

/**
 * Итоги команд за все сезоны серии.
 *
 * Считаем по всем стадиям — это карточка команды, а не регламент таблицы.
 * Титулы и медали засчитываем только по завершённым сезонам: иначе лидер
 * текущего чемпионата получил бы титул задним числом.
 */
function buildTeamRows(
  seasons: SeasonRow[],
  entries: Array<{ id: number; tournamentId: number; team: TeamInfo }>,
  matches: Array<{
    status: string;
    homeTeamId: number | null;
    awayTeamId: number | null;
    homeScore: number | null;
    awayScore: number | null;
  }>,
  entryById: Map<number, { id: number; team: TeamInfo }>,
): SeriesTeamRow[] {
  const rows = new Map<string, SeriesTeamRow>();
  const seasonsByTeam = new Map<string, Set<number>>();

  const ensure = (team: TeamInfo): SeriesTeamRow => {
    if (!rows.has(team.id)) {
      rows.set(team.id, {
        team,
        seasons: 0,
        titles: 0,
        medals: 0,
        bestPlace: null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
    }
    return rows.get(team.id)!;
  };

  for (const entry of entries) {
    const row = ensure(entry.team);
    const seen = seasonsByTeam.get(entry.team.id) ?? new Set<number>();
    seen.add(entry.tournamentId);
    seasonsByTeam.set(entry.team.id, seen);
    row.seasons = seen.size;
  }

  for (const match of matches) {
    if (!PLAYED_STATUSES.includes(match.status as never)) continue;
    if (match.homeTeamId === null || match.awayTeamId === null) continue;
    if (match.homeScore === null || match.awayScore === null) continue;

    const home = entryById.get(match.homeTeamId);
    const away = entryById.get(match.awayTeamId);
    if (!home || !away) continue;

    const homeRow = ensure(home.team);
    const awayRow = ensure(away.team);

    homeRow.played++;
    awayRow.played++;
    homeRow.goalsFor += match.homeScore;
    homeRow.goalsAgainst += match.awayScore;
    awayRow.goalsFor += match.awayScore;
    awayRow.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      homeRow.won++;
      awayRow.lost++;
    } else if (match.homeScore < match.awayScore) {
      awayRow.won++;
      homeRow.lost++;
    } else {
      homeRow.drawn++;
      awayRow.drawn++;
    }
  }

  for (const season of seasons) {
    if (season.provisional) continue;
    for (const place of season.places) {
      const row = ensure(place.team);
      row.medals++;
      if (place.place === 1) row.titles++;
      row.bestPlace = row.bestPlace === null ? place.place : Math.min(row.bestPlace, place.place);
    }
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.titles - a.titles ||
      b.medals - a.medals ||
      b.won - a.won ||
      a.team.name.localeCompare(b.team.name, "ru"),
  );
}
