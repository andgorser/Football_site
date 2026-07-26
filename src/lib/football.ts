import type {
  MatchEventType,
  MatchStage,
  MatchStatus,
  MsuStatus,
  PlayerPosition,
  Role,
} from "@prisma/client";

// Чистые функции футбольной логики: никаких обращений к базе,
// поэтому их одинаково можно звать и на сервере, и в браузере.

// ───────────────────────────── Статусы матча ────────────────────────────────

/** Статусы, при которых матч считается идущим прямо сейчас. */
export const LIVE_STATUSES: MatchStatus[] = [
  "FIRST_HALF",
  "HALF_TIME",
  "SECOND_HALF",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
];

/** Статусы, при которых у матча есть окончательный результат. */
export const PLAYED_STATUSES: MatchStatus[] = ["FINISHED", "WALKOVER"];

/**
 * Матч «в работе»: результата ещё нет.
 *
 * Из рабочих списков судьи и организатора такие матчи не должны исчезать
 * никогда — в том числе перенесённые, чья старая дата давно прошла.
 * Поэтому фильтр по дате применяется только к матчам с окончательным статусом.
 */
export const OPEN_STATUSES: MatchStatus[] = ["SCHEDULED", "POSTPONED", ...LIVE_STATUSES];

/**
 * Стадии, которые идут в зачёт круговой таблицы.
 *
 * Плей-офф в таблицу не входит: иначе матч на вылет между двумя командами
 * одного дивизиона (обычное дело, когда поверх дивизионов играется общий
 * плей-офф) накрутил бы им очки в круговом турнире.
 */
export const TABLE_STAGES: MatchStage[] = ["REGULAR"];

export function isLive(status: MatchStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

export function isPlayed(status: MatchStatus): boolean {
  return PLAYED_STATUSES.includes(status);
}

/** Идут ли в этот момент игровые часы (в перерыве — нет). */
export function isClockRunning(status: MatchStatus): boolean {
  return status === "FIRST_HALF" || status === "SECOND_HALF" || status === "EXTRA_TIME";
}

/**
 * Длительность тайма для конкретного матча.
 *
 * Регламент задаётся турниром, но дивизион может его переопределить:
 * в одном турнире 8×8 и 6×6 играют тайм разной длины. Считаем в одном месте,
 * чтобы табло судьи и подписи на сайте не разошлись.
 */
export function halfDurationOf(
  division: { halfDurationMin: number | null } | null | undefined,
  tournament: { halfDurationMin: number },
): number {
  return division?.halfDurationMin ?? tournament.halfDurationMin;
}

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  SCHEDULED: "Не начался",
  FIRST_HALF: "1-й тайм",
  HALF_TIME: "Перерыв",
  SECOND_HALF: "2-й тайм",
  EXTRA_TIME: "Доп. время",
  PENALTY_SHOOTOUT: "Пенальти",
  FINISHED: "Завершён",
  POSTPONED: "Перенесён",
  CANCELLED: "Отменён",
  WALKOVER: "Тех. результат",
};

/** Короткая метка для карточки матча. */
export const MATCH_STATUS_SHORT: Record<MatchStatus, string> = {
  SCHEDULED: "",
  FIRST_HALF: "1Т",
  HALF_TIME: "ПЕР",
  SECOND_HALF: "2Т",
  EXTRA_TIME: "ДВ",
  PENALTY_SHOOTOUT: "ПЕН",
  FINISHED: "ЗАВ",
  POSTPONED: "ПЕР.",
  CANCELLED: "ОТМ",
  WALKOVER: "ТЕХ",
};

export const MATCH_STAGE_LABEL: Record<MatchStage, string> = {
  REGULAR: "Регулярный этап",
  PRELIMINARY: "Предварительный раунд",
  ROUND_OF_32: "1/16 финала",
  ROUND_OF_16: "1/8 финала",
  QUARTER_FINAL: "1/4 финала",
  SEMI_FINAL: "1/2 финала",
  THIRD_PLACE: "Матч за 3-е место",
  FINAL: "Финал",
};

/** Стадии плей-офф в порядке следования — это же порядок колонок сетки. */
export const PLAYOFF_STAGES: MatchStage[] = [
  "PRELIMINARY",
  "ROUND_OF_32",
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "FINAL",
  "THIRD_PLACE",
];

export function isPlayoffStage(stage: MatchStage): boolean {
  return stage !== "REGULAR";
}

// ───────────────────────────── Прочие словари ───────────────────────────────

export const POSITION_LABEL: Record<PlayerPosition, string> = {
  GK: "Вратарь",
  DF: "Защитник",
  MF: "Полузащитник",
  FW: "Нападающий",
};

export const POSITION_SHORT: Record<PlayerPosition, string> = {
  GK: "ВР",
  DF: "ЗЩ",
  MF: "ПЗ",
  FW: "НП",
};

export const MSU_STATUS_LABEL: Record<MsuStatus, string> = {
  STUDENT: "Студент",
  POSTGRAD: "Аспирант",
  ALUMNI: "Выпускник",
  STAFF: "Сотрудник",
  GUEST: "Не из МГУ",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Организатор",
  REFEREE: "Судья",
  CAPTAIN: "Капитан",
  VIEWER: "Зритель",
};

export const EVENT_LABEL: Record<MatchEventType, string> = {
  GOAL: "Гол",
  PENALTY_GOAL: "Гол с пенальти",
  OWN_GOAL: "Автогол",
  PENALTY_MISSED: "Нереализованный пенальти",
  YELLOW_CARD: "Жёлтая карточка",
  SECOND_YELLOW_CARD: "Вторая жёлтая",
  RED_CARD: "Красная карточка",
  SUBSTITUTION: "Замена",
};

export const EVENT_ICON: Record<MatchEventType, string> = {
  GOAL: "⚽",
  PENALTY_GOAL: "⚽",
  OWN_GOAL: "⚽",
  PENALTY_MISSED: "✖",
  YELLOW_CARD: "🟨",
  SECOND_YELLOW_CARD: "🟨🟥",
  RED_CARD: "🟥",
  SUBSTITUTION: "🔁",
};

/** Типы событий, которые меняют счёт на табло. */
export const SCORING_EVENTS: MatchEventType[] = ["GOAL", "PENALTY_GOAL", "OWN_GOAL"];

// ───────────────────────────── Счёт матча ───────────────────────────────────

type ScoringEvent = { type: MatchEventType; tournamentTeamId: number };

/**
 * Считает счёт по событиям. Автогол засчитывается сопернику той команды,
 * за которую заявлен автор — поэтому счёт нельзя просто «сложить голы».
 */
export function scoreFromEvents(
  events: ScoringEvent[],
  homeTeamId: number,
  awayTeamId: number,
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.type === "GOAL" || e.type === "PENALTY_GOAL") {
      if (e.tournamentTeamId === homeTeamId) home++;
      else if (e.tournamentTeamId === awayTeamId) away++;
    } else if (e.type === "OWN_GOAL") {
      if (e.tournamentTeamId === homeTeamId) away++;
      else if (e.tournamentTeamId === awayTeamId) home++;
    }
  }
  return { home, away };
}

// ───────────────────────────── Исход матча ──────────────────────────────────

export type MatchOutcomeReason =
  | "score" // определён основным временем
  | "shootout" // определён серией пенальти
  | "draw" // ничья без серии пенальти — победителя нет
  | "no_teams" // участники ещё не подставлены
  | "not_played";

export type MatchOutcome = {
  winnerId: number | null;
  loserId: number | null;
  reason: MatchOutcomeReason;
};

type OutcomeInput = {
  status: MatchStatus;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeShootoutScore: number | null;
  awayShootoutScore: number | null;
};

/**
 * Кто победил в матче — нужно, чтобы двигать сетку плей-офф.
 *
 * Серия пенальти учитывается только тогда, когда основное время закончилось
 * вничью. Иначе счёт «2:1 при 3:4 по пенальти», записанный по ошибке,
 * перевернул бы результат матча.
 */
export function matchOutcome(match: OutcomeInput): MatchOutcome {
  const none = (reason: MatchOutcomeReason): MatchOutcome => ({
    winnerId: null,
    loserId: null,
    reason,
  });

  if (!isPlayed(match.status)) return none("not_played");
  if (match.homeTeamId === null || match.awayTeamId === null) return none("no_teams");
  if (match.homeScore === null || match.awayScore === null) return none("not_played");

  const decide = (homeWins: boolean, reason: MatchOutcomeReason): MatchOutcome => ({
    winnerId: homeWins ? match.homeTeamId : match.awayTeamId,
    loserId: homeWins ? match.awayTeamId : match.homeTeamId,
    reason,
  });

  if (match.homeScore !== match.awayScore) {
    return decide(match.homeScore > match.awayScore, "score");
  }

  const home = match.homeShootoutScore;
  const away = match.awayShootoutScore;
  if (home !== null && away !== null && home !== away) {
    return decide(home > away, "shootout");
  }

  return none("draw");
}

export function matchWinner(match: OutcomeInput): number | null {
  return matchOutcome(match).winnerId;
}

// ───────────────────────────── Игровые часы ─────────────────────────────────

/**
 * Текущая минута матча. Отсчёт ведётся от момента старта тайма плюс
 * накопленное время предыдущих таймов, поэтому часы переживают
 * перезагрузку страницы и работают одинаково у всех зрителей.
 */
export function currentMinute(
  match: { status: MatchStatus; periodStartedAt: Date | null; clockOffsetSec: number },
  now: Date = new Date(),
): number | null {
  if (!isLive(match.status)) return null;
  if (!isClockRunning(match.status) || !match.periodStartedAt) {
    return Math.floor(match.clockOffsetSec / 60) + 1;
  }
  const elapsedSec =
    match.clockOffsetSec + (now.getTime() - match.periodStartedAt.getTime()) / 1000;
  return Math.max(1, Math.floor(elapsedSec / 60) + 1);
}

/** «45+2» вместо «45». */
export function formatMinute(event: { minute: number; extraMinute: number | null }): string {
  return event.extraMinute ? `${event.minute}+${event.extraMinute}'` : `${event.minute}'`;
}

/** Порядок событий на таймлайне: сначала минута, потом добавленное время. */
export function compareEvents(
  a: { minute: number; extraMinute: number | null; id: number },
  b: { minute: number; extraMinute: number | null; id: number },
): number {
  if (a.minute !== b.minute) return a.minute - b.minute;
  if ((a.extraMinute ?? 0) !== (b.extraMinute ?? 0)) {
    return (a.extraMinute ?? 0) - (b.extraMinute ?? 0);
  }
  return a.id - b.id;
}

// ───────────────────────────── Турнирная таблица ────────────────────────────

export type StandingsRow = {
  /** Занятое место, начиная с 1 — заполняется после сортировки. */
  place: number;
  entryId: number;
  teamId: string;
  teamName: string;
  teamShortName: string;
  teamSlug: string;
  logoUrl: string | null;
  divisionId: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  pointsAdjustment: number;
  /** Сколько очков пришло с прошлого этапа. 0 — переноса не было. */
  carriedPoints: number;
  /** Сколько игр зачтено с прошлого этапа — чтобы подписать колонку «И». */
  carriedPlayed: number;
  /** Последние матчи, свежие первыми: "В" | "Н" | "П" */
  form: ("В" | "Н" | "П")[];
};

/**
 * Показатели, перенесённые из таблицы предыдущего этапа.
 *
 * Нужны, когда дивизион после кругового турнира делится на верхнюю и нижнюю
 * половину: половины продолжают счёт, а не начинают с нуля.
 */
export type StandingsCarry = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Очки уже с учётом снятых: иначе штраф применился бы дважды. */
  points: number;
  form: ("В" | "Н" | "П")[];
};

type StandingsMatch = {
  status: MatchStatus;
  // В плей-офф участник может быть ещё не определён; такие матчи
  // в таблицу всё равно не попадают — нужное отсеет rows.get() ниже.
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: Date;
};

type StandingsEntry = {
  id: number;
  divisionId: number | null;
  pointsAdjustment: number;
  team: { id: string; name: string; shortName: string; slug: string; logoUrl: string | null };
};

type PointsRule = { pointsForWin: number; pointsForDraw: number; pointsForLoss: number };

/**
 * Строит турнирную таблицу. Сортировка: очки → разница мячей → забитые →
 * личные встречи → название. Личные встречи учитываются только между
 * командами, у которых совпали все предыдущие показатели.
 *
 * `carryOver` (ключ — entryId) переносит показатели предыдущего этапа: с ними
 * строка стартует не с нуля. Аргумент необязательный — обычная таблица
 * считается ровно как раньше.
 */
export function computeStandings(
  entries: StandingsEntry[],
  matches: StandingsMatch[],
  rules: PointsRule,
  carryOver?: Map<number, StandingsCarry>,
): StandingsRow[] {
  const rows = new Map<number, StandingsRow>();
  for (const entry of entries) {
    // Перенесённые очки УЖЕ включают снятые: прибавлять pointsAdjustment
    // второй раз нельзя, иначе штраф применится дважды.
    const carry = carryOver?.get(entry.id);
    rows.set(entry.id, {
      place: 0,
      entryId: entry.id,
      teamId: entry.team.id,
      teamName: entry.team.name,
      teamShortName: entry.team.shortName,
      teamSlug: entry.team.slug,
      logoUrl: entry.team.logoUrl,
      divisionId: entry.divisionId,
      played: carry?.played ?? 0,
      won: carry?.won ?? 0,
      drawn: carry?.drawn ?? 0,
      lost: carry?.lost ?? 0,
      goalsFor: carry?.goalsFor ?? 0,
      goalsAgainst: carry?.goalsAgainst ?? 0,
      goalDiff: 0,
      points: carry ? carry.points : entry.pointsAdjustment,
      pointsAdjustment: entry.pointsAdjustment,
      carriedPoints: carry?.points ?? 0,
      carriedPlayed: carry?.played ?? 0,
      form: [],
    });
  }

  const played = matches
    .filter((m) => isPlayed(m.status) && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime());

  // Для личных встреч
  const headToHead = new Map<string, number>(); // "A:B" -> очки A в матчах против B

  for (const m of played) {
    if (m.homeTeamId === null || m.awayTeamId === null) continue;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;

    const hs = m.homeScore!;
    const as = m.awayScore!;

    home.played++;
    away.played++;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;

    let homePoints: number;
    let awayPoints: number;
    if (hs > as) {
      home.won++;
      away.lost++;
      homePoints = rules.pointsForWin;
      awayPoints = rules.pointsForLoss;
      home.form.push("В");
      away.form.push("П");
    } else if (hs < as) {
      away.won++;
      home.lost++;
      homePoints = rules.pointsForLoss;
      awayPoints = rules.pointsForWin;
      home.form.push("П");
      away.form.push("В");
    } else {
      home.drawn++;
      away.drawn++;
      homePoints = rules.pointsForDraw;
      awayPoints = rules.pointsForDraw;
      home.form.push("Н");
      away.form.push("Н");
    }

    home.points += homePoints;
    away.points += awayPoints;
    headToHead.set(
      `${m.homeTeamId}:${m.awayTeamId}`,
      (headToHead.get(`${m.homeTeamId}:${m.awayTeamId}`) ?? 0) + homePoints,
    );
    headToHead.set(
      `${m.awayTeamId}:${m.homeTeamId}`,
      (headToHead.get(`${m.awayTeamId}:${m.homeTeamId}`) ?? 0) + awayPoints,
    );
  }

  const result = [...rows.values()];
  for (const row of result) {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
    // Форма: сначала свои матчи (они свежее), затем хвост с прошлого этапа.
    // Обрезаем в конце, а не на лету, иначе у второго этапа формы не было бы
    // видно вовсе, пока он не наберёт пять своих матчей.
    const carry = carryOver?.get(row.entryId);
    row.form = carry ? [...row.form, ...carry.form].slice(0, 5) : row.form.slice(0, 5);
  }

  result.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    const aVsB = headToHead.get(`${a.entryId}:${b.entryId}`) ?? 0;
    const bVsA = headToHead.get(`${b.entryId}:${a.entryId}`) ?? 0;
    if (aVsB !== bVsA) return bVsA - aVsB;
    return a.teamName.localeCompare(b.teamName, "ru");
  });

  // Место — единственный источник правды о позиции в таблице, чтобы
  // «1-е место дивизиона» в сетке плей-офф и номер строки не разошлись.
  result.forEach((row, index) => {
    row.place = index + 1;
  });

  return result;
}

/**
 * Соседи по таблице неразличимы по очкам, разнице и забитым мячам.
 *
 * Нужно там, где место решает судьбу: подстановка в сетку плей-офф и граница
 * при разделении дивизиона на половины. В таких случаях лучше предупредить
 * организатора, чем молча положиться на личные встречи.
 */
export function placeIsTight(rows: StandingsRow[], place: number): boolean {
  const current = rows[place - 1];
  const next = rows[place];
  if (!current || !next) return false;
  return (
    current.points === next.points &&
    current.goalDiff === next.goalDiff &&
    current.goalsFor === next.goalsFor
  );
}

// ───────────────────────────── Статистика игроков ───────────────────────────

export type PlayerStatRow = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  teamSlug: string;
  matches: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  /** Голы + пасы */
  points: number;
};

/** Полное имя в формате «Фамилия И.» */
export function shortName(player: { firstName: string; lastName: string }): string {
  return `${player.lastName} ${player.firstName.charAt(0)}.`;
}

export function fullName(player: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}): string {
  return [player.lastName, player.firstName, player.middleName].filter(Boolean).join(" ");
}

/** Возраст в полных годах. */
export function ageFrom(birthDate: Date | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}
