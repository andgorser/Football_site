/**
 * Наполнение базы демонстрационными данными.
 *
 *   npm run db:seed
 *
 * Скрипт полностью очищает таблицы и создаёт заново: факультеты, команды,
 * игроков, текущий сезон и архив прошлых.
 *
 * Текущий сезон живой: часть туров сыграна со всеми событиями, один матч идёт
 * прямо сейчас, остальные впереди, плюс заранее собранная сетка плей-офф.
 *
 * Архив показывает все поддерживаемые схемы проведения, каждая доиграна:
 *
 *   • прошлый сезон чемпионата — дивизионы плюс плей-офф за титул, даёт серии
 *     вторую строку в истории и настоящего чемпиона;
 *   • «Лига МГУ» — круговой этап на 12 команд с делением на топ-6 и места
 *     7–12, очки первого этапа перенесены;
 *   • «Первенство МГУ» — два дивизиона в два круга (обычный формат);
 *   • «Зимний кубок» — две группы плюс плей-офф с финалом по пенальти;
 *   • «Турнир первокурсников» — одна группа, один круг, без плей-офф.
 *
 * Расписание строится относительно текущей даты, поэтому данные не
 * протухают, когда бы вы ни запустили скрипт.
 */

import { PrismaClient, type MatchEventType, type PlayerPosition } from "@prisma/client";
import bcrypt from "bcryptjs";

import { scoreFromEvents } from "../src/lib/football";

const prisma = new PrismaClient();

// ───────────────────────── Детерминированная случайность ────────────────────
// Свой генератор вместо Math.random(), чтобы каждый запуск давал одинаковую
// базу: так проще воспроизводить баги и сравнивать скриншоты.

let seedState = 20260214;
function random(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function chance(probability: number): boolean {
  return random() < probability;
}

// ───────────────────────────── Справочные данные ────────────────────────────

const FACULTIES = [
  { name: "Механико-математический факультет", shortName: "Мехмат" },
  { name: "Факультет вычислительной математики и кибернетики", shortName: "ВМК" },
  { name: "Физический факультет", shortName: "Физфак" },
  { name: "Химический факультет", shortName: "Химфак" },
  { name: "Биологический факультет", shortName: "Биофак" },
  { name: "Экономический факультет", shortName: "Экономфак" },
  { name: "Юридический факультет", shortName: "Юрфак" },
  { name: "Исторический факультет", shortName: "Истфак" },
  { name: "Философский факультет", shortName: "Философский" },
  { name: "Филологический факультет", shortName: "Филфак" },
  { name: "Географический факультет", shortName: "Геофак" },
  { name: "Геологический факультет", shortName: "Геолфак" },
  { name: "Факультет журналистики", shortName: "Журфак" },
  { name: "Факультет психологии", shortName: "Психфак" },
  { name: "Социологический факультет", shortName: "Соцфак" },
  { name: "Высшая школа бизнеса", shortName: "ВШБ" },
  { name: "Факультет фундаментальной медицины", shortName: "ФФМ" },
  { name: "Факультет глобальных процессов", shortName: "ФГП" },
];

const VENUES = [
  { name: "Спорткомплекс МГУ, поле №1", address: "Москва, Мичуринский пр-т, 1" },
  { name: "Спорткомплекс МГУ, поле №2", address: "Москва, Мичуринский пр-т, 1" },
  { name: "Манеж на Мичуринском", address: "Москва, Мичуринский пр-т, 2" },
  { name: "Поле у Главного здания", address: "Москва, Ленинские горы, 1" },
];

// Команды старшего дивизиона (индекс факультета, название, цвет)
const TOP_TEAMS = [
  { faculty: "Мехмат", name: "Мехмат", color: "#2563eb" },
  { faculty: "ВМК", name: "ВМК", color: "#0d9488" },
  { faculty: "Физфак", name: "Физфак", color: "#dc2626" },
  { faculty: "Экономфак", name: "Экономфак", color: "#16a34a" },
  { faculty: "Юрфак", name: "Юрфак", color: "#7c3aed" },
  { faculty: "Химфак", name: "Химфак", color: "#ea580c" },
  { faculty: "ВШБ", name: "ВШБ", color: "#0891b2" },
  { faculty: "Геофак", name: "Геофак", color: "#65a30d" },
];

const SECOND_TEAMS = [
  { faculty: "Биофак", name: "Биофак", color: "#059669" },
  { faculty: "Истфак", name: "Истфак", color: "#b45309" },
  { faculty: "Журфак", name: "Журфак", color: "#db2777" },
  { faculty: "Психфак", name: "Психфак", color: "#4f46e5" },
  { faculty: "Филфак", name: "Филфак", color: "#9333ea" },
  { faculty: "Соцфак", name: "Соцфак", color: "#0284c7" },
  { faculty: "ФФМ", name: "ФФМ", color: "#e11d48" },
  { faculty: "Геолфак", name: "Геолфак", color: "#78716c" },
];

const FIRST_NAMES = [
  "Александр", "Дмитрий", "Максим", "Иван", "Никита", "Артём", "Егор", "Михаил",
  "Данила", "Кирилл", "Илья", "Андрей", "Сергей", "Роман", "Тимофей", "Владимир",
  "Павел", "Антон", "Григорий", "Фёдор", "Пётр", "Николай", "Алексей", "Константин",
  "Матвей", "Ярослав", "Марк", "Глеб", "Арсений", "Всеволод",
];

const LAST_NAMES = [
  "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов",
  "Михайлов", "Новиков", "Фёдоров", "Морозов", "Волков", "Алексеев", "Лебедев",
  "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев", "Орлов",
  "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов",
  "Яковлев", "Григорьев", "Романов", "Воробьёв", "Сергеев", "Кузьмин", "Фролов",
  "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв", "Ильин", "Максимов",
  "Поляков", "Сорокин", "Виноградов", "Ковалёв", "Белов", "Медведев", "Антонов",
  "Тарасов", "Жуков", "Баранов", "Филиппов", "Комаров", "Давыдов", "Беляев",
  "Герасимов", "Богданов", "Осипов", "Сидоров", "Матвеев", "Титов", "Марков",
  "Миронов", "Крылов", "Куликов", "Карпов", "Власов", "Мельников", "Денисов",
];

const MIDDLE_NAMES = [
  "Александрович", "Дмитриевич", "Сергеевич", "Андреевич", "Иванович",
  "Михайлович", "Павлович", "Николаевич", "Владимирович", "Алексеевич",
];

/** Состав команды: 2 вратаря, 5 защитников, 6 полузащитников, 3 нападающих. */
const SQUAD_SHAPE: PlayerPosition[] = [
  "GK", "GK",
  "DF", "DF", "DF", "DF", "DF",
  "MF", "MF", "MF", "MF", "MF", "MF",
  "FW", "FW", "FW",
];

const DAY = 24 * 60 * 60 * 1000;

// ───────────────────────────── Вспомогательное ──────────────────────────────

function slugify(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", " ": "-",
  };
  return value
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? (/[a-z0-9-]/.test(ch) ? ch : ""))
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Круговой турнир методом «карусели»: n-1 туров, в каждом n/2 матчей. */
function roundRobin(teamIds: number[]): Array<Array<[number, number]>> {
  const teams = [...teamIds];
  const n = teams.length;
  const rounds: Array<Array<[number, number]>> = [];
  const rotating = teams.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const pairs: Array<[number, number]> = [];
    const order = [teams[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const home = order[i];
      const away = order[n - 1 - i];
      // Чередуем поле, чтобы команды не играли все матчи дома
      pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop()!);
  }
  return rounds;
}

/** Полночь ближайшей субботы в прошлом/будущем относительно даты. */
function saturdayOffsetWeeks(base: Date, weeks: number): Date {
  const d = new Date(base);
  d.setUTCHours(9, 0, 0, 0); // 12:00 по Москве
  const daysToSaturday = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + daysToSaturday + weeks * 7);
  return d;
}

/** Сезон в привычном виде: 2024/25. */
function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Одиннадцать в стартовом составе: 1 вратарь, 4 защитника, 4 полузащитника, 2 нападающих. */
function startingEleven(roster: RosterPlayer[]): RosterPlayer[] {
  const byPosition = (p: PlayerPosition) => roster.filter((r) => r.position === p);
  return [
    ...byPosition("GK").slice(0, 1),
    ...byPosition("DF").slice(0, 4),
    ...byPosition("MF").slice(0, 4),
    ...byPosition("FW").slice(0, 2),
  ];
}

// ───────────────────────────── Основной сценарий ────────────────────────────

async function main() {
  const now = new Date();
  const password = process.env.SEED_PASSWORD ?? "football2025";
  const passwordHash = await bcrypt.hash(password, 10);

  console.log("Очищаю базу…");
  // Порядок важен: сначала зависимые таблицы.
  await prisma.auditLog.deleteMany();
  await prisma.matchEvent.deleteMany();
  await prisma.matchLineup.deleteMany();
  await prisma.match.deleteMany();
  await prisma.rosterEntry.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.division.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.tournamentSeries.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.faculty.deleteMany();

  console.log("Создаю справочники…");
  const faculties = new Map<string, number>();
  for (const f of FACULTIES) {
    const created = await prisma.faculty.create({ data: f });
    faculties.set(f.shortName, created.id);
  }

  // Типы указаны явно: ниже эти массивы читают вложенные функции, и без
  // аннотации TypeScript не успевает вывести тип к моменту их объявления.
  const venues: { id: number }[] = [];
  for (const v of VENUES) venues.push(await prisma.venue.create({ data: v }));

  console.log("Создаю команды и игроков…");
  const allTeamDefs = [...TOP_TEAMS, ...SECOND_TEAMS];
  const teams: Array<{
    team: { id: string; slug: string };
    players: { id: string; firstName: string; lastName: string; preferredPosition: PlayerPosition | null }[];
  }> = [];
  const usedNames = new Set<string>();

  for (const def of allTeamDefs) {
    const team = await prisma.team.create({
      data: {
        slug: slugify(def.name),
        name: `ФК «${def.name}»`,
        shortName: def.name,
        primaryColor: def.color,
        facultyId: faculties.get(def.faculty) ?? null,
        foundedYear: randomInt(1998, 2020),
        description: `Сборная команда факультета «${def.faculty}» по футболу.`,
      },
    });

    // Игроки команды
    const players = [];
    for (const position of SQUAD_SHAPE) {
      let firstName = pick(FIRST_NAMES);
      let lastName = pick(LAST_NAMES);
      let guard = 0;
      while (usedNames.has(`${lastName} ${firstName}`) && guard++ < 50) {
        firstName = pick(FIRST_NAMES);
        lastName = pick(LAST_NAMES);
      }
      usedNames.add(`${lastName} ${firstName}`);

      const course = randomInt(1, 6);
      const birthYear = now.getFullYear() - 17 - course - randomInt(0, 2);
      players.push(
        await prisma.player.create({
          data: {
            firstName,
            lastName,
            middleName: chance(0.7) ? pick(MIDDLE_NAMES) : null,
            birthDate: new Date(Date.UTC(birthYear, randomInt(0, 11), randomInt(1, 28))),
            msuStatus: chance(0.85) ? "STUDENT" : chance(0.5) ? "POSTGRAD" : "ALUMNI",
            facultyId: faculties.get(def.faculty) ?? null,
            course,
            preferredPosition: position,
          },
        }),
      );
    }

    teams.push({ team, players });
  }

  console.log("Создаю пользователей…");
  const admin = await prisma.user.create({
    data: {
      email: "admin@msu.football",
      passwordHash,
      fullName: "Андрей Горсер",
      role: "ADMIN",
    },
  });

  const referees: { id: string }[] = [];
  const refereeNames = [
    "Сергей Волошин",
    "Артём Кравцов",
    "Игорь Тимофеев",
    "Денис Панов",
  ];
  for (let i = 0; i < refereeNames.length; i++) {
    referees.push(
      await prisma.user.create({
        data: {
          email: `referee${i + 1}@msu.football`,
          passwordHash,
          fullName: refereeNames[i],
          role: "REFEREE",
        },
      }),
    );
  }

  for (const { team, players } of teams) {
    const captainPlayer = players[7];
    await prisma.user.create({
      data: {
        email: `captain.${team.slug}@msu.football`,
        passwordHash,
        fullName: `${captainPlayer.lastName} ${captainPlayer.firstName}`,
        role: "CAPTAIN",
        teamId: team.id,
      },
    });
  }

  await prisma.user.create({
    data: {
      email: "viewer@msu.football",
      passwordHash,
      fullName: "Болельщик",
      role: "VIEWER",
    },
  });

  // ─────────────── Помощники для архивных (полностью сыгранных) турниров ────
  // Они пишут пакетно и кладут в состав только стартовую одиннадцатку: архиву
  // не нужна детальность живого сезона, зато сид остаётся быстрым.

  type Entry = { id: number; players: RosterPlayer[] };

  /** Заявляет команды в турнир вместе с составами. */
  async function enterTeams(
    tournamentId: number,
    teamDefs: readonly { name: string }[],
    divisionId: number | null,
  ): Promise<Entry[]> {
    const result: Entry[] = [];

    for (const def of teamDefs) {
      const slug = slugify(def.name);
      const source = teams.find((t) => t.team.slug === slug)!;

      const entry = await prisma.tournamentTeam.create({
        data: { tournamentId, teamId: source.team.id, divisionId },
      });
      await prisma.rosterEntry.createMany({
        data: source.players.map((player, i) => ({
          tournamentTeamId: entry.id,
          playerId: player.id,
          shirtNumber: i === 0 ? 1 : i + 1,
          position: player.preferredPosition,
          isCaptain: i === 7,
        })),
      });

      const roster = await prisma.rosterEntry.findMany({
        where: { tournamentTeamId: entry.id },
        orderBy: { id: "asc" },
        select: { id: true, position: true, shirtNumber: true },
      });

      result.push({
        id: entry.id,
        players: roster.map((r) => ({
          id: r.id,
          position: r.position ?? "MF",
          shirtNumber: r.shirtNumber,
        })),
      });
    }

    return result;
  }

  /**
   * «Доигрывает» матч: составы, голы, карточки и счёт из событий.
   *
   * Счёт не проставляется руками — он, как и на боевом сайте, выводится из
   * событий через scoreFromEvents. В матче на вылет ничья недопустима,
   * поэтому при равном счёте дописывается серия пенальти.
   */
  async function finishMatch(
    matchId: number,
    home: Entry,
    away: Entry,
    options: { halfDuration: number; authorId: string; knockout?: boolean },
  ): Promise<void> {
    const fullTime = options.halfDuration * 2;

    await prisma.matchLineup.createMany({
      data: [home, away].flatMap((side) =>
        startingEleven(side.players).map((player) => ({
          matchId,
          rosterEntryId: player.id,
          isStarting: true,
          shirtNumber: player.shirtNumber,
          position: player.position,
        })),
      ),
    });

    const events: Array<{
      matchId: number;
      type: MatchEventType;
      minute: number;
      tournamentTeamId: number;
      playerId: number;
      assistPlayerId: number | null;
      createdById: string;
    }> = [];

    const scorerWeights: Record<PlayerPosition, number> = { GK: 0, DF: 1, MF: 3, FW: 5 };

    function addGoals(side: Entry, count: number) {
      const pool = side.players.flatMap((p) => Array(scorerWeights[p.position]).fill(p) as RosterPlayer[]);
      for (let i = 0; i < count; i++) {
        const scorer = pool.length ? pick(pool) : side.players[0];
        const others = side.players.filter((p) => p.id !== scorer.id);
        const assistant = chance(0.5) ? pick(others) : null;
        events.push({
          matchId,
          type: chance(0.1) ? "PENALTY_GOAL" : "GOAL",
          minute: randomInt(1, fullTime),
          tournamentTeamId: side.id,
          playerId: scorer.id,
          assistPlayerId: assistant?.id ?? null,
          createdById: options.authorId,
        });
      }
    }

    addGoals(home, randomInt(0, 4));
    addGoals(away, Math.max(0, randomInt(0, 4) - (chance(0.35) ? 1 : 0)));

    for (const side of [home, away]) {
      for (let i = 0; i < randomInt(0, 2); i++) {
        events.push({
          matchId,
          type: "YELLOW_CARD",
          minute: randomInt(5, fullTime),
          tournamentTeamId: side.id,
          playerId: pick(side.players).id,
          assistPlayerId: null,
          createdById: options.authorId,
        });
      }
    }

    await prisma.matchEvent.createMany({ data: events });

    const score = scoreFromEvents(events, home.id, away.id);
    const draw = score.home === score.away;
    const shootoutHome = randomInt(3, 5);

    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "FINISHED",
        homeScore: score.home,
        awayScore: score.away,
        ...(options.knockout && draw
          ? {
              homeShootoutScore: shootoutHome,
              awayShootoutScore: chance(0.5) ? shootoutHome - 1 : shootoutHome + 1,
            }
          : {}),
      },
    });
  }

  /** Круговой этап целиком: создаёт матчи и сразу их доигрывает. */
  async function playRoundRobinStage(params: {
    tournamentId: number;
    divisionId: number | null;
    entries: Entry[];
    /** Сколько недель назад проходит первый тур */
    weeksAgo: number;
    circles?: number;
    startRound?: number;
    halfDuration: number;
  }): Promise<void> {
    const rounds = roundRobin(params.entries.map((e) => e.id));
    const byId = new Map(params.entries.map((e) => [e.id, e]));
    const circles = params.circles ?? 1;
    let roundNumber = params.startRound ?? 1;
    let weekOffset = 0;

    for (let circle = 0; circle < circles; circle++) {
      for (const round of rounds) {
        const roundDate = saturdayOffsetWeeks(now, params.weeksAgo + weekOffset);

        for (let matchIndex = 0; matchIndex < round.length; matchIndex++) {
          // Во втором круге команды меняются полями — как в настоящей лиге
          const [first, second] = round[matchIndex];
          const homeId = circle % 2 === 0 ? first : second;
          const awayId = circle % 2 === 0 ? second : first;

          const match = await prisma.match.create({
            data: {
              tournamentId: params.tournamentId,
              divisionId: params.divisionId,
              round: roundNumber,
              homeTeamId: homeId,
              awayTeamId: awayId,
              kickoffAt: new Date(roundDate.getTime() + matchIndex * 2 * 60 * 60 * 1000),
              venueId: venues[matchIndex % venues.length].id,
              refereeId: referees[(roundNumber + matchIndex) % referees.length].id,
            },
            select: { id: true },
          });

          await finishMatch(match.id, byId.get(homeId)!, byId.get(awayId)!, {
            halfDuration: params.halfDuration,
            authorId: referees[(roundNumber + matchIndex) % referees.length].id,
          });
        }

        roundNumber++;
        weekOffset++;
      }
    }
  }

  /** Матч на вылет с известными участниками. */
  async function playKnockout(params: {
    tournamentId: number;
    stage: "SEMI_FINAL" | "FINAL" | "THIRD_PLACE";
    bracketOrder?: number;
    home: Entry;
    away: Entry;
    weeksAgo: number;
    hourOffset?: number;
    halfDuration: number;
  }): Promise<Entry> {
    const match = await prisma.match.create({
      data: {
        tournamentId: params.tournamentId,
        stage: params.stage,
        bracketOrder: params.bracketOrder ?? 0,
        homeTeamId: params.home.id,
        awayTeamId: params.away.id,
        kickoffAt: new Date(
          saturdayOffsetWeeks(now, params.weeksAgo).getTime() +
            (params.hourOffset ?? 0) * 60 * 60 * 1000,
        ),
        venueId: venues[0].id,
        refereeId: referees[0].id,
      },
      select: { id: true },
    });

    await finishMatch(match.id, params.home, params.away, {
      halfDuration: params.halfDuration,
      authorId: referees[0].id,
      knockout: true,
    });

    const played = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
      select: { homeScore: true, awayScore: true, homeShootoutScore: true, awayShootoutScore: true },
    });

    const homeWon =
      played.homeScore! > played.awayScore! ||
      (played.homeScore === played.awayScore &&
        (played.homeShootoutScore ?? 0) > (played.awayShootoutScore ?? 0));
    return homeWon ? params.home : params.away;
  }

  /** Порядок команд дивизиона по итогам сыгранного этапа. */
  async function orderByStandings(
    tournamentId: number,
    divisionId: number | null,
    entries: Entry[],
  ): Promise<Entry[]> {
    const matches = await prisma.match.findMany({
      where: { tournamentId, divisionId, stage: "REGULAR", status: "FINISHED" },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });

    const table = new Map(
      entries.map((e) => [e.id, { entry: e, points: 0, diff: 0, scored: 0 }]),
    );

    for (const m of matches) {
      const home = table.get(m.homeTeamId!);
      const away = table.get(m.awayTeamId!);
      if (!home || !away || m.homeScore === null || m.awayScore === null) continue;

      home.scored += m.homeScore;
      away.scored += m.awayScore;
      home.diff += m.homeScore - m.awayScore;
      away.diff += m.awayScore - m.homeScore;

      if (m.homeScore > m.awayScore) home.points += 3;
      else if (m.homeScore < m.awayScore) away.points += 3;
      else {
        home.points += 1;
        away.points += 1;
      }
    }

    return [...table.values()]
      .sort((a, b) => b.points - a.points || b.diff - a.diff || b.scored - a.scored)
      .map((row) => row.entry);
  }

  console.log("Создаю чемпионат…");
  const seasonStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const season = seasonLabel(seasonStartYear);

  // Серии живут дольше сезона: к ним будут привязываться турниры следующих лет
  const championshipSeries = await prisma.tournamentSeries.create({
    data: {
      slug: "chempionat-mgu",
      name: "Чемпионат МГУ по футболу",
      description: "Главный турнир сезона среди сборных факультетов",
    },
  });
  const cupSeries = await prisma.tournamentSeries.create({
    data: {
      slug: "kubok-mgu",
      name: "Кубок МГУ",
      description: "Кубковый турнир на выбывание",
    },
  });

  const championship = await prisma.tournament.create({
    data: {
      slug: `chempionat-mgu-${seasonStartYear}`,
      name: "Чемпионат МГУ по футболу",
      season,
      seriesId: championshipSeries.id,
      format: "LEAGUE",
      status: "ONGOING",
      startDate: saturdayOffsetWeeks(now, -5),
      endDate: saturdayOffsetWeeks(now, 3),
      halfDurationMin: 30,
      description:
        "Основной турнир сезона среди сборных факультетов. Два дивизиона, круговая система в один круг.",
    },
  });

  const topDivision = await prisma.division.create({
    data: { tournamentId: championship.id, name: "Высший дивизион", sortOrder: 1 },
  });
  const firstDivision = await prisma.division.create({
    data: { tournamentId: championship.id, name: "Первый дивизион", sortOrder: 2 },
  });

  // Заявки команд и игроков
  const entries: EntryMap = new Map();

  for (const { team, players } of teams) {
    const divisionId = TOP_TEAMS.some((t) => slugify(t.name) === team.slug)
      ? topDivision.id
      : firstDivision.id;

    const entry = await prisma.tournamentTeam.create({
      data: { tournamentId: championship.id, teamId: team.id, divisionId },
    });

    const rosterEntries = [];
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const created = await prisma.rosterEntry.create({
        data: {
          tournamentTeamId: entry.id,
          playerId: player.id,
          shirtNumber: i === 0 ? 1 : i + 1,
          position: player.preferredPosition,
          isCaptain: i === 7,
        },
      });
      rosterEntries.push({
        id: created.id,
        position: player.preferredPosition!,
        shirtNumber: created.shirtNumber,
      });
    }
    entries.set(team.slug, { id: entry.id, players: rosterEntries });
  }

  console.log("Строю расписание и играю матчи…");

  const PLAYED_ROUNDS = 4; // столько туров уже сыграно

  for (const [division, teamDefs] of [
    [topDivision, TOP_TEAMS],
    [firstDivision, SECOND_TEAMS],
  ] as const) {
    const entryIds = teamDefs.map((t) => entries.get(slugify(t.name))!.id);
    const rounds = roundRobin(entryIds);

    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
      const roundDate = saturdayOffsetWeeks(now, roundIndex - PLAYED_ROUNDS);
      const isPast = roundIndex < PLAYED_ROUNDS;
      const isCurrentRound = roundIndex === PLAYED_ROUNDS;

      for (let matchIndex = 0; matchIndex < rounds[roundIndex].length; matchIndex++) {
        const [homeEntryId, awayEntryId] = rounds[roundIndex][matchIndex];
        const kickoffAt = new Date(roundDate.getTime() + matchIndex * 2 * 60 * 60 * 1000);

        // Один матч текущего тура в высшем дивизионе идёт прямо сейчас
        const isLiveMatch =
          isCurrentRound && matchIndex === 0 && division.id === topDivision.id;

        const match = await prisma.match.create({
          data: {
            tournamentId: championship.id,
            divisionId: division.id,
            round: roundIndex + 1,
            homeTeamId: homeEntryId,
            awayTeamId: awayEntryId,
            kickoffAt: isLiveMatch ? new Date(now.getTime() - 52 * 60 * 1000) : kickoffAt,
            venueId: venues[matchIndex % venues.length].id,
            refereeId: referees[(roundIndex + matchIndex) % referees.length].id,
            status: isPast ? "FINISHED" : isLiveMatch ? "SECOND_HALF" : "SCHEDULED",
            periodStartedAt: isLiveMatch ? new Date(now.getTime() - 7 * 60 * 1000) : null,
            clockOffsetSec: isLiveMatch ? 30 * 60 : 0,
          },
        });

        if (!isPast && !isLiveMatch) continue;

        await playMatch(match.id, homeEntryId, awayEntryId, entries, {
          isLive: isLiveMatch,
          halfDuration: championship.halfDurationMin,
          authorId: referees[(roundIndex + matchIndex) % referees.length].id,
        });
      }
    }
  }

  console.log("Создаю кубок…");
  const cup = await prisma.tournament.create({
    data: {
      slug: `kubok-mgu-${seasonStartYear}`,
      name: "Кубок МГУ",
      season,
      seriesId: cupSeries.id,
      format: "CUP",
      status: "UPCOMING",
      startDate: saturdayOffsetWeeks(now, 4),
      halfDurationMin: 30,
      description: "Кубковый турнир на выбывание. Участвуют команды обоих дивизионов.",
    },
  });

  const cupEntries: number[] = [];
  for (const { team } of teams.slice(0, 8)) {
    const entry = await prisma.tournamentTeam.create({
      data: { tournamentId: cup.id, teamId: team.id },
    });
    cupEntries.push(entry.id);

    // Заявка на кубок — те же игроки
    const source = entries.get(team.slug)!;
    const players = await prisma.rosterEntry.findMany({
      where: { tournamentTeamId: source.id },
      select: { playerId: true, shirtNumber: true, position: true, isCaptain: true },
    });
    for (const p of players) {
      await prisma.rosterEntry.create({ data: { tournamentTeamId: entry.id, ...p } });
    }
  }

  const cupDate = saturdayOffsetWeeks(now, 4);
  const quarterFinals = [];
  for (let i = 0; i < 4; i++) {
    quarterFinals.push(
      await prisma.match.create({
        data: {
          tournamentId: cup.id,
          stage: "QUARTER_FINAL",
          bracketOrder: i,
          homeTeamId: cupEntries[i * 2],
          awayTeamId: cupEntries[i * 2 + 1],
          kickoffAt: new Date(cupDate.getTime() + i * 2 * 60 * 60 * 1000),
          venueId: venues[i % venues.length].id,
          refereeId: referees[i % referees.length].id,
          status: "SCHEDULED",
        },
      }),
    );
  }

  // Дальше по сетке участники ещё не известны — записываем источники.
  // Именно так собирается плей-офф поверх дивизионов: матч создаётся заранее,
  // а команда подставится, когда определится победитель предыдущей стадии.
  const semiFinals = [];
  for (let i = 0; i < 2; i++) {
    semiFinals.push(
      await prisma.match.create({
        data: {
          tournamentId: cup.id,
          stage: "SEMI_FINAL",
          bracketOrder: i,
          kickoffAt: new Date(saturdayOffsetWeeks(now, 5).getTime() + i * 2 * 60 * 60 * 1000),
          venueId: venues[i % venues.length].id,
          refereeId: referees[i % referees.length].id,
          homeSource: "MATCH_WINNER",
          homeSourceMatchId: quarterFinals[i * 2].id,
          awaySource: "MATCH_WINNER",
          awaySourceMatchId: quarterFinals[i * 2 + 1].id,
        },
      }),
    );
  }

  await prisma.match.create({
    data: {
      tournamentId: cup.id,
      stage: "FINAL",
      kickoffAt: saturdayOffsetWeeks(now, 6),
      venueId: venues[0].id,
      refereeId: referees[0].id,
      homeSource: "MATCH_WINNER",
      homeSourceMatchId: semiFinals[0].id,
      awaySource: "MATCH_WINNER",
      awaySourceMatchId: semiFinals[1].id,
    },
  });

  await prisma.match.create({
    data: {
      tournamentId: cup.id,
      stage: "THIRD_PLACE",
      kickoffAt: new Date(saturdayOffsetWeeks(now, 6).getTime() - 2 * 60 * 60 * 1000),
      venueId: venues[1].id,
      refereeId: referees[1].id,
      homeSource: "MATCH_LOSER",
      homeSourceMatchId: semiFinals[0].id,
      awaySource: "MATCH_LOSER",
      awaySourceMatchId: semiFinals[1].id,
    },
  });

  // Плей-офф чемпионата — тот самый сценарий «дивизионы + общая сетка»:
  // победители дивизионов сразу в полуфинал, вторые и третьи места
  // сначала играют между собой.
  console.log("Создаю плей-офф чемпионата…");
  const playoffDate = saturdayOffsetWeeks(now, 3);
  const preliminary = [];
  for (const [homeDiv, homePlace, awayDiv, awayPlace] of [
    [topDivision.id, 2, firstDivision.id, 3],
    [firstDivision.id, 2, topDivision.id, 3],
  ] as const) {
    preliminary.push(
      await prisma.match.create({
        data: {
          tournamentId: championship.id,
          stage: "PRELIMINARY",
          bracketOrder: preliminary.length,
          kickoffAt: new Date(playoffDate.getTime() + preliminary.length * 2 * 60 * 60 * 1000),
          venueId: venues[0].id,
          refereeId: referees[preliminary.length % referees.length].id,
          homeSource: "DIVISION_PLACE",
          homeSourceDivisionId: homeDiv,
          homeSourcePlace: homePlace,
          awaySource: "DIVISION_PLACE",
          awaySourceDivisionId: awayDiv,
          awaySourcePlace: awayPlace,
        },
      }),
    );
  }

  const championshipSemis = [];
  for (const [divisionId, sourceMatch] of [
    [topDivision.id, preliminary[1]],
    [firstDivision.id, preliminary[0]],
  ] as const) {
    championshipSemis.push(
      await prisma.match.create({
        data: {
          tournamentId: championship.id,
          stage: "SEMI_FINAL",
          bracketOrder: championshipSemis.length,
          kickoffAt: new Date(
            saturdayOffsetWeeks(now, 4).getTime() + championshipSemis.length * 2 * 60 * 60 * 1000,
          ),
          venueId: venues[1].id,
          refereeId: referees[championshipSemis.length % referees.length].id,
          homeSource: "DIVISION_PLACE",
          homeSourceDivisionId: divisionId,
          homeSourcePlace: 1,
          awaySource: "MATCH_WINNER",
          awaySourceMatchId: sourceMatch.id,
        },
      }),
    );
  }

  await prisma.match.create({
    data: {
      tournamentId: championship.id,
      stage: "FINAL",
      kickoffAt: saturdayOffsetWeeks(now, 5),
      venueId: venues[0].id,
      refereeId: referees[0].id,
      homeSource: "MATCH_WINNER",
      homeSourceMatchId: championshipSemis[0].id,
      awaySource: "MATCH_WINNER",
      awaySourceMatchId: championshipSemis[1].id,
    },
  });

  // ───────────────────────── Архив: завершённые турниры ─────────────────────
  // Пять разных форматов, все доиграны до конца. Нужны, чтобы сразу после
  // установки было видно, как выглядит история: сезоны прошлых лет, чемпионы,
  // статистика за несколько лет и все поддерживаемые схемы проведения.

  console.log("Создаю прошлый сезон чемпионата…");
  const prevChampionship = await prisma.tournament.create({
    data: {
      slug: `chempionat-mgu-${seasonStartYear - 1}`,
      name: "Чемпионат МГУ по футболу",
      season: seasonLabel(seasonStartYear - 1),
      seriesId: championshipSeries.id,
      format: "LEAGUE",
      status: "FINISHED",
      startDate: saturdayOffsetWeeks(now, -57),
      endDate: saturdayOffsetWeeks(now, -45),
      halfDurationMin: 30,
      description:
        "Прошлый сезон: два дивизиона, круговой этап и общий плей-офф за титул.",
    },
  });

  const prevTop = await prisma.division.create({
    data: { tournamentId: prevChampionship.id, name: "Высший дивизион", sortOrder: 1 },
  });
  const prevFirst = await prisma.division.create({
    data: { tournamentId: prevChampionship.id, name: "Первый дивизион", sortOrder: 2 },
  });

  const prevTopEntries = await enterTeams(prevChampionship.id, TOP_TEAMS, prevTop.id);
  const prevFirstEntries = await enterTeams(prevChampionship.id, SECOND_TEAMS, prevFirst.id);

  await playRoundRobinStage({
    tournamentId: prevChampionship.id,
    divisionId: prevTop.id,
    entries: prevTopEntries,
    weeksAgo: -57,
    halfDuration: 30,
  });
  await playRoundRobinStage({
    tournamentId: prevChampionship.id,
    divisionId: prevFirst.id,
    entries: prevFirstEntries,
    weeksAgo: -57,
    halfDuration: 30,
  });

  // Плей-офф прошлого сезона: победители дивизионов и вторые места
  const prevTopOrder = await orderByStandings(prevChampionship.id, prevTop.id, prevTopEntries);
  const prevFirstOrder = await orderByStandings(prevChampionship.id, prevFirst.id, prevFirstEntries);

  const prevSemiA = await playKnockout({
    tournamentId: prevChampionship.id,
    stage: "SEMI_FINAL",
    bracketOrder: 0,
    home: prevTopOrder[0],
    away: prevFirstOrder[1],
    weeksAgo: -47,
    halfDuration: 30,
  });
  const prevSemiB = await playKnockout({
    tournamentId: prevChampionship.id,
    stage: "SEMI_FINAL",
    bracketOrder: 1,
    home: prevFirstOrder[0],
    away: prevTopOrder[1],
    weeksAgo: -47,
    hourOffset: 2,
    halfDuration: 30,
  });

  const prevFinalists = [prevTopOrder[0], prevFirstOrder[1], prevFirstOrder[0], prevTopOrder[1]];
  const prevLosers = prevFinalists.filter((e) => e !== prevSemiA && e !== prevSemiB);

  await playKnockout({
    tournamentId: prevChampionship.id,
    stage: "THIRD_PLACE",
    home: prevLosers[0],
    away: prevLosers[1],
    weeksAgo: -45,
    halfDuration: 30,
  });
  await playKnockout({
    tournamentId: prevChampionship.id,
    stage: "FINAL",
    home: prevSemiA,
    away: prevSemiB,
    weeksAgo: -45,
    hourOffset: 3,
    halfDuration: 30,
  });

  console.log("Создаю лигу с делением на топ-6 и 7–12…");
  const splitLeague = await prisma.tournament.create({
    data: {
      slug: `liga-mgu-${seasonStartYear - 2}`,
      name: "Лига МГУ",
      season: seasonLabel(seasonStartYear - 2),
      format: "LEAGUE",
      status: "FINISHED",
      startDate: saturdayOffsetWeeks(now, -105),
      endDate: saturdayOffsetWeeks(now, -88),
      halfDurationMin: 25,
      description:
        "Двенадцать команд играют круговой турнир, затем делятся пополам: топ-6 спорит за медали, места 7–12 — за выживание. Очки первого этапа сохраняются.",
    },
  });

  const splitTeams = [...TOP_TEAMS, ...SECOND_TEAMS].slice(0, 12);
  const splitStageOne = await prisma.division.create({
    data: { tournamentId: splitLeague.id, name: "Общий этап", sortOrder: 1 },
  });
  const splitEntries = await enterTeams(splitLeague.id, splitTeams, splitStageOne.id);

  await playRoundRobinStage({
    tournamentId: splitLeague.id,
    divisionId: splitStageOne.id,
    entries: splitEntries,
    weeksAgo: -105,
    halfDuration: 25,
  });

  // Разделение по итогам — ровно то, что делает кнопка «Разделить по итогам»
  const splitOrder = await orderByStandings(splitLeague.id, splitStageOne.id, splitEntries);
  await prisma.division.update({
    where: { id: splitStageOne.id },
    data: { name: "Первый этап" },
  });

  const topSix = await prisma.division.create({
    data: {
      tournamentId: splitLeague.id,
      name: "Топ-6",
      sortOrder: 2,
      parentDivisionId: splitStageOne.id,
    },
  });
  const bottomSix = await prisma.division.create({
    data: {
      tournamentId: splitLeague.id,
      name: "Места 7–12",
      sortOrder: 3,
      parentDivisionId: splitStageOne.id,
    },
  });

  await prisma.tournamentTeam.updateMany({
    where: { id: { in: splitOrder.slice(0, 6).map((e) => e.id) } },
    data: { divisionId: topSix.id },
  });
  await prisma.tournamentTeam.updateMany({
    where: { id: { in: splitOrder.slice(6).map((e) => e.id) } },
    data: { divisionId: bottomSix.id },
  });

  await playRoundRobinStage({
    tournamentId: splitLeague.id,
    divisionId: topSix.id,
    entries: splitOrder.slice(0, 6),
    weeksAgo: -93,
    startRound: 12,
    halfDuration: 25,
  });
  await playRoundRobinStage({
    tournamentId: splitLeague.id,
    divisionId: bottomSix.id,
    entries: splitOrder.slice(6),
    weeksAgo: -93,
    startRound: 12,
    halfDuration: 25,
  });

  console.log("Создаю первенство с двумя кругами…");
  const doubleRound = await prisma.tournament.create({
    data: {
      slug: `pervenstvo-mgu-${seasonStartYear - 2}`,
      name: "Первенство МГУ",
      season: seasonLabel(seasonStartYear - 2),
      format: "LEAGUE",
      status: "FINISHED",
      startDate: saturdayOffsetWeeks(now, -80),
      endDate: saturdayOffsetWeeks(now, -70),
      halfDurationMin: 30,
      description:
        "Два дивизиона, обычный формат в два круга: каждый играет с каждым дома и в гостях.",
    },
  });

  const doubleTop = await prisma.division.create({
    data: { tournamentId: doubleRound.id, name: "Дивизион А", sortOrder: 1 },
  });
  const doubleBottom = await prisma.division.create({
    data: { tournamentId: doubleRound.id, name: "Дивизион Б", sortOrder: 2 },
  });

  const doubleTopEntries = await enterTeams(doubleRound.id, TOP_TEAMS.slice(0, 6), doubleTop.id);
  const doubleBottomEntries = await enterTeams(
    doubleRound.id,
    SECOND_TEAMS.slice(0, 6),
    doubleBottom.id,
  );

  await playRoundRobinStage({
    tournamentId: doubleRound.id,
    divisionId: doubleTop.id,
    entries: doubleTopEntries,
    weeksAgo: -80,
    circles: 2,
    halfDuration: 30,
  });
  await playRoundRobinStage({
    tournamentId: doubleRound.id,
    divisionId: doubleBottom.id,
    entries: doubleBottomEntries,
    weeksAgo: -80,
    circles: 2,
    halfDuration: 30,
  });

  console.log("Создаю турнир с группами и плей-офф…");
  const groupsPlayoff = await prisma.tournament.create({
    data: {
      slug: `zimniy-kubok-${seasonStartYear - 1}`,
      name: "Зимний кубок МГУ",
      season: seasonLabel(seasonStartYear - 1),
      format: "GROUPS_PLAYOFF",
      status: "FINISHED",
      startDate: saturdayOffsetWeeks(now, -34),
      endDate: saturdayOffsetWeeks(now, -28),
      halfDurationMin: 20,
      description:
        "Две группы по четыре команды, из каждой в полуфинал выходят по две. Формат «группы + плей-офф».",
    },
  });

  const groupA = await prisma.division.create({
    data: { tournamentId: groupsPlayoff.id, name: "Группа A", sortOrder: 1 },
  });
  const groupB = await prisma.division.create({
    data: { tournamentId: groupsPlayoff.id, name: "Группа B", sortOrder: 2 },
  });

  const groupAEntries = await enterTeams(groupsPlayoff.id, TOP_TEAMS.slice(0, 4), groupA.id);
  const groupBEntries = await enterTeams(groupsPlayoff.id, TOP_TEAMS.slice(4, 8), groupB.id);

  await playRoundRobinStage({
    tournamentId: groupsPlayoff.id,
    divisionId: groupA.id,
    entries: groupAEntries,
    weeksAgo: -34,
    halfDuration: 20,
  });
  await playRoundRobinStage({
    tournamentId: groupsPlayoff.id,
    divisionId: groupB.id,
    entries: groupBEntries,
    weeksAgo: -34,
    halfDuration: 20,
  });

  const groupAOrder = await orderByStandings(groupsPlayoff.id, groupA.id, groupAEntries);
  const groupBOrder = await orderByStandings(groupsPlayoff.id, groupB.id, groupBEntries);

  const winterSemiA = await playKnockout({
    tournamentId: groupsPlayoff.id,
    stage: "SEMI_FINAL",
    bracketOrder: 0,
    home: groupAOrder[0],
    away: groupBOrder[1],
    weeksAgo: -30,
    halfDuration: 20,
  });
  const winterSemiB = await playKnockout({
    tournamentId: groupsPlayoff.id,
    stage: "SEMI_FINAL",
    bracketOrder: 1,
    home: groupBOrder[0],
    away: groupAOrder[1],
    weeksAgo: -30,
    hourOffset: 2,
    halfDuration: 20,
  });

  const winterSemiTeams = [groupAOrder[0], groupBOrder[1], groupBOrder[0], groupAOrder[1]];
  const winterLosers = winterSemiTeams.filter((e) => e !== winterSemiA && e !== winterSemiB);

  await playKnockout({
    tournamentId: groupsPlayoff.id,
    stage: "THIRD_PLACE",
    home: winterLosers[0],
    away: winterLosers[1],
    weeksAgo: -28,
    halfDuration: 20,
  });
  await playKnockout({
    tournamentId: groupsPlayoff.id,
    stage: "FINAL",
    home: winterSemiA,
    away: winterSemiB,
    weeksAgo: -28,
    hourOffset: 3,
    halfDuration: 20,
  });

  console.log("Создаю однокруговой турнир без плей-офф…");
  const singleGroup = await prisma.tournament.create({
    data: {
      slug: `kubok-pervokursnikov-${seasonStartYear - 1}`,
      name: "Турнир первокурсников",
      season: seasonLabel(seasonStartYear - 1),
      format: "LEAGUE",
      status: "FINISHED",
      startDate: saturdayOffsetWeeks(now, -22),
      endDate: saturdayOffsetWeeks(now, -18),
      halfDurationMin: 20,
      description:
        "Простейший формат: одна группа из шести команд, круговой турнир в один круг, победитель определяется по таблице.",
    },
  });

  const freshmenEntries = await enterTeams(singleGroup.id, SECOND_TEAMS.slice(0, 6), null);
  await playRoundRobinStage({
    tournamentId: singleGroup.id,
    divisionId: null,
    entries: freshmenEntries,
    weeksAgo: -22,
    halfDuration: 20,
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "seed",
      entity: "Database",
      entityId: "-",
      summary: "База заполнена демонстрационными данными",
    },
  });

  const counts = {
    команд: await prisma.team.count(),
    игроков: await prisma.player.count(),
    матчей: await prisma.match.count(),
    событий: await prisma.matchEvent.count(),
    пользователей: await prisma.user.count(),
  };
  console.log("\nГотово:", counts);
  console.log(`\nВход для всех тестовых аккаунтов — пароль: ${password}`);
  console.log("  admin@msu.football          — организатор");
  console.log("  referee1@msu.football       — судья");
  console.log("  captain.mehmat@msu.football — капитан «Мехмата»");
}

// ───────────────────────── Симуляция одного матча ───────────────────────────

type RosterPlayer = { id: number; position: PlayerPosition; shirtNumber: number | null };
type EntryMap = Map<string, { id: number; players: RosterPlayer[] }>;

async function playMatch(
  matchId: number,
  homeEntryId: number,
  awayEntryId: number,
  entries: EntryMap,
  options: { isLive: boolean; halfDuration: number; authorId: string },
) {
  const rosters = new Map<number, RosterPlayer[]>();
  for (const value of entries.values()) rosters.set(value.id, value.players);

  const home = rosters.get(homeEntryId)!;
  const away = rosters.get(awayEntryId)!;
  const fullTime = options.halfDuration * 2;
  const maxMinute = options.isLive ? options.halfDuration + 7 : fullTime;

  // Составы: 11 в старте (1 ВР, 4 ЗЩ, 4 ПЗ, 2 НП), остальные в запасе
  for (const roster of [home, away]) {
    const byPosition = (p: PlayerPosition) => roster.filter((r) => r.position === p);
    const starters = [
      ...byPosition("GK").slice(0, 1),
      ...byPosition("DF").slice(0, 4),
      ...byPosition("MF").slice(0, 4),
      ...byPosition("FW").slice(0, 2),
    ];
    const starterIds = new Set(starters.map((s) => s.id));
    for (const player of roster) {
      await prisma.matchLineup.create({
        data: {
          matchId,
          rosterEntryId: player.id,
          isStarting: starterIds.has(player.id),
          // Снимок номера и позиции на момент подачи состава
          shirtNumber: player.shirtNumber,
          position: player.position,
        },
      });
    }
  }

  const events: { type: MatchEventType; tournamentTeamId: number }[] = [];

  // Голы. Хозяева забивают чуть чаще — обычное преимущество своего поля.
  const homeGoals = randomInt(0, 4);
  const awayGoals = Math.max(0, randomInt(0, 4) - (chance(0.35) ? 1 : 0));

  const scorerWeights: Record<PlayerPosition, number> = { GK: 0, DF: 1, MF: 3, FW: 5 };

  async function addGoals(entryId: number, roster: typeof home, count: number) {
    for (let i = 0; i < count; i++) {
      const isOwnGoal = chance(0.04);
      const isPenalty = !isOwnGoal && chance(0.1);
      const minute = randomInt(1, maxMinute);

      // Выбор автора с учётом позиции
      const pool = roster.flatMap((p) => Array(scorerWeights[p.position]).fill(p));
      const scorer = pool.length ? pick(pool) : roster[0];
      const assistant =
        !isOwnGoal && !isPenalty && chance(0.55)
          ? roster.filter((p) => p.id !== scorer.id)[randomInt(0, roster.length - 2)]
          : null;

      const type: MatchEventType = isOwnGoal
        ? "OWN_GOAL"
        : isPenalty
          ? "PENALTY_GOAL"
          : "GOAL";

      // Автогол записывается на команду автора, а очки — сопернику
      const teamOfEvent = isOwnGoal
        ? entryId === homeEntryId
          ? awayEntryId
          : homeEntryId
        : entryId;
      const rosterOfEvent = isOwnGoal ? (entryId === homeEntryId ? away : home) : roster;
      const actualScorer = isOwnGoal ? pick(rosterOfEvent.filter((p) => p.position !== "GK")) : scorer;

      await prisma.matchEvent.create({
        data: {
          matchId,
          type,
          minute,
          tournamentTeamId: teamOfEvent,
          playerId: actualScorer.id,
          assistPlayerId: assistant?.id ?? null,
          createdById: options.authorId,
        },
      });
      events.push({ type, tournamentTeamId: teamOfEvent });
    }
  }

  await addGoals(homeEntryId, home, homeGoals);
  await addGoals(awayEntryId, away, awayGoals);

  // Карточки
  for (const [entryId, roster] of [
    [homeEntryId, home],
    [awayEntryId, away],
  ] as const) {
    const yellowCount = randomInt(0, 3);
    for (let i = 0; i < yellowCount; i++) {
      await prisma.matchEvent.create({
        data: {
          matchId,
          type: "YELLOW_CARD",
          minute: randomInt(5, maxMinute),
          tournamentTeamId: entryId,
          playerId: pick(roster).id,
          createdById: options.authorId,
        },
      });
    }
    if (chance(0.08)) {
      await prisma.matchEvent.create({
        data: {
          matchId,
          type: "RED_CARD",
          minute: randomInt(30, maxMinute),
          tournamentTeamId: entryId,
          playerId: pick(roster).id,
          createdById: options.authorId,
        },
      });
    }
  }

  // Замены — только в завершённых матчах, чтобы живой матч выглядел «в процессе»
  if (!options.isLive) {
    for (const [entryId, roster] of [
      [homeEntryId, home],
      [awayEntryId, away],
    ] as const) {
      const subs = randomInt(1, 3);
      const bench = roster.slice(11);
      for (let i = 0; i < Math.min(subs, bench.length); i++) {
        await prisma.matchEvent.create({
          data: {
            matchId,
            type: "SUBSTITUTION",
            minute: randomInt(Math.floor(fullTime / 2), fullTime),
            tournamentTeamId: entryId,
            playerId: bench[i].id,
            relatedPlayerId: roster[randomInt(1, 10)].id,
            createdById: options.authorId,
          },
        });
      }
    }
  }

  const score = scoreFromEvents(events, homeEntryId, awayEntryId);
  await prisma.match.update({
    where: { id: matchId },
    data: { homeScore: score.home, awayScore: score.away },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
