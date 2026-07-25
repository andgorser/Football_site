import "server-only";

import { prisma } from "@/lib/prisma";
import {
  PLAYED_STATUSES,
  TABLE_STAGES,
  computeStandings,
  shortName,
  type PlayerStatRow,
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
  rows: StandingsRow[];
};

export async function getTournamentStandings(
  tournamentId: number,
): Promise<DivisionStandings[]> {
  const [tournament, entries, matches] = await Promise.all([
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
    prisma.match.findMany({
      where: {
        tournamentId,
        stage: { in: TABLE_STAGES },
        status: { in: PLAYED_STATUSES },
      },
      select: {
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        kickoffAt: true,
      },
    }),
  ]);

  const rules = tournament ?? { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 };

  // Разбиваем по дивизионам. Фильтр по entryIds ниже нужен даже после отбора
  // по стадии: регулярный матч между командами разных дивизионов (стыковой,
  // товарищеский) не должен попасть ни в одну таблицу.
  const divisions = new Map<number | null, { name: string; sortOrder: number; entries: typeof entries }>();
  for (const entry of entries) {
    const key = entry.divisionId;
    if (!divisions.has(key)) {
      divisions.set(key, {
        name: entry.division?.name ?? "Общая таблица",
        sortOrder: entry.division?.sortOrder ?? 0,
        entries: [],
      });
    }
    divisions.get(key)!.entries.push(entry);
  }

  return [...divisions.entries()]
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([divisionId, division]) => {
      const entryIds = new Set(division.entries.map((e) => e.id));
      return {
        divisionId,
        divisionName: division.name,
        rows: computeStandings(
          division.entries,
          matches.filter(
            (m) =>
              m.homeTeamId !== null &&
              m.awayTeamId !== null &&
              entryIds.has(m.homeTeamId) &&
              entryIds.has(m.awayTeamId),
          ),
          rules,
        ),
      };
    });
}

// ───────────────────────────── Статистика игроков ───────────────────────────

type StatAccumulator = PlayerStatRow & { matchIds: Set<number> };

function emptyRow(
  playerId: string,
  playerName: string,
  team: { id: string; name: string; shortName: string; slug: string },
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
  teamId?: string;
  playerId?: string;
  limit?: number;
}): Promise<PlayerStatRow[]> {
  const matchWhere = {
    status: { in: PLAYED_STATUSES },
    ...(options.tournamentId ? { tournamentId: options.tournamentId } : {}),
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
    if (options.teamId && team.id !== options.teamId) return null;
    if (options.playerId && entry.player.id !== options.playerId) return null;
    if (!rows.has(entry.player.id)) {
      rows.set(entry.player.id, emptyRow(entry.player.id, shortName(entry.player), team));
    }
    return rows.get(entry.player.id)!;
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

  const result = [...rows.values()].map(({ matchIds, ...row }) => ({
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
    select: { team: { select: { id: true, name: true, shortName: true, slug: true } } },
  },
} as const;

type RosterInfo = {
  id: number;
  player: { id: string; firstName: string; lastName: string };
  tournamentTeam: { team: { id: string; name: string; shortName: string; slug: string } };
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
