import "server-only";

import { prisma } from "@/lib/prisma";
import {
  PLAYED_STATUSES,
  TABLE_STAGES,
  computeStandings,
  shortName,
  type PlayerStatRow,
  type StandingsCarry,
  type StandingsRow,
} from "@/lib/football";

/**
 * Вся статистика считается из событий матчей на лету.
 *
 * Для университетской лиги это несколько тысяч строк — база справляется
 * мгновенно, зато нет ни одного «предпосчитанного» числа, которое могло бы
 * разойтись с реальностью после правки протокола.
 */

// ───────────────────────────── Турнирная таблица ────────────────────────────

export type DivisionStandings = {
  divisionId: number | null;
  divisionName: string;
  /** Откуда перенесены очки и статистика; null — переноса не было */
  parentDivisionId: number | null;
  parentDivisionName: string | null;
  /** Этап завершён и разбит на половины — таблица показывается как архив */
  isArchived: boolean;
  rows: StandingsRow[];
};

/**
 * Турнирные таблицы по дивизионам.
 *
 * Главное правило: **матч учитывается в том дивизионе, в котором он сыгран**
 * (`Match.divisionId`). Раньше матчи отбирались по признаку «обе команды сейчас
 * в этом дивизионе», и после разделения дивизиона на половины таблица первого
 * этапа исчезала вместе с уехавшими командами, а часть матчей задваивалась.
 *
 * Для матчей без дивизиона работает прежнее правило — иначе сломались бы лиги
 * без дивизионов и матчи, заведённые вручную до появления этой возможности.
 */
export async function getTournamentStandings(
  tournamentId: number,
): Promise<DivisionStandings[]> {
  const [tournament, entries, divisionRows, matches] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { pointsForWin: true, pointsForDraw: true, pointsForLoss: true },
    }),
    prisma.tournamentTeam.findMany({
      where: { tournamentId },
      select: {
        id: true,
        divisionId: true,
        pointsAdjustment: true,
        division: { select: { id: true, name: true, sortOrder: true } },
        team: { select: { id: true, name: true, shortName: true, slug: true, logoUrl: true } },
      },
    }),
    // Дивизионы читаем напрямую: у архивного заявок уже не осталось,
    // а его название и связь с потомками всё равно нужны.
    prisma.division.findMany({
      where: { tournamentId },
      select: { id: true, name: true, sortOrder: true, parentDivisionId: true },
    }),
    // Без фильтра по статусу: состав архивного дивизиона выводится из его
    // матчей и должен быть полным. Несыгранные отсеет computeStandings.
    prisma.match.findMany({
      where: { tournamentId, stage: { in: TABLE_STAGES } },
      select: {
        status: true,
        divisionId: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        kickoffAt: true,
      },
    }),
  ]);

  const rules = tournament ?? { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 };

  type Entry = (typeof entries)[number];
  type Bucket = {
    divisionId: number | null;
    name: string;
    sortOrder: number;
    parentDivisionId: number | null;
    isArchived: boolean;
    entries: Entry[];
    entryIds: Set<number>;
    matches: typeof matches;
  };

  const entryById = new Map(entries.map((e) => [e.id, e]));
  const archivedIds = new Set(
    divisionRows.map((d) => d.parentDivisionId).filter((id): id is number => id !== null),
  );

  const buckets = new Map<number | null, Bucket>();
  const makeBucket = (
    divisionId: number | null,
    name: string,
    sortOrder: number,
    parentDivisionId: number | null,
  ): Bucket => {
    const bucket: Bucket = {
      divisionId,
      name,
      sortOrder,
      parentDivisionId,
      isArchived: divisionId !== null && archivedIds.has(divisionId),
      entries: [],
      entryIds: new Set(),
      matches: [],
    };
    buckets.set(divisionId, bucket);
    return bucket;
  };

  for (const division of divisionRows) {
    makeBucket(division.id, division.name, division.sortOrder, division.parentDivisionId);
  }

  const addEntry = (bucket: Bucket, entry: Entry) => {
    if (bucket.entryIds.has(entry.id)) return;
    bucket.entryIds.add(entry.id);
    bucket.entries.push(entry);
  };

  for (const entry of entries) {
    const key = entry.divisionId;
    const bucket = buckets.get(key) ?? makeBucket(key, "Общая таблица", 0, null);
    addEntry(bucket, entry);
  }

  // Команды архивного дивизиона: заявки уже уехали в половины, поэтому состав
  // восстанавливаем по матчам, которые в этом дивизионе сыграны.
  for (const match of matches) {
    if (match.divisionId === null) continue;
    const bucket = buckets.get(match.divisionId);
    if (!bucket || !bucket.isArchived) continue;
    for (const id of [match.homeTeamId, match.awayTeamId]) {
      const entry = id === null ? undefined : entryById.get(id);
      if (entry) addEntry(bucket, entry);
    }
  }

  // Раскладываем матчи по дивизионам
  for (const match of matches) {
    if (match.homeTeamId === null || match.awayTeamId === null) continue;

    const own = match.divisionId === null ? undefined : buckets.get(match.divisionId);
    if (own) {
      // Страховка от матча, помеченного чужим дивизионом
      if (own.entryIds.has(match.homeTeamId) && own.entryIds.has(match.awayTeamId)) {
        own.matches.push(match);
      }
      continue;
    }

    // Дивизион у матча не указан — прежнее правило: обе команды в одном месте
    const home = entryById.get(match.homeTeamId);
    const away = entryById.get(match.awayTeamId);
    if (!home || !away || home.divisionId !== away.divisionId) continue;
    buckets.get(home.divisionId)?.matches.push(match);
  }

  const withTeams = [...buckets.values()].filter((bucket) => bucket.entries.length > 0);

  // Порядок внутри корзины фиксируем: у полностью равных команд сортировка
  // упирается в личные встречи, а они не дают полного порядка — тогда итог
  // зависел бы от того, в каком порядке база отдала строки.
  for (const bucket of withTeams) bucket.entries.sort((a, b) => a.id - b.id);

  // Предков считаем раньше потомков: перенос берётся из готовой таблицы предка.
  const depthOf = (bucket: Bucket): number => {
    let depth = 0;
    let current = bucket;
    // Ограничение глубины — защита от цикла, который CHECK не ловит
    while (current.parentDivisionId !== null && depth < 10) {
      const parent = buckets.get(current.parentDivisionId);
      if (!parent) break;
      current = parent;
      depth++;
    }
    return depth;
  };

  const ordered = [...withTeams].sort((a, b) => depthOf(a) - depthOf(b));
  const computed = new Map<number | null, StandingsRow[]>();

  for (const bucket of ordered) {
    let carryOver: Map<number, StandingsCarry> | undefined;
    const parentRows = bucket.parentDivisionId === null ? undefined : computed.get(bucket.parentDivisionId);
    if (parentRows) {
      carryOver = new Map();
      for (const row of parentRows) {
        if (!bucket.entryIds.has(row.entryId)) continue;
        carryOver.set(row.entryId, {
          played: row.played,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          points: row.points,
          form: row.form,
        });
      }
    }
    computed.set(bucket.divisionId, computeStandings(bucket.entries, bucket.matches, rules, carryOver));
  }

  const nameOf = (divisionId: number | null) =>
    divisionId === null ? null : (buckets.get(divisionId)?.name ?? null);

  return withTeams
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((bucket) => ({
      divisionId: bucket.divisionId,
      divisionName: bucket.name,
      parentDivisionId: bucket.parentDivisionId,
      parentDivisionName: nameOf(bucket.parentDivisionId),
      isArchived: bucket.isArchived,
      rows: computed.get(bucket.divisionId) ?? [],
    }));
}

// ───────────────────────────── Статистика игроков ───────────────────────────

type StatAccumulator = PlayerStatRow & {
  matchIds: Set<number>;
  /** Из какого турнира взята показанная команда — см. pickTeam ниже */
  teamPickedAt: { startDate: Date; tournamentId: number };
};

function emptyRow(
  playerId: string,
  playerName: string,
  team: { id: string; name: string; shortName: string; slug: string },
  tournament: { id: number; startDate: Date },
): StatAccumulator {
  return {
    playerId,
    playerName,
    teamId: team.id,
    teamName: team.name,
    teamShortName: team.shortName,
    teamSlug: team.slug,
    matches: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    points: 0,
    matchIds: new Set<number>(),
    teamPickedAt: { startDate: tournament.startDate, tournamentId: tournament.id },
  };
}

/**
 * Статистика всех игроков турнира. Если tournamentId не задан — по всем
 * турнирам сразу (для общей страницы статистики).
 *
 * В отличие от турнирной таблицы, здесь матчи плей-офф УЧИТЫВАЮТСЯ. Таблица
 * реализует регламент кругового турнира, а список бомбардиров отвечает на
 * вопрос «кто больше забил за турнир» — гол в финале из него не выкинешь,
 * иначе цифры на страницах матча, игрока и статистики разойдутся.
 */
export async function getPlayerStats(options: {
  tournamentId?: number;
  /** Несколько турниров сразу — для истории серии по годам */
  tournamentIds?: number[];
  teamId?: string;
  playerId?: string;
  limit?: number;
}): Promise<PlayerStatRow[]> {
  // Явный if/else, а не два спреда подряд: иначе при передаче обоих полей одно
  // молча затирало бы другое. Проверяем именно Array.isArray, а не длину —
  // пустой массив означает «ни одного турнира» (серия без сезонов), а не «все».
  const tournamentFilter = Array.isArray(options.tournamentIds)
    ? { tournamentId: { in: options.tournamentIds } }
    : options.tournamentId
      ? { tournamentId: options.tournamentId }
      : {};

  const matchWhere = {
    status: { in: PLAYED_STATUSES },
    ...tournamentFilter,
  };

  const [events, lineups] = await Promise.all([
    prisma.matchEvent.findMany({
      where: { match: matchWhere },
      select: {
        matchId: true,
        type: true,
        playerId: true,
        assistPlayerId: true,
        player: { select: { ...rosterSelect } },
        assistPlayer: { select: { ...rosterSelect } },
      },
    }),
    prisma.matchLineup.findMany({
      where: { match: matchWhere },
      select: {
        matchId: true,
        isStarting: true,
        rosterEntry: { select: { ...rosterSelect } },
      },
    }),
  ]);

  const rows = new Map<string, StatAccumulator>();

  function ensure(entry: RosterInfo | null): StatAccumulator | null {
    if (!entry) return null;
    const team = entry.tournamentTeam.team;
    const tournament = entry.tournamentTeam.tournament;
    if (options.teamId && team.id !== options.teamId) return null;
    if (options.playerId && entry.player.id !== options.playerId) return null;

    const existing = rows.get(entry.player.id);
    if (!existing) {
      const created = emptyRow(entry.player.id, shortName(entry.player), team, tournament);
      rows.set(entry.player.id, created);
      return created;
    }

    // Игрок за сезон мог сменить команду. Строка остаётся одна (иначе список
    // бомбардиров за все годы раздвоится, а карточка игрока покажет лишь часть
    // статистики), но команду берём из самого позднего турнира — иначе она
    // зависела бы от порядка, в котором база отдала строки.
    const picked = existing.teamPickedAt;
    const newer =
      tournament.startDate.getTime() > picked.startDate.getTime() ||
      (tournament.startDate.getTime() === picked.startDate.getTime() &&
        tournament.id > picked.tournamentId);
    if (newer) {
      existing.teamId = team.id;
      existing.teamName = team.name;
      existing.teamShortName = team.shortName;
      existing.teamSlug = team.slug;
      existing.teamPickedAt = { startDate: tournament.startDate, tournamentId: tournament.id };
    }
    return existing;
  }

  // Матчи: считаем стартовый состав. Вышедшие на замену добавятся ниже.
  for (const lineup of lineups) {
    if (!lineup.isStarting) continue;
    const row = ensure(lineup.rosterEntry);
    if (row) row.matchIds.add(lineup.matchId);
  }

  for (const event of events) {
    const row = ensure(event.player);
    if (row) {
      switch (event.type) {
        case "GOAL":
        case "PENALTY_GOAL":
          row.goals++;
          break;
        case "YELLOW_CARD":
          row.yellowCards++;
          break;
        case "SECOND_YELLOW_CARD":
        case "RED_CARD":
          row.redCards++;
          break;
        case "SUBSTITUTION":
          // Вышел на замену — значит, матч ему засчитан
          row.matchIds.add(event.matchId);
          break;
        default:
          break;
      }
    }

    const assistRow = ensure(event.assistPlayer);
    if (assistRow && (event.type === "GOAL" || event.type === "PENALTY_GOAL")) {
      assistRow.assists++;
    }
  }

  const result = [...rows.values()].map(({ matchIds, teamPickedAt: _picked, ...row }) => ({
    ...row,
    matches: matchIds.size,
    points: row.goals + row.assists,
  }));

  result.sort(
    (a, b) =>
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.matches - b.matches ||
      a.playerName.localeCompare(b.playerName, "ru"),
  );

  return options.limit ? result.slice(0, options.limit) : result;
}

const rosterSelect = {
  id: true,
  player: { select: { id: true, firstName: true, lastName: true } },
  tournamentTeam: {
    select: {
      team: { select: { id: true, name: true, shortName: true, slug: true } },
      // Нужен, чтобы у игрока, сменившего команду, показывалась команда
      // из самого позднего турнира, а не случайная
      tournament: { select: { id: true, startDate: true } },
    },
  },
} as const;

type RosterInfo = {
  id: number;
  player: { id: string; firstName: string; lastName: string };
  tournamentTeam: {
    team: { id: string; name: string; shortName: string; slug: string };
    tournament: { id: number; startDate: Date };
  };
};

// ───────────────────────────── Итоги команды ────────────────────────────────

export type TeamSummary = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
};

/**
 * Итоги команды по ВСЕМ сыгранным матчам, включая плей-офф: это карточка
 * команды, а не турнирная таблица, и победа в финале здесь должна считаться.
 */
export async function getTeamSummary(teamId: string): Promise<TeamSummary> {
  const matches = await prisma.match.findMany({
    where: {
      status: { in: PLAYED_STATUSES },
      OR: [{ homeTeam: { teamId } }, { awayTeam: { teamId } }],
    },
    select: {
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { teamId: true } },
      awayTeam: { select: { teamId: true } },
    },
  });

  const summary: TeamSummary = {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
  };

  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    // У матча плей-офф участник может быть ещё не подставлен
    if (!match.homeTeam || !match.awayTeam) continue;
    const isHome = match.homeTeam.teamId === teamId;
    const scored = isHome ? match.homeScore : match.awayScore;
    const conceded = isHome ? match.awayScore : match.homeScore;

    summary.played++;
    summary.goalsFor += scored;
    summary.goalsAgainst += conceded;
    if (conceded === 0) summary.cleanSheets++;
    if (scored > conceded) summary.won++;
    else if (scored === conceded) summary.drawn++;
    else summary.lost++;
  }

  return summary;
}
